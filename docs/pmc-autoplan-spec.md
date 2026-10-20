# 生管物料订单工作台 · 实现规范（含「按设定自动排产」）

> 版本 **v2.0**　整理日期 2026-10-17　用途：**交付给 AI / 程序员照此实现**，不需要再问口径。
> 现状：`public/pmc.html`（单文件临时工具）已实现 §3–§5、§7、§8 的一部分；**§6 自动排产是本文件新增的核心，尚未实现**。
> 文中所有"已确认"= 用户明确说过；"待确认"= 见 §13，实现时**按默认值做，但参数要留可配**。

---

## 0. 这份文档怎么用

1. 先读 §1 §2（业务口径），**口径不能自己发明**。
2. 数据从 §3 的 Excel 版式来，参数见 §4。
3. 引擎按 §5 实现，自动排产按 §6 实现（伪代码可直接翻成代码）。
4. 用 §9 的用例做单测，必须逐条对上；用 §10 做回归。
5. §13 里没定的，写参数、给默认值，**不要写死**。

---

## 1. 背景与目标

汽车内饰零部件厂的 **生管 / PMC**，每周拿到客户订单变化，要重算所有物料的用量、库存消耗、到货时间、下单数量。现状是手工维护一张巨复杂的《H93A 主料计划》Excel（21 张月度表、每表 1300 行、每车型几十条材料），**每次调表约 3 个工作日**。

目标：把"算+排"自动化，**压缩到 0.5 天**：

1. 读公司主表 → 逐日库存推演 → 缺口日 / 建议下单量 / 建议下单日；
2. **按用户设定的参数，自动排出整套到货计划（哪些批次哪天到、哪天加工完、哪天订货）**；
3. 保护"已经在路上的批次"（在途锁定）——只能改后面的；
4. 按供应商拆分导出，能直接发给供应商；结果能对照回填公司主表。

**不改公司原表**（只读 + 导出新文件）。

---

## 2. 术语与已定口径（不可自行改动）

| 术语 | 定义 | 说明 |
|---|---|---|
| 基准日 `T` | 生管"今天"（收到新预测那天） | 页面上的「基准日」；默认取表内第一天，实际用当天 |
| 月初库存 `initStock` | 主表「库存」行首格 | 当月起点 |
| 需求 `demand[d]` | 主表「需求 / 生産必要数」行 | 客户订单 × 单耗（表里已算好） |
| 触发线 `K` | `SNP × 保留倍数` | 保留倍数 1 或 2 |
| 缺料日 `S` | 第一个 **日末理论库存 < K** 的日期 | 注意是 `<` 不是 `≤` |
| 缺口天数 `gapDays` | 每条材料独立配置（如 7/10/14） | 一次下单要覆盖的天数 |
| 覆盖区间 | `[S, S + gapDays − 1]` | 超出表尾要截断并标记 |
| 覆盖需求 `coverDemand` | 覆盖区间内需求合计 | |
| 到货库存 `stockAtA` | **到货日当天日末**的库存（不含本次新批次） | 用于算下单量 |
| 建议下单量 `Q` | `coverDemand + K − stockAtA` → 向上取整到包装倍数 → 不足 MOQ 提到 MOQ；`Q ≥ 0` | |
| 提前期 `leadTime` | **下单 → 到货**的自然天数 | |
| 到货日 `A` | 材料到厂那天 | 见 §6.4 |
| 加工周期 `procDays` | **到货后还要加工的工作日数**，**到货当天不算，从次日开始数**；与数量无关、不分批次 | 材料不同则不同 |
| 加工完成日 `readyDate` | `A` 之后数 `procDays` 个工作日 | `ready ≤ S` 才能接上缺口 |
| 送货周期 `transitDays` | **发车/在途锁定窗口**（自然天）：到货日 ≤ `T + transitDays` 的批次已在路上 | 判定"能不能改"用 |
| 工作日 | 周一~周五，且不在节假日清单里 | 节假日可手填 |
| 自提 | 只能 **周一 / 周四** 下单（可配），到货日 = 下单日 + `leadTime` | |
| 集中送货 | 同普通，但下单量受 MOQ 约束 | |

**两条硬规则（用户反复强调）**

1. **到货日不能等于缺料日**：必须留出加工周期，即 `readyDate ≤ 缺料日`。
2. **材料在路上就动不了**：到货日 ≤ `T + transitDays` 的批次**视为已发车，不能改期、不能改量**；只能调整其后的批次，或新下单。

**数量口径不变**：下单量只按"覆盖需求 + 触发线 − 缺料日/到货日库存"算，**与加工周期、提前期无关**。

---

## 3. 输入数据

