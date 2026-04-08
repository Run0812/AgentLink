# AgentLink Dev Vault Sync Script
# 用法: .\sync-dev.ps1

$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$buildDir = Join-Path $repoRoot "build"
$devPluginDir = Join-Path $repoRoot "dev\.obsidian\plugins\agentlink"

Write-Host "AgentLink Dev Sync" -ForegroundColor Cyan
Write-Host "=================="

# 检查 build 目录
if (-not (Test-Path $buildDir)) {
    Write-Host "❌ build/ 目录不存在，请先运行: npm run build:quick" -ForegroundColor Red
    exit 1
}

# 确保 dev 插件目录存在
if (-not (Test-Path $devPluginDir)) {
    Write-Host "📁 创建 dev vault 插件目录..."
    New-Item -ItemType Directory -Force -Path $devPluginDir | Out-Null
}

# 复制文件
Write-Host "📦 复制构建文件到 dev vault..."

$files = @(
    @{Source = "main.js"; Dest = "main.js"},
    @{Source = "manifest.json"; Dest = "manifest.json"},
    @{Source = "styles.css"; Dest = "styles.css"}
)

foreach ($file in $files) {
    $src = Join-Path $buildDir $file.Source
    $dst = Join-Path $devPluginDir $file.Dest
    
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $dst -Force
        $size = (Get-Item $src).Length
        Write-Host "  ✅ $($file.Source) ($([math]::Round($size/1024, 1)) KB)"
    } else {
        Write-Host "  ❌ $($file.Source) 不存在!" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "✅ 同步完成!" -ForegroundColor Green
Write-Host ""
Write-Host "下一步:" -ForegroundColor Yellow
Write-Host "  1. 在 Obsidian 中打开 dev/ 目录作为 vault"
Write-Host "  2. 设置 → Community Plugins → 启用 AgentLink"
Write-Host "  3. 点击 🤖 图标或 Ctrl+P → 'Open Local Agent Chat'"
Write-Host ""
