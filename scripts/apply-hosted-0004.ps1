$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $PSScriptRoot 'apply-hosted-0004.mjs'
Write-Host '请从 Supabase 项目「记祝账」的 Connect 面板复制 Session pooler URI。'
Write-Host '在下方安全提示中粘贴完整 URI（输入内容不会显示），不要把它发到聊天或保存到文件。'
$secureUri = Read-Host '记祝账 Session Pooler URI' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUri)
$exitCode = 0
try {
    $env:JZZ_SUPABASE_POOLER_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    Push-Location $projectRoot
    try { & pnpm exec node $runner; $exitCode = $LASTEXITCODE }
    finally { Pop-Location; Remove-Item Env:JZZ_SUPABASE_POOLER_URL -ErrorAction SilentlyContinue }
}
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secureUri.Dispose() }
exit $exitCode