### 3.1 公司主表（xlsx，浏览器端或服务端解析均可）

实测版式（21 张月度表，`26.6` 这种命名）：

- **列映射**：`0=NO 1=物料名/車種 2=颜色/规格 3=项目 4=小计/月初库存 5..35=1..31日 36..=附注/供应商`
- **表头行** = 第一行含 Excel 日期序列号（`40000~60000`）的行；日期 = 序列号 + i（`46174` = 2026-06-01）
- **材料块**：从「项目」列是 `需求` / `生産必要数` 的行开始，往后收集到下一个 `需求` 行之前；块内的行标签：
  - `需求` / `生産必要数` → 每日需求
  - `订单` / `納入指示数` → **已下的到料计划**（按日）
  - `实际` / `納入実績数` → 实际到货（可选，用于对账）
  - `库存` / `在庫` → 月初库存（首格）+ 原表日末库存（对照用）
  - `进度` / `進度` / `累計` → 物料真实名称所在行
- **SNP**：块内任意格出现 `SNP 180` / `SNP 1000` 这类文字 → 取数字
- **供应商**：块内 `（馨源）` 这类括号内容；否则查附注列（idx 36..46）里的已知供应商名；再否则查块内 idx1 的短文本
- 一个表里可能有**两段不同版式**（`需求/订单/实际/进度/库存` 与 `生産必要数/累計/…/在庫`），同一套规则都要吃得下

> ⚠️ 实测坑（已踩过）：**「订单」「实际」也必须算作块内行**，否则 `SNP 180` 那格收不进来（命中率 72/83 vs 9/83）。

**降级**：解析失败要给出人话原因（"没找到含日期序列号的表头行"），不要静默返回空。

### 3.2 粘贴导入（备用通道）

TSV/CSV，表头认这些列名（可带括号）：`物料编码/物料名称/车型/供应商/月初库存/SNP/保留倍数/缺口天数/提前期/加工周期/送货周期/运输方式/MOQ/包装倍数/到货计划`，其余按日期列（`2026-06-01` 或 `6/1`）读需求。

`到货计划` 列写法：`2026-06-15:1000;2026-06-22:2000`（也吃 `6/15=1000`）。

### 3.3 数据模型

```ts
type Material = {
  id: string;                    // 物料编码（M001…）
  name: string;                  // 物料名称（可能很长，如「H93AS （馨源）腿托 180*1.55*0.0055」）
  scope: string;                 // 车型/规格（如「FR30-4.5T*1430MM 灰色 140±20N」）
  supplier: string;              // 供应商，空 → '未指定'
  initStock: number;
  demand: number[];              // 与 dates 等长
  excelStock?: (number|null)[];  // 原表「库存」行，仅对照用
  snp: number;                   // 0 表示表里没写
  mult: 1|2;
  gapDays: number;
  leadTime: number;
  procDays: number;              // 工作日
  transitDays: number;           // 在途锁定（自然天）
  transport: 'normal'|'self'|'consol';
  moq: number;
  pack: number;
  arrivals: { date: string; qty: number }[];   // 已下的到料计划（来自主表「订单」行）
  status: '待确认'|'已确认'|'已下单';
};
type Version = { key: string; dates: string[] /*31*/; materials: Material[] };
```

**参数按「`scope + '|' + name`」认人** —— 下个月重新导入同一批材料，手改过的参数要能认回来（存本机 `localStorage`，服务端版存库）。

---

## 4. 参数体系（用户可设定）

作用域优先级：**material > supplier > global**（本期实现 material+global 即可，supplier 层预留）。

| 参数 | key | 默认 | 范围 | 作用 |
|---|---|---|---|---|
| 保留倍数 | `mult` | 1 | 1/2 | 触发线 |
| 缺口天数 | `gapDays` | 7 | 1~60 | 覆盖区间 |
| 提前期 | `leadTime` | 3 | 0~60 | 下单→到货 |
| 加工周期 | `procDays` | 0 | 0~90 | 到货→可用（工作日） |
| 送货周期 | `transitDays` | 3 | 0~90 | 在途锁定窗口 |
| 运输方式 | `transport` | normal | normal/self/consol | 下单日约束 |
| MOQ | `moq` | 0 | ≥0 | 起订量 |
| 包装倍数 | `pack` | 1 | ≥1 | 取整倍数 |
| 自提可下单日 | `selfOrderDays` | `[1,4]` | 周几数组 | 1=周一 4=周四 |
| 节假日 | `holidays` | `''` | `2026-06-19` / `06-19` 逗号分隔 | 工作日判定 |
| 纯普通单是否限工作日下单 | `orderOnWorkday` | false | bool | 见 §13-1 |
| 可调批次是否允许自动挪 | `allowFlexMove` | true | bool | §6.5 |
| 可调批次策略 | `flexPolicy` | `nearest` | none/nearest/aggregate | §6.5 |
| 每段缺口最多生成批次 | `maxBatchesPerEpisode` | 1 | 1~3 | 防一天一单 |

