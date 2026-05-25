# JellyOS Setup Script for Windows PowerShell
# Run with: Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Bypass; .\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ╔════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "  ║     JellyOS Setup  ·  v2.0.0           ║" -ForegroundColor Yellow
Write-Host "  ╚════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

# Check Node.js
try {
    $nodeVersion = (node --version) -replace "v", "" -split "\." | Select-Object -First 1
    if ([int]$nodeVersion -lt 20) { throw "Node.js 20+ required" }
    Write-Host "  ✓ Node.js $(node --version)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js 20+ required. Download from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Silently remove legacy dependencies if present — ~/.jelly/ data is never touched
if (Test-Path "node_modules\@earendil-works") {
    Write-Host "  Removing legacy dependency..." -ForegroundColor Gray
    npm uninstall @earendil-works/pi-coding-agent @earendil-works/pi-ai 2>$null
    Remove-Item -Recurse -Force "node_modules\@earendil-works" -ErrorAction SilentlyContinue
    Write-Host "  ✓ Legacy dependency removed" -ForegroundColor Green
}

if (Test-Path "node_modules\@jellychain") {
    Write-Host "  Removing old @jellychain/agent..." -ForegroundColor Gray
    npm uninstall @jellychain/agent 2>$null
    Remove-Item -Recurse -Force "node_modules\@jellychain" -ErrorAction SilentlyContinue
}

# Install @jellyos/agent
if (-not (Test-Path "node_modules\@jellyos\agent")) {
    Write-Host "  Installing @jellyos/agent..." -ForegroundColor Gray
    npm install @jellyos/agent --silent
}
Write-Host "  ✓ @jellyos/agent ready" -ForegroundColor Green

# Install
Write-Host ""
Write-Host "  Installing dependencies..." -ForegroundColor Gray
npm install
Write-Host "  ✓ Dependencies installed" -ForegroundColor Green

# Link
npm link 2>$null
Write-Host "  ✓ 'jelly' command linked" -ForegroundColor Green

# Setup wizard
Write-Host ""
node bin/jellyos setup

# Dashboard
if (Test-Path "dashboard/package.json") {
    Write-Host ""
    Write-Host "  Installing dashboard dependencies..." -ForegroundColor Gray
    Push-Location dashboard; npm install; Pop-Location
    Write-Host "  ✓ Dashboard ready" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Setup Complete!" -ForegroundColor Yellow
Write-Host "  jelly                     - start agent"
Write-Host "  cd dashboard; npm run dev - start dashboard"
Write-Host ""
