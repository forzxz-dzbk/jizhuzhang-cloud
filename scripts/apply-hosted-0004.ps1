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
Write-Host '请从 Supabase 项目「记祝账」的 Connect 面板复制 Session pooler URI。'
Write-Host '在下方安全提示中粘贴完整 URI（输入内容不会显示），不要把它发到聊天或保存到文件。'
$secureUri = Read-Host '记祝账 Session Pooler URI' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUri)
$exitCode = 0
try {
    $env:JZZ_SUPABASE_POOLER_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    Push-Location $projectRoot
    try { & $nodePath $runner; $exitCode = $LASTEXITCODE }
    finally { Pop-Location; Remove-Item Env:JZZ_SUPABASE_POOLER_URL -ErrorAction SilentlyContinue }
}
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secureUri.Dispose() }
exit $exitCode