**必须可编辑**：① 下单建议表里逐行改；② 「参数」页设默认值并"套到全部材料"。

---

## 5. 核心引擎（纯函数，无 DOM）

### 5.1 工作日工具

```ts
isHoliday(iso): boolean                     // 精确日 或 MM-DD 都认
isWorkday(iso): boolean                     // 非周六日 && 非节假日
isOrderWeekday(iso, days): boolean          // 命中 selfOrderDays 且非节假日
backWorkdays(iso, n): string                // 从 iso 往前退 n 个工作日（结果必为工作日；n=0 返回 iso）
addWorkdays(iso, n): string                 // 从 iso 往后数 n 个工作日（次日算第 1 天）
addDays(iso, n): string                     // 自然天
```

### 5.2 单材料推演（只看消耗）

```
stock = initStock
for d in dates:
  stock -= demand[d]
  daily[d] = { demand, stock }            // stock = 日末理论库存
  if 缺料日未定 and stock < K: 缺料日 S = d
```
> 不含到货 —— 这一层只回答"什么时候开始不够"。到货在 §6 里参与推演。

### 5.3 建议计算

```
if 无 S: 返回 无预警
coverEnd   = min(表尾, S + gapDays − 1);   truncated = 覆盖区间越界
coverDemand = Σ demand[S..coverEnd]
stockAtS   = daily[S].stock
Q = max(0, coverDemand + K − stockAtS)
Q = ceilTo(Q, pack)                       // 不足 MOQ 再提到 MOQ
A = backWorkdays(S, procDays)             // 最晚到货日（加工完正好接上）
readyDate = addWorkdays(A, procDays)
D = A − leadTime                          // 订货日；自提/工作日吸附见 §6.4 ③（先算 D_max 再吸附）
```

> §5 只是"单次建议"口径（页面 ① 下单建议用的就是它）；**算出成套排程要用 §6 的 planner**，两者在"自提/工作日/多批次"上结果会不同。

### 5.4 到货计划注解

```
L = T + transitDays                       // 锁定线
每个批次: locked = (date ≤ L) ; past = (date < T)
lockedQty / flexQty 分别合计
lockedBeforeNeed = Σ{ locked 且 date ≤ A } 的数量
```

### 5.5 状态机（用于页面与导出）

| state | 条件 | 页面文案 |
|---|---|---|
| `past` | `S < T` | ⏱ 已进入缺口（缺口日已过） |
| `covered` | `lockedBeforeNeed ≥ Q` | 在途已覆盖，不用再下单 |
| `late` | `A < 最早可到货日`（见 §6.4） | ⚠ 来不及 |
| `flex-earlier` | `A` 可满足，但有可调批次晚于 `A` | 可把后面批次提前 |
| `intime` | 其余可下单情形 | 还能下单调整 |
| `none` | 无缺料 | 不预警 |

---

## 6. 自动排产 planner（**新，核心**）

### 6.1 目标与不变量

**目标**：给定材料 + 参数 + 已有到料计划 + 基准日 `T`，输出**一整套排程**：每个批次（新建/沿用）的 `订货日 D、到货日 A、加工完成日 R、数量 Q、覆盖哪段缺口`，并标出**无法覆盖的缺口期**。

**不变量（实现后必须始终成立，写进单测）**

1. **锁定不变性**：`arrival ≤ T + transitDays` 的已有批次，`date`/`qty` **不得被修改**（只能在展示上标"在途·锁定"）。
2. **加工不变量**：每个新批次满足 `R = addWorkdays(A, procDays) ≤ S`；若不可达，明确标 `late` 并给出缺口期（不许悄悄放宽）。
3. **订货日约束**：`D ≥ T`（不能给过去下建议）；`transport='self'` 时 `D` ∈ 周一/周四（且非节假日）；`orderOnWorkday=true` 时所有 `D` 必须是工作日。
4. **数量约束**：`Q` 是 `pack` 的整数倍、`≥ moq`、`≥ 0`。
5. **确定性/幂等**：同一输入连跑两次结果**逐字节一致**；不许依赖 `Date.now()`（`T` 必须显式传入）。
6. **单调性**：`T` 往后挪，锁定批次只会变多，不会变少。

### 6.2 输入 / 输出

