# ============================================================
#  一键发布「数字分身」Edge Function（Windows PowerShell 5.1）
# ------------------------------------------------------------
#  它做的事（可重复执行，幂等）：
#    1. 找 Supabase CLI；没有就自动下载到 tools/bin/（不进仓库）
#    2. 检查登录态（需要 SUPABASE_ACCESS_TOKEN 或已 supabase login）
#    3. 写入密钥到 Supabase Secrets（只存服务端，不落入任何文件）
#    4. 发布 supabase/functions/chat → 得到 https://<ref>.supabase.co/functions/v1/chat
#
#  用法（在仓库根目录）：
#    powershell -ExecutionPolicy Bypass -File tools\deploy-chat-function.ps1
#
#  参数：
#    -ProjectRef <ref>   默认 fudznxnxtoiaxcxcvfuq
#    -ApiKey <sk-xxx>    大模型密钥；不传则交互式输入（推荐，不进命令历史）
#    -SkipSecrets        只发函数、不动 Secrets（密钥已在 Dashboard 配好时用）
#
#  前置：需要一个 Supabase 访问令牌（只用于本次发布，不会写进仓库）
#    生成：https://supabase.com/dashboard/account/tokens
#    使用：$env:SUPABASE_ACCESS_TOKEN = "sbp_xxx"
# ============================================================

[CmdletBinding()]
param(
  [string]$ProjectRef = "fudznxnxtoiaxcxcvfuq",
  [string]$ApiKey = "",
  [switch]$SkipSecrets
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repoRoot = Split-Path -Parent $PSScriptRoot
$functionName = "chat"
$functionDir = Join-Path $repoRoot "supabase\functions\$functionName\index.ts"
$binDir = Join-Path $PSScriptRoot "bin"
$cliPath = Join-Path $binDir "supabase.exe"

function Write-Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "    [OK] $text" -ForegroundColor Green }
function Write-Warn2($text) { Write-Host "    [!]  $text" -ForegroundColor Yellow }

if (-not (Test-Path -LiteralPath $functionDir)) {
  throw "找不到函数源码：$functionDir"
}

# ---------- 1. 定位 / 下载 Supabase CLI ----------
Write-Step "检查 Supabase CLI"
$cli = $null
$cmd = Get-Command supabase -ErrorAction SilentlyContinue
if ($cmd) {
  $cli = $cmd.Source
  Write-Ok "使用已安装的 CLI：$cli"
} elseif (Test-Path -LiteralPath $cliPath) {
  $cli = $cliPath
  Write-Ok "使用仓库内 CLI：$cli"
} else {
  Write-Warn2 "未检测到 supabase 命令，开始下载（约 20-40 MB，仅一次）"
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  $api = "https://api.github.com/repos/supabase/cli/releases/latest"
  $release = Invoke-RestMethod -Uri $api -Headers @{ "User-Agent" = "deploy-chat-function" } -TimeoutSec 60
  $asset = $release.assets | Where-Object { $_.name -eq "supabase_windows_amd64.zip" } | Select-Object -First 1
  if (-not $asset) {
    $asset = $release.assets | Where-Object { $_.name -like "*windows_amd64.zip" } | Select-Object -First 1
  }
  if (-not $asset) { throw "没能从 GitHub Releases 找到 Windows 版 CLI，请手动安装后重跑（见 docs/05 §4.2）" }
  $zip = Join-Path $binDir "supabase.zip"
  Write-Host "    下载 $($asset.name) ..."
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing -TimeoutSec 600
  Expand-Archive -LiteralPath $zip -DestinationPath $binDir -Force
  Remove-Item -LiteralPath $zip -Force
  if (-not (Test-Path -LiteralPath $cliPath)) { throw "解压后未找到 $cliPath" }
  $cli = $cliPath
  Write-Ok "CLI 已就绪：$cli"
}

Write-Host ("    版本：" + (& $cli --version))

# ---------- 2. 检查登录态 ----------
Write-Step "检查 Supabase 登录态"
$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) {
  Write-Warn2 "未设置 SUPABASE_ACCESS_TOKEN。"
  Write-Host "    方案一（推荐）：到 https://supabase.com/dashboard/account/tokens 生成令牌，然后：" -ForegroundColor Gray
  Write-Host '                    $env:SUPABASE_ACCESS_TOKEN = "sbp_xxx"' -ForegroundColor Gray
  Write-Host "    方案二：现在执行 supabase login（会打开浏览器授权）" -ForegroundColor Gray
  $answer = Read-Host "    现在用浏览器登录？(y/N)"
  if ($answer -eq "y") { & $cli login } else { throw "缺少访问令牌，已停止（不会修改任何线上内容）" }
} else {
  Write-Ok "已检测到 SUPABASE_ACCESS_TOKEN（未写入任何文件）"
}

# ---------- 3. 写入密钥（只进 Supabase Secrets） ----------
if (-not $SkipSecrets) {
  Write-Step "配置大模型密钥（Supabase Secrets）"
  $key = $ApiKey
  if (-not $key) { $key = (Read-Host "    请粘贴 DEEPSEEK_API_KEY（仅提交到 Supabase Secrets，本地不落盘）").Trim() }
  if (-not $key) {
    Write-Warn2 "未输入密钥，跳过 Secrets（函数将处于「演示模式」）"
  } else {
    & $cli secrets set "DEEPSEEK_API_KEY=$key" --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) { throw "写入 Secrets 失败（检查令牌权限或项目 ref）" }
    $key = $null
    Write-Ok "密钥已写入 Supabase Secrets（本地不留副本）"
  }
} else {
  Write-Warn2 "已按 -SkipSecrets 跳过密钥写入"
}

# ---------- 4. 发布函数 ----------
Write-Step "发布 Edge Function：$functionName"
Push-Location $repoRoot
try {
  # --use-api：由 Supabase 服务端打包，无需本机 Docker
  & $cli functions deploy $functionName --project-ref $ProjectRef --use-api
  if ($LASTEXITCODE -ne 0) {
    Write-Warn2 "--use-api 发布失败，改用默认方式重试一次"
    & $cli functions deploy $functionName --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) { throw "发布失败，请查看上方 CLI 输出" }
  }
} finally {
  Pop-Location
}

# ---------- 5. 验收提示 ----------
$url = "https://$ProjectRef.supabase.co/functions/v1/$functionName"
Write-Step "发布完成"
Write-Ok "函数地址：$url"
Write-Host "`n    下一步：" -ForegroundColor Gray
Write-Host "      1) 把上面的地址填进 scripts/config.js 的 chatUrl 字段" -ForegroundColor Gray
Write-Host "      2) 本地自检：py .deepworks/tmp/check_deploy.py https://chencu-vinegar.github.io/" -ForegroundColor Gray
Write-Host "      3) git add -A; git commit -m 'feat: 线上数字分身接入真实大模型'; git push" -ForegroundColor Gray
Write-Host "`n    若首次发布报 JWT 相关错误：Dashboard → Edge Functions → chat → 关闭 Enforce JWT Verification" -ForegroundColor Gray
