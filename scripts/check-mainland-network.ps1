param([string]$AppUrl = 'https://forzxz-dzbk.github.io/jizhuzhang-cloud/')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.local'
if (!(Test-Path -LiteralPath $envFile)) { throw 'Missing .env.local; configure the public Supabase URL and publishable key locally.' }
$text = Get-Content -LiteralPath $envFile -Raw
$api = ([regex]::Match($text, '(?m)^VITE_SUPABASE_URL=(.+)$')).Groups[1].Value.Trim().Trim('"').TrimEnd('/')
$key = ([regex]::Match($text, '(?m)^VITE_SUPABASE_PUBLISHABLE_KEY=(.+)$')).Groups[1].Value.Trim().Trim('"')
if (!$api -or !$key) { throw 'Public Supabase URL or publishable key is missing.' }
function Probe([string]$Name, [string]$Url, [hashtable]$Headers = @{}) {
  $u = [uri]$Url; $dns = @(); $tcp = $false; $status = $null; $err = $null
  try { $dns = [Net.Dns]::GetHostAddresses($u.Host) | ForEach-Object IPAddressToString } catch { $err = 'DNS:' + $_.Exception.GetType().Name }
  try { $c = [Net.Sockets.TcpClient]::new(); $task = $c.ConnectAsync($u.Host,443); $tcp = $task.Wait(8000) -and $c.Connected; $c.Dispose() } catch { $tcp = $false }
  $handler = [Net.Http.HttpClientHandler]::new(); $handler.UseProxy = $false; $client = [Net.Http.HttpClient]::new($handler); $client.Timeout = [TimeSpan]::FromSeconds(15)
  try { foreach($k in $Headers.Keys){$null=$client.DefaultRequestHeaders.TryAddWithoutValidation($k,[string]$Headers[$k])}; $response=$client.GetAsync($Url).GetAwaiter().GetResult(); $status=[int]$response.StatusCode; $response.Dispose() } catch { $err = 'HTTP:' + $_.Exception.GetType().Name } finally { $client.Dispose(); $handler.Dispose() }
  [pscustomobject]@{target=$Name;host=$u.Host;dns=($dns -join ',');tcp443=$tcp;httpStatus=$status;error=$err}
}
$results = @(
  (Probe 'frontend' $AppUrl),
  (Probe 'supabase-auth' ($api + '/auth/v1/health') @{apikey=$key;Authorization=('Bearer '+$key)})
)
[pscustomobject]@{proxyBypassed=$true;testedAt=(Get-Date).ToString('o');results=$results} | ConvertTo-Json -Depth 4