```ts
type PlanInput = {
  material: Material;
  dates: string[];
  today: string;                     // 基准日 T
  holidays?: string[];
};

type Batch = {
  kind: 'locked' | 'flex' | 'new' | 'rescue';
  orderDate: string;                 // 订货日（locked 批次可为空）
  arrivalDate: string;               // 到货日
  readyDate: string;                 // 加工完成日
  qty: number;
  coversShortage?: string;           // 对应缺料日
  state: 'intime' | 'late' | 'covered' | 'past' | 'flex-earlier' | 'none';
  note: string;                      // 一句话，可直接给供应商/自己看
};

type PlanResult = {
  batches: Batch[];
  shortages: { date: string; from: string; to: string; coveredBy: Batch|null; lateDays: number }[];
  earliestArrival: string;           // T + leadTime
  lockLine: string;                  // T + transitDays
  totalQty: number;
  needsAction: boolean;
};
```

### 6.3 主流程（逐日 + 缺口段）

```js
function planMaterial(m, dates, T) {
  const K = m.snp * m.mult;
  const L = addDays(T, m.transitDays);          // 锁定线（只管"已有批次能不能改"）
  const A_min = earliestArrival(m, T);          // 最早可到货日，见 §6.4 ④

  // ① 批次表：已有计划按锁定线切成 locked / flex
  let batches = m.arrivals.map(a => ({
    ...a,
    kind: a.date <= L ? 'locked' : 'flex',
    locked: a.date <= L,
    past: a.date < T,
  })).sort(byDate);

  // ② 推演用库存表（含到货）
  const arrivalsByDate = groupBy(batches, 'date', sum('qty'));
  const stock = [];
  let s = m.initStock;
  for (let i = 0; i < dates.length; i++) {
    s += arrivalsByDate[dates[i]] || 0;
    s -= m.demand[i] || 0;
    stock[i] = s;
  }

  // ③ 逐日扫缺口段
  const out = [];
  let i = 0;
  while (i < dates.length) {
    if (stock[i] >= K) { i++; continue; }

    const S = dates[i];                          // 缺口日
    // 同一段连续缺口只处理一次（避免一天一单）
    let end = i;
    while (end + 1 < dates.length && stock[end + 1] < K) end++;

    const need = computeNeed(m, dates, i, stock[i], K);   // {A, Q}
    let batch;

    if (S < T) {
      // 缺口日已过去：只能看已有在途 + 加急
      batch = makeRescueOrCovered(...);          // 见 §6.4-⑤
    } else if (need.A < A_min) {
      // 来不及：需要到货日比"今天下单最快到"还早
      batch = makeLate(m, dates, i, L, A_min, need, K);
    } else {
      // 正常：先看锁定期内是否已够（covered），否则新单
      const inTransit = sumLockedUpTo(batches, need.A);
      batch = inTransit >= need.Q ? makeCovered(...) : makeNew(m, dates, i, need, K);
    }

    if (batch) { batches.push(batch); out.push({S, ...batch}); startHere = batch.arrivalIndex ... }

    // ④ 把新批次灌进库存表，从批次到货日/完成日之后继续扫
    applyBatch(stock, dates, batch);
    i = Math.max(i + 1, indexOfDate(batch.readyDate) + 1);
  }

  // ⑤ 可调批次的再利用（§6.5）在最后统一做，避免和新建批次打架
  if (m.allowFlexMove) batches = rebalanceFlex(batches, ...);

  return { batches, shortages: out, earliestArrival: A_min, lockLine: L, ... };
}
```

**每一步的选择顺序（固定，别改）**：
`past`（缺口日已过）→ `covered`（在途够）→ `late`（来不及）→ `intime`（新单）→ `flex-earlier`（挪可调批次代替新单）。

### 6.4 批次生成规则

**① 需要的最晚到货日 `A`**

```
A = backWorkdays(S, procDays)        // 加工周期按工作日回退
R = addWorkdays(A, procDays)         // 校验 R ≤ S
```

**② 数量 `Q`**

```
coverEnd = min(表尾, S + gapDays − 1)
coverDemand = Σ demand[S..coverEnd]
stockAtA = 到货日当天日末库存（含已有 locked/flex，不含本批次）
Q = max(0, coverDemand + K − stockAtA)
Q = ceilTo(Q, pack); if (Q < moq) Q = moq
```

**③ 订货日 `D`** —— 先算「最晚可行订货日」，再吸附到可下单日：

