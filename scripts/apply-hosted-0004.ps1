$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $PSScriptRoot 'apply-hosted-0004.mjs'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { $nodeCommand = Get-Command node -ErrorAction SilentlyContinue }
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if (-not $nodePath) {
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $bundledNode) { $nodePath = $bundledNode }
}
if (-not $nodePath) {
    throw '未找到 Node.js。请安装 Node.js LTS，或使用已安装 Node.js 的 PowerShell 窗口；尚未读取数据库连接 URI。'
}
$connectionString = Get-Clipboard -Raw
if ([string]::IsNullOrWhiteSpace($connectionString)) {
    throw '剪贴板为空。请先复制「记祝账」项目的 Session pooler URI，再运行；未连接数据库。'
}
$connectionString = $connectionString.Trim()
if (-not $connectionString.StartsWith('postgres://') -and -not $connectionString.StartsWith('postgresql://')) {
    throw '剪贴板中未检测到 PostgreSQL 连接串。请先复制「记祝账」项目的 Session pooler URI，再重新运行；未连接数据库。'
}
$exitCode = 0
try {
    $env:JZZ_SUPABASE_POOLER_URL = $connectionString
    Push-Location $projectRoot
    try { & $nodePath $runner; $exitCode = $LASTEXITCODE }
    finally { Pop-Location; Remove-Item Env:JZZ_SUPABASE_POOLER_URL -ErrorAction SilentlyContinue }
}
finally { $connectionString = $null }
exit $exitCode
