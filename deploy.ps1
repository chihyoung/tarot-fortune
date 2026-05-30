# 타로 운세 - 배포 스크립트
# 사용법: .\deploy.ps1 [-Branch <branch>] [-SkipTests]
# TC 전체 PASS 확인 후 git push 실행

param(
  [string]$Branch = 'master',
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$ROOT = $PSScriptRoot

function Write-Step { param($msg) Write-Host "`n═══ $msg ═══" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Fail { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "  ℹ $msg" -ForegroundColor Yellow }

# ── 1. 변경사항 확인 ───────────────────────────────────
Write-Step "Git 상태 확인"
$status = git status --short
if ($status) {
  Write-Info "커밋되지 않은 변경사항이 있습니다:"
  $status | ForEach-Object { Write-Host "    $_" }
  $ans = Read-Host "  계속하시겠습니까? (y/N)"
  if ($ans -notmatch '^[Yy]$') { Write-Fail "배포 취소"; exit 1 }
} else {
  Write-OK "워킹 트리 깨끗함"
}

if ($SkipTests) {
  Write-Info "테스트 스킵 (-SkipTests 플래그)"
} else {
  # ── 2. 로컬 서버 시작 ──────────────────────────────────
  Write-Step "로컬 서버 시작 (포트 3000)"
  $server = Start-Process -FilePath "node" `
    -ArgumentList "-e", "require('http').createServer((req,res)=>{const fs=require('fs'),path=require('path');let f=path.join('$ROOT'.replace(/\\/g,'/'),decodeURIComponent(req.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';fs.readFile(f,(err,d)=>{if(err){res.writeHead(404);res.end();}else{const ext=f.split('.').pop();const ct={'html':'text/html','css':'text/css','js':'application/javascript','svg':'image/svg+xml','png':'image/png','jpg':'image/jpeg','webp':'image/webp','woff2':'font/woff2'}[ext]||'application/octet-stream';res.writeHead(200,{'Content-Type':ct});res.end(d);}})}).listen(3000,()=>console.log('Server ready'))" `
    -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\tc-server.log"

  Start-Sleep -Seconds 2
  Write-OK "서버 PID: $($server.Id)"

  try {
    # ── 3. TC 실행 ───────────────────────────────────────
    Write-Step "TC (테스트 케이스) 실행"
    Write-Info "전체 플로우 테스트 중... (약 2~3분 소요)"
    $tcResult = & node "$ROOT\tc.mjs" 2>&1
    $tcExit = $LASTEXITCODE
    $tcResult | ForEach-Object { Write-Host "  $_" }

    # ── 4. 결과 판정 ─────────────────────────────────────
    Write-Step "TC 결과"
    if ($tcExit -eq 0) {
      Write-OK "모든 TC PASS — 배포를 진행합니다"
    } else {
      Write-Fail "TC 실패 항목이 있습니다 — 배포를 중단합니다"
      exit 1
    }
  } finally {
    # 서버 종료
    if ($server -and !$server.HasExited) {
      Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
      Write-Info "서버 종료됨"
    }
  }
}

# ── 5. 배포 확인 ─────────────────────────────────────────
Write-Step "배포 확인"
$log = git log --oneline -5
Write-Info "최근 커밋:"
$log | ForEach-Object { Write-Host "    $_" }

$confirm = Read-Host "`n  '$Branch' 브랜치로 push하시겠습니까? (y/N)"
if ($confirm -notmatch '^[Yy]$') {
  Write-Info "배포 취소됨"
  exit 0
}

# ── 6. Push ──────────────────────────────────────────────
Write-Step "git push → origin/$Branch"
git push origin $Branch
if ($LASTEXITCODE -eq 0) {
  Write-OK "배포 완료! GitHub Pages에 반영까지 1~2분 소요됩니다."
  Write-Info "URL: https://chihyoung.github.io/tarot-fortune/"
} else {
  Write-Fail "push 실패"
  exit 1
}
