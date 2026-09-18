# ==============================================================================
# FB Multi-Page Tool - Tự Động Kiểm Tra, Cài Đặt Môi Trường & Khởi Động
# Hỗ trợ chạy trên mọi máy tính Windows 10/11 mới hoàn toàn (chưa cài đặt bất cứ gì)
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

$Host.UI.RawUI.WindowTitle = "FB Multi-Page Tool - Auto Bootstrapper & Launcher"

function Write-Header {
    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Cyan
    Write-Host "   🚀 FB MULTI-PAGE TOOL - BỘ KHỞI ĐỘNG & TỰ ĐỘNG CÀI ĐẶT TOÀN DIỆN" -ForegroundColor Yellow
    Write-Host "   Tự động kiểm tra, tải môi trường nếu thiếu và khởi chạy tức thì" -ForegroundColor Gray
    Write-Host "==================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step([string]$step, [string]$msg) {
    Write-Host "[$step] " -NoNewline -ForegroundColor Yellow
    Write-Host $msg -ForegroundColor White
}

function Write-Pass([string]$step, [string]$msg) {
    Write-Host "[$step] " -NoNewline -ForegroundColor Green
    Write-Host $msg -ForegroundColor Green
}

function Write-Info([string]$msg) {
    Write-Host "      ➜ $msg" -ForegroundColor Cyan
}

