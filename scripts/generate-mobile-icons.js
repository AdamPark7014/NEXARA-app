#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const logoPath = path.join(repoRoot, "apps", "mobile", "app", "icon.png");
const resBase = path.join(repoRoot, "apps", "mobile", "android", "app", "src", "main", "res");

const densities = [
  { folder: "mipmap-mdpi", launcherSize: 48, foregroundSize: 108 },
  { folder: "mipmap-hdpi", launcherSize: 72, foregroundSize: 162 },
  { folder: "mipmap-xhdpi", launcherSize: 96, foregroundSize: 216 },
  { folder: "mipmap-xxhdpi", launcherSize: 144, foregroundSize: 324 },
  { folder: "mipmap-xxxhdpi", launcherSize: 192, foregroundSize: 432 },
];

function ensureLogoExists() {
  if (!fs.existsSync(logoPath)) {
    throw new Error(`Logo no encontrado: ${logoPath}`);
  }
}

function tryLoadSharp() {
  try {
    return require("sharp");
  } catch {
    return null;
  }
}

function findPowerShell() {
  for (const executable of ["pwsh", "powershell"]) {
    const result = spawnSync(executable, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
      encoding: "utf8",
      shell: false,
    });

    if (result.status === 0) {
      return executable;
    }
  }

  return null;
}

function escapePowerShell(value) {
  return value.replace(/'/g, "''");
}

async function generateWithSharp(sharp) {
  const baseOverlay = (size) => Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <radialGradient id="bg" cx="50%" cy="34%" r="84%">
          <stop offset="0%" stop-color="#1c2f40"/>
          <stop offset="56%" stop-color="#0d1521"/>
          <stop offset="100%" stop-color="#05080d"/>
        </radialGradient>
        <radialGradient id="glow" cx="46%" cy="34%" r="62%">
          <stop offset="0%" stop-color="#64c0d4" stop-opacity="0.24"/>
          <stop offset="42%" stop-color="#15a99d" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#15a99d" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.24)}" ry="${Math.round(size * 0.24)}" fill="url(#bg)"/>
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.24)}" ry="${Math.round(size * 0.24)}" fill="url(#glow)"/>
      <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${Math.max(1, Math.round(size * 0.24) - 1)}" ry="${Math.max(1, Math.round(size * 0.24) - 1)}" fill="none" stroke="url(#edge)" stroke-width="2"/>
      <ellipse cx="${Math.round(size * 0.42)}" cy="${Math.round(size * 0.14)}" rx="${Math.round(size * 0.28)}" ry="${Math.round(size * 0.09)}" fill="#ffffff" opacity="0.06"/>
    </svg>
  `);

  const roundedMask = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.24)}" ry="${Math.round(size * 0.24)}" fill="white"/></svg>`);
  const circleMask = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);

  async function renderCanvas(size) {
    const inset = Math.round(size * 0.11);
    const logoSize = size - inset * 2;
    const logoBuffer = await sharp(logoPath)
      .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: baseOverlay(size) },
        { input: logoBuffer, left: inset, top: inset },
      ])
      .png()
      .toBuffer();
  }

  for (const density of densities) {
    const dir = path.join(resBase, density.folder);
    fs.mkdirSync(dir, { recursive: true });

    const foreground = await renderCanvas(density.foregroundSize);
    await sharp(foreground).png().toFile(path.join(dir, "ic_launcher_foreground.png"));

    const launcher = await renderCanvas(density.launcherSize);
    await sharp(launcher)
      .composite([{ input: await sharp(roundedMask(density.launcherSize)).png().toBuffer(), blend: "dest-in" }])
      .png()
      .toFile(path.join(dir, "ic_launcher.png"));

    await sharp(launcher)
      .composite([{ input: await sharp(circleMask(density.launcherSize)).png().toBuffer(), blend: "dest-in" }])
      .png()
      .toFile(path.join(dir, "ic_launcher_round.png"));

    console.log(`  OK ${density.folder}`);
  }
}

