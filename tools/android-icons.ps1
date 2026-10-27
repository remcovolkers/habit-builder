# Maakt de launcher-iconen van de Android-app uit icons/icon-maskable-512.png (Windows PowerShell, System.Drawing).
# Gebruik: powershell -File tools/android-icons.ps1
# - ic_launcher_foreground.png: het maskable-icoon op 90% van het 108dp-vlak; het zichtbare deel (de middelste 72dp) valt er helemaal binnen
# - ic_launcher.png en ic_launcher_round.png: de oude vormen voor Android 7 (API 24-25), vierkant respectievelijk rond
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$source = [System.Drawing.Image]::FromFile((Join-Path $root 'icons/icon-maskable-512.png'))
$res = Join-Path $root 'android/app/src/main/res'
$densities = @{ mdpi = 1.0; hdpi = 1.5; xhdpi = 2.0; xxhdpi = 3.0; xxxhdpi = 4.0 }

function New-Canvas([int]$size) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

foreach ($name in $densities.Keys) {
  $scale = $densities[$name]
  $dir = Join-Path $res "mipmap-$name"

  $full = [int][math]::Round(108 * $scale)
  $inner = [int][math]::Round($full * 0.9)
  $offset = [int][math]::Round(($full - $inner) / 2)
  $canvas = New-Canvas $full
  $canvas.Graphics.DrawImage($source, $offset, $offset, $inner, $inner)
  $canvas.Bitmap.Save((Join-Path $dir 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)

  $legacy = [int][math]::Round(48 * $scale)
  $square = New-Canvas $legacy
  $square.Graphics.DrawImage($source, 0, 0, $legacy, $legacy)
  $square.Bitmap.Save((Join-Path $dir 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)

  $round = New-Canvas $legacy
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(0, 0, $legacy, $legacy)
  $round.Graphics.SetClip($path)
  $round.Graphics.DrawImage($source, 0, 0, $legacy, $legacy)
  $round.Bitmap.Save((Join-Path $dir 'ic_launcher_round.png'), [System.Drawing.Imaging.ImageFormat]::Png)
}
$source.Dispose()
Write-Output 'Iconen geschreven.'
