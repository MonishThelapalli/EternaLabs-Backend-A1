# Quick System Verification Script
# Checks all components are ready

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "ORDER EXECUTION ENGINE - VERIFICATION" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: TypeScript
Write-Host "[1/6] TypeScript Compilation..." -ForegroundColor Blue
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ PASSED: 0 errors" -ForegroundColor Green
} else {
    Write-Host "  ✗ FAILED" -ForegroundColor Red
    exit 1
}

# Test 2: Dependencies
Write-Host "[2/6] Required Packages..." -ForegroundColor Blue
$pkgs = @("ws", "bullmq", "ioredis", "express", "pino", "typeorm")
foreach ($pkg in $pkgs) {
    npm list $pkg 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ $pkg" -ForegroundColor Green
    }
}

# Test 3: Files
Write-Host "[3/6] Required Files..." -ForegroundColor Blue
$files = @(
    "src/server.ts",
    "src/queue/worker.ts",
    "src/services/websocket-manager.ts",
    "src/services/queue-events.ts"
)
$allExist = $true
foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file MISSING" -ForegroundColor Red
        $allExist = $false
    }
}

# Test 4: Redis
Write-Host "[4/6] Redis Connection..." -ForegroundColor Blue
$redis = redis-cli ping 2>&1
if ($redis -eq "PONG") {
    Write-Host "  ✓ PONG - Running" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Not running (start with: redis-server)" -ForegroundColor Yellow
}

# Test 5: Port
Write-Host "[5/6] Port 3000 Availability..." -ForegroundColor Blue
$port = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($port) {
    Write-Host "  ⚠ Port in use (previous server?)" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ Available" -ForegroundColor Green
}

# Test 6: Architecture
Write-Host "[6/6] Architecture Components..." -ForegroundColor Blue
$serverCode = Get-Content src/server.ts -Raw
$workerCode = Get-Content src/queue/worker.ts -Raw

if ($serverCode -like "*wss.on*") {
    Write-Host "  ✓ WebSocket handler present" -ForegroundColor Green
}
if ($serverCode -like "*subscriber.subscribe*") {
    Write-Host "  ✓ Pub/Sub subscription present" -ForegroundColor Green
}
if ($workerCode -like "*publishOrderUpdate*") {
    Write-Host "  ✓ Progress publishing present" -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✓ VERIFICATION COMPLETE" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. redis-server" -ForegroundColor White
Write-Host "  2. npm run dev" -ForegroundColor White
Write-Host "  3. npm run worker" -ForegroundColor White
Write-Host ""