```
A_need = backWorkdays(S, procDays)          // 最晚到货日（加工完正好接上）
D_max  = A_need − leadTime                  // 最晚订货日（自然天回退）

D = D_max
if (transport === 'self'){                  // 自提：只能周一/周四（且非节假日）
    D = 最后一个 ≤ D_max 的 selfOrderDays 日
    if (D < T) D = 从 T 往后第一个 selfOrderDays 日      // 往前会落到过去 → 只能等下一个
}
if (orderOnWorkday && transport !== 'self') // 可选开关，默认 false
    D = 最后一个 ≤ D_max 的工作日

A = D + leadTime                            // 到货日由订货日反推
R = addWorkdays(A, procDays)                // 加工完成日
```

**④ 只对"新单"的可行性判定（**修正项**，见 §12-③）**

```
可行 ⇔ R ≤ S
```

> 判定用「加工完成日不晚于缺料日」，**不要**用 `A > T + transitDays` 或 `A ≥ T + leadTime` 这类日期比较：
> ① 提前期 = 送货周期时，`A` 正好落在锁定线上（例：T=6/16、提前期 3 → `A=6/19=L`），按旧写法会误判成"来不及"，实际今天下单 6/19 就能到；
> ② 自提的可用订货日不连续，"能否赶上"只能由 `D + lead + proc ≤ S` 来判断。
> 锁定线 `T + transitDays` 只用来判断**已有批次能不能改期**，与"新单能不能赶上"是两件事。

**最早可到货日 `A_min`（只用于"来不及"时给补救建议与页面展示，不参与可行性判定）**

```
normal / consol : A_min = T + leadTime
self            : A_min = nextOrderDay(T) + leadTime      // 今天不是周一/周四 → 下一个可下单日
```

**⑤ `late` 时的补救批次**

```
A_earliest = A_min（最早能到）
R_earliest = addWorkdays(A_earliest, procDays)
缺口期 = [S, R_earliest − 1] 与"有需求的日子"取交（周末需求为 0 自然跳过）
rescue 批次: { kind:'rescue', A:A_earliest, D:最早可下单日, Q:(Q − lockedBeforeNeed) 取整, state:'late',
               note: '来不及：需要 X 到货，已落进送货周期；最早 Y 到、Z 加工完，缺口 N 天' }
```

**⑥ `past`（缺口日已过）**：不动新批次，输出 `state:'past'` + 缺口期 + "只能靠已有在途（列出具体批次）+ 加急"。

### 6.5 可调批次（flex）的自动再利用

三个策略（`flexPolicy`，默认 `nearest`）：

| 策略 | 行为 |
|---|---|
| `none` | 只新增，不动可调批次 |
| `nearest` | 若某可调批次的到货日晚于某次需要的 `A`，且 `A ≥ A_min`，则**建议提前**到 `A`（数量保持不变或按需调整；改量要满足 pack/MOQ） |
| `aggregate` | 在 `nearest` 基础上，把同一材料相邻 7 天内的可调批次**合并成一批**（减少批次数，便于集中送货） |

约束：
- 可调批次提前后的到货日必须 `> L`（≤ L 就成了"在途"，物理上来不及）且 `≥ A_min`。
- 被挪动的批次要在 `note` 里写清"原 6/22 · 1000 → 提前到 6/16"。
- **`locked` 批次永远不动**。

### 6.6 已有批次怎么参与推演

- `locked`：按原日期原数量计入 `arrivalsByDate`（不动）。
- `flex`：先按原日期原数量计入；若 `flexPolicy` 后来挪动，需**重跑一次推演**（实现上：先跑一遍得到建议，再做一次 `applyBatch` 修正库存；或用两阶段：先生成 → 再 rebalance → 再 final roll，取 final 为准）。
- `past` 批次（日期 < T）：视为**历史事实**，只参与"已过"统计，不影响未来库存（或按配置 `pastAffectsStock=false`）。

### 6.7 边界与异常（全部要处理，且有单测）

| # | 情况 | 处理 |
|---|---|---|
| 1 | 覆盖区间超出表尾 | `truncated=true`，`note` 写"需下月表确认"，数量仍按表内需求算 |
| 2 | `A` 早于表内第一天 | 标"表外"，不出批次（或按需扩日期范围） |
| 3 | 需求全 0 | 不出批次，`state:'none'` |
| 4 | `snp = 0` | `K = 0`，缺口 = 首次 `stock < 0` |
| 5 | `initStock` 为负 | 缺料日 = 第 1 天，正常走 `past/late` 逻辑 |
| 6 | 加工周期跨周末/节假日 | 一律按工作日回退，`R` 重新校验 |
| 7 | `moq > 需求` | 提到 MOQ 并在 `note` 写"按 MOQ 起订，多备 X" |
| 8 | `pack > 1` 且 `Q = 0` | 不出批次（避免 0 量订单） |
| 9 | 自提的 1/4 全部落在节假日前 | 继续往前/往后找，找不到（>14 天）→ `late` 并提示 |
| 10 | 同一材料同时有 locked + flex + new | 按日期排序后统一推演，`note` 里标明来源 |
| 11 | 表内只有 31 天但加工/提前期跨到下月 | 允许越界计算，标注即可 |