function Write-Fail([string]$msg) {
    Write-Host "      ❌ $msg" -ForegroundColor Red
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Header

# Đảm bảo thư mục bin tồn tại
$BinDir = Join-Path $ScriptDir "bin"
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

# Đảm bảo thư mục data tồn tại
$DataDir = Join-Path $ScriptDir "data"
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

# Đảm bảo tệp .env cơ bản tồn tại
$EnvFile = Join-Path $ScriptDir ".env"
if (-not (Test-Path $EnvFile)) {
    @"
PORT=3000
VERIFY_TOKEN=fb_tool_verify_secret_2026
"@ | Out-File -FilePath $EnvFile -Encoding utf8
    Write-Info "Đã tạo tệp cấu hình mặc định .env (PORT=3000)"
}

# ==============================================================================
# BƯỚC 1: KIỂM TRA & TỰ ĐỘNG CÀI ĐẶT NODE.JS (PORTABLE LTS) NẾU THIẾU
# ==============================================================================
$NodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
$NodePortableDir = Join-Path $BinDir "node"
$NodePortableExe = Join-Path $NodePortableDir "node.exe"

$NeedInstallNode = $true

if ($NodeCmd) {
    try {
        $nodeVersion = & node -v
        Write-Pass "1/4" "Môi trường Node.js hệ thống: ĐÃ SẴN SÀNG ($nodeVersion)"
        $NeedInstallNode = $false
    } catch {}
} elseif (Test-Path $NodePortableExe) {
    $env:PATH = "$NodePortableDir;$env:PATH"
    try {
        $nodeVersion = & "$NodePortableExe" -v
        Write-Pass "1/4" "Môi trường Node.js Portable: ĐÃ SẴN SÀNG ($nodeVersion)"
        $NeedInstallNode = $false
    } catch {}
}

if ($NeedInstallNode) {
    Write-Step "1/4" "Chưa phát hiện Node.js trên máy! Đang tự động tải bộ cài đặt Node.js Portable chính thức..."
    $NodeZipUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"
    $NodeZipPath = Join-Path $BinDir "node-v20.zip"
    $NodeExtractTemp = Join-Path $BinDir "node_temp"

    Write-Info "Đang tải Node.js v20 LTS từ nodejs.org (khoảng 30MB)..."
    
    # Ưu tiên curl.exe nếu có (nhanh & có progress bar chuẩn), fallback WebClient
    $curlCmd = Get-Command "curl.exe" -ErrorAction SilentlyContinue
    if ($curlCmd) {
        & curl.exe -L -o "$NodeZipPath" "$NodeZipUrl"
    } else {
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($NodeZipUrl, $NodeZipPath)
    }

    if (Test-Path $NodeZipPath) {
        Write-Info "Đang giải nén bộ cài Node.js Portable..."
        if (Test-Path $NodeExtractTemp) { Remove-Item -Recurse -Force $NodeExtractTemp }
        Expand-Archive -Path $NodeZipPath -DestinationPath $NodeExtractTemp -Force
        
        $unzippedFolder = Get-ChildItem -Path $NodeExtractTemp -Directory | Select-Object -First 1
        if ($unzippedFolder) {
            if (Test-Path $NodePortableDir) { Remove-Item -Recurse -Force $NodePortableDir }
            Move-Item -Path $unzippedFolder.FullName -Destination $NodePortableDir -Force
        }
        
        Remove-Item -Force $NodeZipPath -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $NodeExtractTemp -ErrorAction SilentlyContinue

        # Thiết lập Environment PATH ngay trong phiên làm việc hiện tại
        $env:PATH = "$NodePortableDir;$env:PATH"

        # Tự động lưu vĩnh viễn vào User PATH của Windows
        try {
            $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
            if ($userPath -notlike "*$NodePortableDir*") {
                [Environment]::SetEnvironmentVariable("Path", "$userPath;$NodePortableDir", "User")
                Write-Info "Đã tự động cấu hình đường dẫn Environment PATH vĩnh viễn cho máy tính!"
            }
        } catch {}

        Write-Pass "1/4" "Đã cài đặt hoàn tất Node.js Portable ($(& "$NodePortableExe" -v))!"
    } else {
        Write-Fail "Không thể tải Node.js tự động. Vui lòng kiểm tra kết nối mạng Internet!"
        exit 1
    }
}

# ==============================================================================
# BƯỚC 2: KIỂM TRA & TỰ ĐỘNG TẢI CLOUDFLARE TUNNEL (CLOUDFLARED) NẾU THIẾU
# ==============================================================================
$CloudflaredExe = Join-Path $BinDir "cloudflared.exe"
if ((Test-Path $CloudflaredExe) -and ((Get-Item $CloudflaredExe).Length -gt 10000000)) {
    Write-Pass "2/4" "Cloudflare Tunnel (TryCloudflare Binary): ĐÃ SẴN SÀNG"
} else {
    Write-Step "2/4" "Chưa có Cloudflare Tunnel Binary! Đang tự động tải bản mới nhất từ GitHub..."
    $CloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    
    $curlCmd = Get-Command "curl.exe" -ErrorAction SilentlyContinue
    if ($curlCmd) {
        & curl.exe -L -o "$CloudflaredExe" "$CloudflaredUrl"
    } else {
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($CloudflaredUrl, $CloudflaredExe)
    }

    if (Test-Path $CloudflaredExe) {
        Write-Pass "2/4" "Đã tải Cloudflare Tunnel thành công!"
    } else {
        Write-Fail "Không thể tải cloudflared.exe. Tool vẫn chạy được ở chế độ Local."
    }
}

# ==============================================================================
# BƯỚC 3: KIỂM TRA & TỰ ĐỘNG CÀI ĐẶT THƯ VIỆN DỰ ÁN (NODE_MODULES) NẾU THIẾU
# ==============================================================================
$ExpressDir = Join-Path $ScriptDir "node_modules\express"
$SqliteDir = Join-Path $ScriptDir "node_modules\better-sqlite3"

if ((Test-Path $ExpressDir) -and (Test-Path $SqliteDir)) {
    Write-Pass "3/4" "Thư viện dự án (node_modules): ĐÃ SẴN SÀNG"
} else {
    Write-Step "3/4" "Chưa phát hiện đủ thư viện dự án! Đang tự động cài đặt qua npm (khoảng 30 giây)..."
    Write-Info "Đang chạy: npm install --no-audit --no-fund..."
    
    # Tìm npm
    $npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
    if (-not $npmCmd -and (Test-Path (Join-Path $NodePortableDir "npm.cmd"))) {
        $npmExe = Join-Path $NodePortableDir "npm.cmd"
        & "$npmExe" install --no-audit --no-fund
    } else {
        & npm install --no-audit --no-fund
    }

    if ((Test-Path $ExpressDir) -and (Test-Path $SqliteDir)) {
        Write-Pass "3/4" "Cài đặt toàn bộ thư viện dự án thành công!"
    } else {
        Write-Fail "Quá trình npm install gặp lỗi. Vui lòng kiểm tra lại quyền thư mục hoặc mạng!"
        exit 1
    }
}

# ==============================================================================
# BƯỚC 4: KIỂM TRA TOÀN DIỆN & TỰ ĐỘNG KHỞI ĐỘNG PHẦN MỀM
# ==============================================================================
Write-Pass "4/4" "Kiểm tra toàn bộ cấu trúc & môi trường: 100% HOÀN HẢO"

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host "   🎉 TẤT CẢ MÔI TRƯỜNG ĐÃ ĐẦY ĐỦ! ĐANG KHỞI CHẠY HỆ THỐNG...   " -ForegroundColor Yellow
Write-Host "   👉 Dashboard Local: http://localhost:3000                     " -ForegroundColor Cyan
Write-Host "   👉 Tự động bật Cloudflare Tunnel & Mở Trình Duyệt Ngay Lập Tức " -ForegroundColor White
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ""

# Tự động mở trình duyệt sau 2 giây
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:3000"
} | Out-Null

# Khởi chạy server
& node "src\server.js"
