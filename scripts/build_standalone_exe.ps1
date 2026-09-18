# ==============================================================================
# Script Dong Goi Toan Bo Du An Thanh 1 File Duy Nhat: FB-Multi-Hub-Standalone.exe
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "   BAT DAU DONG GOI DU AN THANH 1 FILE DUY NHAT (.EXE)            " -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

$DistDir = Join-Path $ProjectRoot "dist"
if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
}

$StagingDir = Join-Path $DistDir "staging"
if (Test-Path $StagingDir) {
    Remove-Item -Recurse -Force $StagingDir -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null

Write-Host "[1/4] Chuan bi ma nguon va tep tin he thong..." -ForegroundColor Yellow
Copy-Item -Path (Join-Path $ProjectRoot "src") -Destination $StagingDir -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "public") -Destination $StagingDir -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "package.json") -Destination $StagingDir -Force
Copy-Item -Path (Join-Path $ProjectRoot "setup_and_start.ps1") -Destination $StagingDir -Force

$BinDir = Join-Path $ProjectRoot "bin"
if (Test-Path $BinDir) {
    Copy-Item -Path $BinDir -Destination $StagingDir -Recurse -Force
}

$ModulesDir = Join-Path $ProjectRoot "node_modules"
if (Test-Path $ModulesDir) {
    Write-Host "      ➜ Dang sao chep thu vien node_modules vao goi..." -ForegroundColor Gray
    Copy-Item -Path $ModulesDir -Destination $StagingDir -Recurse -Force
}

Write-Host "[2/4] Dang nen du lieu thanh goi payload..." -ForegroundColor Yellow
$PayloadZip = Join-Path $DistDir "payload.zip"
if (Test-Path $PayloadZip) {
    Remove-Item -Force $PayloadZip -ErrorAction SilentlyContinue
}

Compress-Archive -Path "$StagingDir\*" -DestinationPath $PayloadZip -Force
Remove-Item -Recurse -Force $StagingDir -ErrorAction SilentlyContinue

Write-Host "[3/4] Dang bien dich Standalone Executable qua csc.exe..." -ForegroundColor Yellow
$CscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$SourceCs = Join-Path $ProjectRoot "src\launcher\StandaloneLauncher.cs"
$OutputExe = Join-Path $DistDir "FB-Multi-Hub-Standalone.exe"

$resArg = "/resource:" + $PayloadZip + ",Payload"
$outArg = "/out:" + $OutputExe

$compileArgs = @(
    "/nologo",
    "/target:exe",
    "/platform:anycpu",
    "/optimize+",
    "/reference:System.IO.Compression.dll",
    "/reference:System.IO.Compression.FileSystem.dll",
    $resArg,
    $outArg,
    $SourceCs
)

& $CscPath $compileArgs

if (Test-Path $OutputExe) {
    Remove-Item -Force $PayloadZip -ErrorAction SilentlyContinue
    $fileLen = (Get-Item $OutputExe).Length
    $mbSize = [math]::Round($fileLen / 1MB, 2)
    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host "   DONG GOI THANH CONG 1 FILE DUY NHAT!" -ForegroundColor Yellow
    Write-Host "   File: $OutputExe" -ForegroundColor White
    Write-Host "   Dung luong: $mbSize MB" -ForegroundColor Cyan
    Write-Host "   Nguoi khac chi can tai duy nhat 1 file nay ve la chay duoc ngay!" -ForegroundColor Green
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "Loi bien dich csc.exe!" -ForegroundColor Red
}