### 6.8 复杂度

材料数 `N` × 天数 `D`，每次扫描 O(D)，缺口段最多 D/7 个 → O(N·D)（两个数量级都很小）。实测目标：**500 条材料 × 90 天 < 200 ms**（纯前端也够用）。

---

## 7. 输出与导出

### 7.1 到货排程表（自动排产的主产出）

| 物料 | 供应商 | 批次号 | 批次性质 | 订货日 | 到货日 | 加工完成日 | 数量 | 覆盖缺口日 | 状态 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|

- `批次性质`：在途·锁定 / 可调 / 新增 / 补救 / 已覆盖
- 按**到货日**升序，同一天按供应商再按物料排序

### 7.2 订货计划表（发给供应商用）

按 `订货日` 分组：`订货日 | 供应商 | 物料编码 | 物料名称 | 数量 | 单位 | 要求到货日 | 加工完成日`
每个供应商一个 CSV（Sheet 名截断 28 字符、去特殊字符）。

### 7.3 缺口期表

`物料 | 缺口起 | 缺口止 | 天数 | 为什么没覆盖（来不及/已过/表外） | 建议动作（加急/压需求/接受）`

### 7.4 回填主表说明

工具**只读**主表（PRD 方案 A）。导出结果对照回填位置：
- 到货计划 → 每个材料块的 `订单 / 納入指示数` 行（按日期列）
- 实际到货 → `实际 / 納入実績数` 行
- 不修改任何公式/合并单元格（如做模板回填，用 `openpyxl` 打开模板 → 只写数据区 → 另存）。

CSV 编码：**UTF-8 with BOM**，逗号分隔，`\r\n` 换行（Excel 双击直接正确）。

---

## 8. UI 结构（页面与交互）

### 8.1 页面（建议 6 个 tab）

1. **下单建议**：KPI（材料数/需求合计/要下单条数/最早缺口/建议量合计/7 天内该下单）+ 表格（每行可改参数，改完即时重算）+ 筛选（供应商/只看要下单/搜索）。
2. **到货计划 / 调整建议**：KPI（已进入缺口 / 来不及 / 在途已覆盖 / 还能下单 / 可提前 / 锁定批次数 / 可调批次数）+ 每材料一行（批次 chip 带"在途·锁定/可调"）+ 每行可改送货周期。
3. **自动排产（新）**：`[⚙️ 参数] [▶ 生成排程]` → 到货排程表 + **时间轴甘特**（每天一列，批次块按性质着色：红=锁定、黄=可调、绿=新增、灰虚=补救）+ 冲突列表 + `[导出订货计划] [导出到货排程]`。
4. **逐日明细**：柱状图（日末库存、触发线、覆盖区间、到料 `▼数量`）+ 表格（需求/日末库存/原表库存/到料计划/该批能不能改/标记）。
5. **两版趋势对比**：加单/减单/保持（阈值可配）。
6. **参数 / 数据导入**：默认参数、节假日、粘贴导入、xlsx 导入、JSON 备份。

### 8.2 交互要点

- 参数改完 **≤1s** 重算（本地纯 JS 直接够）。
- 颜色语义固定：**红=缺口/在途锁定**、**黄=覆盖区间/可调**、**绿=在途已覆盖/已确认**。
- 大批量表格要有**虚拟滚动**（500 行 × 20 列）。
- 生成的排程**可逐条手动覆盖**（锁定/解锁/改量/改日），手动改过的加 `manual` 标记，重跑排产时**默认保留手动值**（`respectManual=true`）。

---

## 9. 验收用例（可直接写成单测；数字已手算）

统一约定：表内日期 `2026-06-01(周一) … 2026-07-01`；`K = snp × mult`；周五=6/19。

### 用例 A：平铺需求 → 连续自动排产（3 批）

```
输入: initStock=1000, snp=200, mult=1(K=200), gapDays=7, pack=1, moq=0,
      demand=6/1 起每天 100, procDays=0, leadTime=3, transitDays=3, normal, T=2026-06-01
期望:
  S1=6/9   A=6/9  D=6/6  Q=700+200−100=800
  S2=6/17  A=6/17 D=6/14 Q=800
  S3=6/25  A=6/25 D=6/22 Q=800
  之后到 7/1 库存最低 300 ≥ 200 → 无更多批次
  批次性质全为 new；状态 intime
```

### 用例 B：加工周期（到货日 ≠ 缺料日）

