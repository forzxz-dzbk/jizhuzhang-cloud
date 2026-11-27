$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $PSScriptRoot 'apply-hosted-0006.mjs'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { $nodeCommand = Get-Command node -ErrorAction SilentlyContinue }
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if (-not $nodePath) {
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $bundledNode) { $nodePath = $bundledNode }
}
if (-not $nodePath) {
    throw '未找到 Node.js。请使用已安装 Node.js 的 PowerShell 窗口；尚未读取数据库连接 URI。'
}
$securePassword = Read-Host '请输入「记祝账」项目当前的 Database Password（输入不显示，不要发到聊天）' -AsSecureString
$passwordPointer = [IntPtr]::Zero
$plainPassword = $null
try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $encodedPassword = [Uri]::EscapeDataString($plainPassword)
    $connectionString = 'postgresql://postgres.eexsbypxhkfxqazwqgdq:{0}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres' -f $encodedPassword
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    $plainPassword = $null
    $securePassword.Dispose()
}
$exitCode = 0
try {
    $env:JZZ_SUPABASE_POOLER_URL = $connectionString
    $caCertificate = Join-Path $projectRoot 'supabase\server-ca.crt'
    if (-not (Test-Path -LiteralPath $caCertificate)) { $caCertificate = Join-Path $projectRoot 'supabase\prod-ca-2021.crt' }
    if (Test-Path -LiteralPath $caCertificate) { $env:JZZ_SUPABASE_CA_CERT_PATH = $caCertificate }
    Push-Location $projectRoot
    try { & $nodePath --use-system-ca $runner; $exitCode = $LASTEXITCODE }
    finally {
        Pop-Location
        Remove-Item Env:JZZ_SUPABASE_POOLER_URL -ErrorAction SilentlyContinue
        Remove-Item Env:JZZ_SUPABASE_CA_CERT_PATH -ErrorAction SilentlyContinue
    }
}
finally { $connectionString = $null; $encodedPassword = $null }
exit $exitCode
