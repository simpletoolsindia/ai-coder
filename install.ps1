# AI By - Windows installer (PowerShell)
#
# Docs:      https://simpletoolsindia.github.io/ai-coder/
# GitHub:    https://github.com/simpletoolsindia/ai-coder
# npm:       https://www.npmjs.com/package/ai-by
#
# Usage:
#   iwr -useb https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.ps1 | iex
#   iwr -useb https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.ps1 | iex -ArgumentList '--version','0.2.1'
#
# What it does:
#   1. Detects whether Node >= 20 is installed.
#   2. Installs Node LTS via winget or chocolatey if missing.
#   3. Installs AI By via npm.
#   4. Verifies the install.
[CmdletBinding()]
param(
  [string]$Version = "latest",
  [switch]$FromSource,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$PackageName = "ai-by"
$NodeMinMajor = 20

function Write-Banner {
  Write-Host "  ___  __  __ ____          ____" -ForegroundColor Cyan
  Write-Host " / _ |/ / / /_  __/______ / __/"  -ForegroundColor Cyan
  Write-Host "/ __ |/ /_/ / / / -_) -_)\__ \"    -ForegroundColor Cyan
  Write-Host "/_/ |_/____ /_/  \__/\__/____/"   -ForegroundColor Cyan
  Write-Host ""
  Write-Host "AI By installer" -ForegroundColor Cyan
}

function Log($msg)  { Write-Host "[ai-by] $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "[ai-by] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "[ai-by] $msg" -ForegroundColor Red; exit 1 }

function Test-Command($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Get-NodeMajor {
  try {
    $v = node -p "process.versions.node"
    return [int]($v.Split('.')[0])
  } catch { return 0 }
}

function Install-Node {
  if (Test-Command winget) {
    Log "Installing Node via winget"
    winget install -e --id OpenJS.NodeJS.LTS
  } elseif (Test-Command choco) {
    Log "Installing Node via choco"
    choco install -y nodejs-lts
  } else {
    Fail "Install Node >= $NodeMinMajor manually from https://nodejs.org"
  }
  if (-not (Test-Command node)) { Fail "Node installation failed" }
  Log "Node $(node --version) installed"
}

function Install-Package {
  if ($FromSource) {
    Log "Installing $PackageName from $(Get-Location)"
    npm install -g . --silent
  } else {
    if ($Version -eq "latest") {
      Log "Installing $PackageName@latest from npm"
      npm install -g $PackageName --silent
    } else {
      Log "Installing $PackageName@$Version from npm"
      npm install -g "$PackageName@$Version" --silent
    }
  }
}

function Verify {
  if (Test-Command ai-by) {
    $ver = $null
    try { $ver = ai-by --version } catch {}
    Log "ai-by installed" + $(if ($ver) { " ($ver)" } else { "" })
    Log "Restart your terminal and run 'ai-by'"
  } else {
    Warn "ai-by was installed but is not on PATH"
    Warn "Open a new PowerShell window"
  }
}

if ($Help) {
  Get-Help $PSCommandPath
  exit 0
}

Write-Banner
$major = Get-NodeMajor
if ($major -lt $NodeMinMajor) {
  Warn "Node $major found, >= $NodeMinMajor required"
  Install-Node
} else {
  Log "Node $(node --version) is already installed"
}
if (-not (Test-Command npm)) { Fail "npm not found after installing Node" }
Install-Package
Verify
Log "Done."
