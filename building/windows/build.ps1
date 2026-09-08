# -*- mode: python ; coding: utf-8 -*-

<#
  .DESCRIPTION
  A simple script to automatically build FGCS on windows with powershell

  .EXAMPLE
  .\build.ps1 -Version "0.1.8-alpha"
  .\build.ps1
#>

Param (
  [Parameter(Mandatory = $false)]
  [string]$Version,
  [Parameter(Mandatory = $false)]
  [string]$Arch
)

Write-Output "Assuming location is FGCS\building\windows"
Set-Location ../../

# Read and display current version from package.json
Write-Output "Reading current version from package.json..."
$packageJsonPath = ".\gcs\package.json"
if (Test-Path $packageJsonPath) {
  $packageJson = Get-Content $packageJsonPath | ConvertFrom-Json
  $currentVersion = $packageJson.version
  Write-Output "Current version: $currentVersion"

  # Prompt for version if not provided
  if (-not $Version) {
    $Version = Read-Host "Enter new version number"
    if (-not $Version) {
      Write-Error "Version is required to continue"
      exit 1
    }
  }

  Write-Output "New version will be: $Version"
} else {
  Write-Warning "Could not find package.json at $packageJsonPath"

  # Still prompt for version if package.json not found
  if (-not $Version) {
    $Version = Read-Host "Enter version number"
    if (-not $Version) {
      Write-Error "Version is required to continue"
      exit 1
    }
  }
}

Write-Output "Building backend"
Set-Location radio

# The backend must be frozen with the venv's own interpreter. A bare `python` /
# `pip` picks up whatever is first on PATH, and building from one environment
# against another's site-packages mixes incompatible setuptools generations --
# which shows up as the packaged backend dying on startup with
# "The 'jaraco' package is required". Bare `pip` is also the launcher shim,
# which can fail outright inside _distutils_hack.
$venvPython = ".\venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
  Write-Error "Could not find the radio venv at $venvPython. Create it and install requirements.txt first."
  exit 1
}

# Clean reinstall of PyInstaller to fix bootloader issues
Write-Output "Ensuring clean PyInstaller installation..."
& $venvPython -m pip uninstall -y pyinstaller
& $venvPython -m pip uninstall -y pyinstaller-hooks-contrib
& $venvPython -m pip cache purge
& $venvPython -m pip install pyinstaller
if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to install PyInstaller into the radio venv"
  exit $LASTEXITCODE
}

# Clean previous build artifacts
if (Test-Path .\dist) {
  Write-Output "Cleaning previous dist folder..."
  Remove-Item -Path .\dist -Recurse -Force
}
if (Test-Path .\build) {
  Write-Output "Cleaning previous build folder..."
  Remove-Item -Path .\build -Recurse -Force
}

# Build with PyInstaller
# Invoked as a module: pip may install the pyinstaller.exe shim into a Scripts
# directory that isn't on PATH, and a missing command doesn't set $LASTEXITCODE.
# No --paths for the venv's site-packages: running the venv interpreter already
# puts it on the search path, and passing it explicitly is what made PyInstaller
# treat it as a foreign environment.
Write-Output "Running PyInstaller..."
& $venvPython -m PyInstaller --clean --noconfirm `
  --add-data=".\venv\Lib\site-packages\pymavlink\message_definitions\:message_definitions" `
  --add-data=".\venv\Lib\site-packages\pymavlink\:pymavlink" `
  --hidden-import pymavlink `
  --hidden-import engineio.async_drivers.threading `
  --hidden-import platformdirs `
  --hidden-import pkg_resources.extern `
  .\app.py -n fgcs_backend

if ($LASTEXITCODE -ne 0) {
  Write-Error "PyInstaller build failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Output "Moving contents of /radio/dist/fgcs_backend to gcs/extras"
# Only discard the existing extras once the replacement is known to exist,
# otherwise a failed backend build leaves the installer with no backend.
if (-not (Test-Path .\dist\fgcs_backend)) {
  Write-Error "PyInstaller did not produce radio\dist\fgcs_backend"
  exit 1
}
if (Test-Path ..\gcs\extras) {
  Remove-Item -Path ..\gcs\extras -Recurse -Force
}
Move-Item .\dist\fgcs_backend\ ..\gcs\extras
if (-not (Test-Path ..\gcs\extras)) {
  Write-Error "Failed to move backend to gcs\extras"
  exit 1
}

Write-Output "Building frontend"
Set-Location ../gcs/data
python generate_param_definitions.py
if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to generate param definitions"
  exit $LASTEXITCODE
}

# Check for second argument (arch) via $Arch parameter
if (-not $Arch) {
  $Arch = ""
}
Write-Output "Generated param definitions"

python generate_log_message_descriptions.py
if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to generate log message descriptions"
  exit $LASTEXITCODE
}
Write-Output "Generated log message descriptions"

Set-Location ../
yarn
yarn version --new-version $Version --no-git-tag-version --no-commit-hooks

# Build with optional arch specification
if ($Arch) {
  Write-Output "Building for architecture: $Arch"
  yarn build --arch=$Arch
} else {
  Write-Output "Building for host architecture"
  yarn build
}

if ($LASTEXITCODE -ne 0) {
  Write-Error "Yarn build failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Output "Going back to building\windows from gcs"
Set-Location ..\building\windows

Write-Output "Done!"