function generateWithPowerShell() {
  const powershell = findPowerShell();
  if (!powershell) {
    throw new Error("No se encontro pwsh ni powershell para generar iconos.");
  }

  const script = `
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$logoPath = '${escapePowerShell(logoPath)}'
$resBase = '${escapePowerShell(resBase)}'
$densities = ConvertFrom-Json @'
${JSON.stringify(densities)}
'@

function New-RoundedPath {
  param([float]$Size, [float]$Radius)
  $diameter = $Radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
  $path.AddArc($Size - $diameter, 0, $diameter, $diameter, 270, 90)
  $path.AddArc($Size - $diameter, $Size - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc(0, $Size - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Canvas {
  param([int]$Size)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $radius = [float]($Size * 0.24)
  $path = New-RoundedPath -Size $Size -Radius $radius

  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF -ArgumentList 0, 0),
    (New-Object System.Drawing.PointF -ArgumentList $Size, $Size),
    ([System.Drawing.Color]::FromArgb(255, 28, 47, 64)),
    ([System.Drawing.Color]::FromArgb(255, 5, 8, 13))
  )
  $g.FillPath($bgBrush, $path)

  $glowRect = New-Object System.Drawing.RectangleF -ArgumentList ($Size * 0.16), ($Size * 0.10), ($Size * 0.68), ($Size * 0.68)
  $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glowPath.AddEllipse($glowRect)
  $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
  $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(64, 100, 192, 212)
  $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 21, 169, 157))
  $g.FillEllipse($glowBrush, $glowRect)

  $highlightRect = New-Object System.Drawing.RectangleF -ArgumentList ($Size * 0.18), ($Size * 0.06), ($Size * 0.52), ($Size * 0.18)
  $highlightPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $highlightPath.AddEllipse($highlightRect)
  $highlightBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($highlightPath)
  $highlightBrush.CenterColor = [System.Drawing.Color]::FromArgb(22, 255, 255, 255)
  $highlightBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
  $g.FillEllipse($highlightBrush, $highlightRect)

  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(38, 255, 255, 255), [float][Math]::Max(1, $Size * 0.01))
  $g.DrawPath($pen, $path)

  $bgBrush.Dispose(); $glowBrush.Dispose(); $highlightBrush.Dispose(); $pen.Dispose(); $glowPath.Dispose(); $highlightPath.Dispose(); $path.Dispose(); $g.Dispose()
  return $bmp
}

function Add-Logo {
  param([System.Drawing.Bitmap]$Bitmap, [System.Drawing.Image]$Logo)
  $size = $Bitmap.Width
  $g = [System.Drawing.Graphics]::FromImage($Bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

  $destSize = [float]($size * 0.78)
  $dest = New-Object System.Drawing.RectangleF -ArgumentList (($size - $destSize) / 2), (($size - $destSize) / 2), $destSize, $destSize

  $shadowRect = New-Object System.Drawing.RectangleF -ArgumentList $dest.X, ($size * 0.78), $dest.Width, ($size * 0.055)
  $shadowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $shadowPath.AddEllipse($shadowRect)
  $shadowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($shadowPath)
  $shadowBrush.CenterColor = [System.Drawing.Color]::FromArgb(56, 0, 0, 0)
  $shadowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $g.FillEllipse($shadowBrush, $shadowRect)

  $g.DrawImage($Logo, $dest)

  $shadowBrush.Dispose(); $shadowPath.Dispose(); $g.Dispose()
}

function Save-Masked {
  param([System.Drawing.Bitmap]$Source, [string]$OutPath, [string]$Shape)
  $size = $Source.Width
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  if ($Shape -eq 'circle') {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $size, $size)
  } else {
    $path = New-RoundedPath -Size $size -Radius ([float]($size * 0.24))
  }

  $g.SetClip($path)
  $g.DrawImage($Source, 0, 0, $size, $size)
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $path.Dispose(); $g.Dispose(); $bmp.Dispose()
}

$logo = [System.Drawing.Image]::FromFile($logoPath)

foreach ($density in $densities) {
  $dir = Join-Path $resBase $density.folder
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

  $foreground = New-Canvas -Size $density.foregroundSize
  Add-Logo -Bitmap $foreground -Logo $logo
  $foreground.Save((Join-Path $dir 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $foreground.Dispose()

  $launcher = New-Canvas -Size $density.launcherSize
  Add-Logo -Bitmap $launcher -Logo $logo
  Save-Masked -Source $launcher -OutPath (Join-Path $dir 'ic_launcher.png') -Shape 'rounded'
  Save-Masked -Source $launcher -OutPath (Join-Path $dir 'ic_launcher_round.png') -Shape 'circle'
  $launcher.Dispose()

  Write-Host ('  OK ' + $density.folder)
}

$logo.Dispose()
Write-Host 'Launcher icons generated successfully.'
`;

  const result = spawnSync(powershell, ["-NoProfile", "-Command", script], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
    shell: false,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.status !== 0) {
    const errorText = (result.stderr || result.stdout || "").trim();
    throw new Error(errorText || "Fallo al generar iconos con PowerShell.");
  }
}

async function main() {
  ensureLogoExists();

  const sharp = tryLoadSharp();
  if (sharp) {
    await generateWithSharp(sharp);
    console.log("Launcher icons generated successfully.");
    return;
  }

  if (process.platform === "win32") {
    generateWithPowerShell();
    return;
  }

  throw new Error("Este script requiere 'sharp' o PowerShell de Windows.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
