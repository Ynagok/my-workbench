# Windows built-in OCR (Windows.Media.Ocr): recognize an image into plain text on stdout (UTF-8).
# Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ocr-win.ps1 -Path <image> [-Lang zh-Hans-CN]
# No extra install needed on Windows 10/11 (engine + installed language packs).
# Exit codes: 0 ok, 2 no OCR engine, 3 failure (reason on stderr).
param([string]$Path = '', [string]$Lang = 'zh-Hans-CN', [double]$Scale = 1.0)

$ErrorActionPreference = 'Stop'
if (-not $Path) { [Console]::Error.WriteLine('no-path'); exit 3 }
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  Add-Type -AssemblyName System.Drawing

  # 小字（日历里的 12:00 F班）直接认很糊：先放大再认，识别率差很多
  $src = [System.Drawing.Image]::FromFile($Path)
  if ($Scale -ne 1.0) {
    $w = [int]([math]::Round($src.Width * $Scale))
    $h = [int]([math]::Round($src.Height * $Scale))
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($src, 0, 0, $w, $h)
    $g.Dispose()
    $src.Dispose()
    $scaledPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), 'ocr-win-' + [guid]::NewGuid().ToString('N') + '.png')
    $bmp.Save($scaledPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $Path = $scaledPath
  } else {
    $src.Dispose()
  }

  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
  function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
  }

  [void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  [void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
  [void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  [void][Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

  $engine = $null
  try { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($Lang)) } catch { $engine = $null }
  if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
  if (-not $engine) { [Console]::Error.WriteLine('no-ocr-engine'); exit 2 }

  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  foreach ($line in $result.Lines) { Write-Output $line.Text }
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 3
}
