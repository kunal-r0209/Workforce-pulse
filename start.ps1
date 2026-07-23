# Workforce Pulse — One-Click Startup
# Run from the project root: .\start.ps1

Write-Host ""
Write-Host "  ⚡ Starting Workforce Pulse..." -ForegroundColor Cyan
Write-Host ""

# Kill anything on port 8000 or 5173
$p8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($p8000) {
    Stop-Process -Id ($p8000 | Select-Object -First 1 -ExpandProperty OwningProcess) -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleared port 8000" -ForegroundColor Yellow
}
$p5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($p5173) {
    Stop-Process -Id ($p5173 | Select-Object -First 1 -ExpandProperty OwningProcess) -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleared port 5173" -ForegroundColor Yellow
}

Start-Sleep -Milliseconds 500

# Start backend in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "cd '$PSScriptRoot\backend'; python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload" `
    -WindowStyle Normal

Write-Host "  ✓ Backend starting on http://localhost:8000" -ForegroundColor Green

Start-Sleep -Seconds 2

# Start frontend in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "cd '$PSScriptRoot\frontend'; node .\node_modules\vite\bin\vite.js --port 5173" `
    -WindowStyle Normal

Write-Host "  ✓ Frontend starting on http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "  Opening browser..." -ForegroundColor Cyan

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "  Workforce Pulse is running." -ForegroundColor Cyan
Write-Host "  Backend : http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
Write-Host ""
