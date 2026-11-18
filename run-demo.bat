@echo off
setlocal
set "ROOT=%~dp0"
set "APPDATA=%ROOT%.hardhat-global"
set "LOCALAPPDATA=%ROOT%.hardhat-local"
cd /d "%ROOT%"

if not exist .env copy .env.example .env >nul

npm run compile
if errorlevel 1 (
  echo Contract compilation failed.
  exit /b 1
)

start "TraceNet Local EVM" /D "%ROOT%" cmd /k "npm run node"
timeout /t 3 /nobreak >nul
npm run deploy
if errorlevel 1 (
  echo Contract deployment failed. Check that the local node is listening on port 8545.
  exit /b 1
)

powershell -NoProfile -Command "$p=Join-Path '%ROOT%' '.env'; $s=Get-Content -Raw $p; $s=[regex]::Replace($s,'(?m)^CONTRACT_ADDRESS=.*$','CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3'); Set-Content -NoNewline -Path $p -Value $s"
start "TraceNet API" /D "%ROOT%" cmd /k "npm run api"
if exist "%ROOT%frontend\node_modules\next\dist\bin\next" (
  start "TraceNet Frontend" /D "%ROOT%frontend" cmd /k "npm run dev"
) else (
  echo Frontend dependencies are not installed. Run: npm --prefix frontend install
)
echo TraceNet API and local blockchain startup requested.