```
缺料 S=2026-06-19(周五), procDays=3
期望: A = 6/16(周二)（往前退 3 个工作日）, R = addWorkdays(6/16,3) = 6/19 = S
      提前期 3 → D = 6/13(周六)（普通运输允许；若 orderOnWorkday=true 则 D=6/12(周五)）
```

### 用例 C：在途锁定（用户的原始场景）

```
T=2026-06-16(周二), transitDays=3 → 锁定线 L=6/19(周四)
已有到料: 6/17 · 500（周三，已在路上）, 6/22 · 500（可调）
期望: 6/17 批 = locked（不得改动）；6/22 批 = flex
```

### 用例 D：自提把订货日推到过去 → 只能等下一个周一/周四 → 来不及

```
T=2026-06-23(周二), leadTime=2, transport=self(周一/周四), procDays=0, S=2026-06-26(周五)
推导:
  A_need = 6/26;  D_max = 6/26 − 2 = 6/24(周三)
  自提吸附: 最后一个 ≤ 6/24 的 1/4 日 = 6/22(周一) → 但 6/22 < T，不可用
            → 从 T 起第一个 1/4 日 = 6/25(周四) → D = 6/25
  A = 6/25 + 2 = 6/27(周六);  R = 6/27 > S(6/26) → 不可行
期望: state=late；补救批次 A=6/27、D=6/25；缺口期 = 6/26 一天
```

### 用例 E：在途已覆盖（不用再下单）

```
T=6/15, L=6/18, S=6/17, Q=300, 锁定批 6/16·500
期望: lockedBeforeNeed(500) ≥ Q(300) → state=covered，新单 Q=0
```

### 用例 F：`A` 正好落在锁定线上（§6.4 ④ 的修正点）

```
T=2026-06-16(周二), leadTime=3, transitDays=3 → L=6/19(周四)
S=2026-06-19(周五), procDays=0
推导: A_need = 6/19;  D_max = 6/19 − 3 = 6/16 = T;  A = 6/19 = L;  R = 6/19 ≤ S ✓
期望: state=intime（今天下单、6/19 到），D=6/16
      ⚠ 若按"A > L"判定会错判成 late —— 这是现版本要修的偏差
```

### 用例 G：数量取整

```
Q 原值 812, pack=50, moq=1000 → Q = 1000（先按 pack 取整到 850，再被 MOQ 提到 1000）
Q 原值 812, pack=50, moq=0    → Q = 850
Q 原值 −30 → Q = 0，不出批次
```

### 用例 H：真实表回归（端到端）

```
输入: 公司《H93A主料计划》26.6 表
期望: 解析出 83 条材料；SNP 命中 72 条；到料计划命中 30 条（这些是当前实测基线，改动导入逻辑后必须重新对账）
```

---

## 10. 测试清单

| 层 | 内容 | 基线 |
|---|---|---|
| 单测：日期工具 | `backWorkdays`/`addWorkdays` 跨周末、跨节假日、n=0、n 大 | 见 §9-B/F |
| 单测：引擎 | 缺料日、覆盖区间截断、Q 取整+MOQ、状态机 6 态 | §9 A–G |
| 单测：planner | 3 批连续排产、锁定不变性、幂等（跑两次一致）、`T` 单调性 | §9 A/C |
| 单测：解析 | 迷你主表 → 1 条材料（SNP/库存/需求/供应商/到料计划）；真实 xlsx → 83 条 | §9 H |
| 集成 | 页面加载无未捕获异常；6 个 tab 可切；改参数即时重算并落本机 | — |
| 回归 | 每次改动后跑全量；**断言数量与本文档一致**（改断言必须同步改文档） | — |

> 现有的 `tools/smoke-pmc.cjs`（123 项）已覆盖 §5 + 导入；实现 §6 后**新增 ≥ 20 项**（A/C/F 三个用例 + 幂等 + 锁定不变性 + 导出列）。

---

## 11. 实现建议

### 11.1 仓库内（本期，单文件）

- 文件：`public/pmc.html`（内联 CSS + JS，零依赖、零请求、数据只进 `localStorage['pmcWorkbench_v1']`）。
- 结构建议：`state` / `dates` 工具 / `engine`（纯函数）/ `planner`（纯函数）/ `render*` / `events` / `import`。
- 所有算法函数**保持纯**（入参显式包含 `today`），这样能被 Node 直接 `require`/import 做单测。

### 11.2 生产版（Render，按 PRD）

```
浏览器（Vue3 + Element Plus + ECharts，或继续单文件）
  ↓ HTTPS
FastAPI（Render Web Service）
  ├── /api/materials        GET/POST 材料台账
  ├── /api/versions         GET/POST 订单版本（含 demand/arrivals）
  ├── /api/plan             POST 自动排产（入参 PlanInput[]，返回 PlanResult[]）
  ├── /api/export/order     按订货日/供应商导出 CSV
  └── /api/export/arrival   到货排程导出
  ↓
PostgreSQL（materials / versions / demands / arrivals / plans / params）
```

- 排产逻辑单独一个模块 `planner.py`（纯函数，无 I/O），**前后端共用同一份 spec 与用例**。
- 导出用 `openpyxl` 以模板为底稿填充（保留公式/合并单元格），`StreamingResponse` 内存返回。
- 文件系统临时 → 上传文件内存处理、模板放仓库 `templates/`。
- 免费实例会休眠：`UptimeRobot` 保活。

### 11.3 给 AI 的提示词骨架

> 按 `docs/pmc-autoplan-spec.md` 实现。先做 §5 引擎 + §9 用例 A–H 单测（必须全绿），再加 §6 planner（先 `flexPolicy=none`，再 `nearest`），最后接 §7 导出与 §8 UI。任何一处与文档冲突，**以文档为准并回报**；需要改口径先停下来问。

---

## 12. 与现状（`public/pmc.html`）的差距

| # | 项 | 现状 | 目标 |
|---|---|---|---|
| 1 | 自动排产（§6） | ❌ 只给"单次缺口建议" | ✅ 整套到货/订货排程 |
| 2 | 可调批次自动挪动 | ❌ 只提示"可提前" | ✅ `flexPolicy` 三策略 |
| 3 | 「能不能赶上」的判定 | ⚠ 现用「到货日 > 锁定线」比较，提前期=送货周期时会少算一天 | ✅ 改成 `R ≤ S`（加工完成日不晚于缺料日，§6.4 ④） |
| 4 | 到料计划编辑 | ❌ 只能读 | ✅ 可加/删/改单批（`manual` 标记） |
| 5 | 甘特图 | ❌ 只有逐日柱状 | ✅ 批次时间轴 |
| 6 | 供应商层参数 | ❌ 只有材料/全局 | ✅ `material > supplier > global` |
| 7 | 多车型汇总 | ❌ 按表内块平铺 | ✅ 按车型分组视图（P2） |
| 8 | 历史版本/快照 | ⚠ 只比两版需求 | ✅ 周快照可回溯（P2） |

---

## 13. 待确认（实现时先按默认值，但**必须做成参数**）

| # | 问题 | 默认取值 | 影响 |
|---|---|---|---|
| 1 | 普通运输的订货日要不要也挪到工作日？ | `false`（保持现状：允许周末下单） | 订货日可能落周六日 |
| 2 | 节假日数据来源 | 手填清单 | 加工周期/自提判定 |
| 3 | "加急"是否有独立参数（比如允许突破送货周期 N 天） | 不建模型，`late` 只给建议 | 是否要算"加急可到日" |
| 4 | 多批次的合并意愿（集中送货） | `nearest`，不合并 | 批次数 vs 集中度 |
| 5 | 需求是否含 BOM/单耗（表里已摊好） | 直接用表内需求 | 是否需要 BOM 模块 |
| 6 | 回填主表要不要自动化（File System Access / 本地服务） | 只导出 | 方案 A/B vs C/D |
| 7 | 供应商是否要按物料拆分（一料多供应商） | 一对一 | 数据模型 |
| 8 | 是否需要按"车型"汇总（同一材料跨车型合并） | 表内已按块，暂不合并 | 行数/去重 |
| 9 | 趋势对比阈值 | 5% | 加/减单判定 |

---

## 附录 A：真实样例对账基线（改导入逻辑后必须复核）

- 主表 21 张月度表（24.10 … 26.6）；`26.6` 表：1331 行 × 48 列，材料块 **83** 条。
- SNP 命中 **72/83**；供应商命中 **20/83**；到料计划（订单/納入指示数 行有非零）**30/83**。
- 首条材料：`XS-A3020-HT-MV-LF-GTQ深灰 / 硬度89N / H93AS （馨源）腿托`，SNP 180，月初库存 1064.946，6/1 需求 38.84。
- `26.5`（上版）：86 条。

## 附录 B：命名约定

- 页面/JSON 字段沿用现有：`initStock / snp / mult / gapDays / leadTime / procDays / transitDays / transport / moq / pack / arrivals / demand / excelStock`
- 计算结果：`trigger / shortageDate / coverStart / coverEnd / coverDemand / stockAtArrival / orderDate / orderQty / arrivalDate / readyDate / lockLine`
- 状态：`past | covered | late | flex-earlier | intime | none`
