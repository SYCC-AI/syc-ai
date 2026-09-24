# SYC Node installer for Windows (PowerShell):  irm https://syc-ai.com/node/install.ps1 | iex
# Installs the agent into %USERPROFILE%\.syc-node, adds a `syc-node` command
# and a scheduled task that keeps the device connected after sign-in.
# To remove it later: syc-node uninstall
# This file must stay ASCII (irm decodes it as Latin-1): other languages are
# stored as base64 UTF-8 and decoded at run time.
$ErrorActionPreference = 'Stop'
$Server = if ($env:SYC_SERVER) { $env:SYC_SERVER } else { 'https://syc-ai.com' }
$Download = if ($env:SYC_DOWNLOAD) { $env:SYC_DOWNLOAD } else { $Server }
$Home_ = Join-Path $env:USERPROFILE '.syc-node'
$Bin = Join-Path $env:LOCALAPPDATA 'SYC-AI\bin'
$LangDefault = if ($env:SYC_LANG) { $env:SYC_LANG } else { '__SYC_LANG__' }
if (@('en','fa','ar','ru','zh','es') -notcontains $LangDefault) { $LangDefault = 'en' }
$L = $LangDefault
$T = @{
  'en:download' = 'RG93bmxvYWRpbmcgU1lDIE5vZGUgLi4u'
  'fa:download' = '2K/YsSDYrdin2YQg2K/YsduM2KfZgdiqIFNZQyBOb2RlIC4uLg=='
  'ar:download' = '2KzYp9ix2Y0g2KrZhtiy2YrZhCBTWUMgTm9kZSAuLi4='
  'ru:download' = '0JfQsNCz0YDRg9C30LrQsCBTWUMgTm9kZSAuLi4='
  'zh:download' = '5q2j5Zyo5LiL6L29IFNZQyBOb2RlIC4uLg=='
  'es:download' = 'RGVzY2FyZ2FuZG8gU1lDIE5vZGUgLi4u'
  'en:node' = 'Tm9kZS5qcyBpcyBub3QgaW5zdGFsbGVkOyBpbnN0YWxsaW5nIE5vZGUuanMgTFRTIHdpdGggd2luZ2V0IC4uLg=='
  'fa:node' = 'Tm9kZS5qcyDZhti12Kgg2YbbjNiz2KrYmyDZhtiz2K7Zh9mUIExUUyDYqNinIHdpbmdldCDZhti12Kgg2YXbjOKAjNi02YjYryAuLi4='
  'ar:node' = 'Tm9kZS5qcyDYutmK2LEg2YXYq9io2KrYmyDYrNin2LHZjSDYqtir2KjZitiqIE5vZGUuanMgTFRTINi52KjYsSB3aW5nZXQgLi4u'
  'ru:node' = 'Tm9kZS5qcyDQvdC1INGD0YHRgtCw0L3QvtCy0LvQtdC9OyDRg9GB0YLQsNC90LDQstC70LjQstCw0Y4gTm9kZS5qcyBMVFMg0YfQtdGA0LXQtyB3aW5nZXQgLi4u'
  'zh:node' = '5pyq5a6J6KOFIE5vZGUuanPvvIzmraPlnKjpgJrov4cgd2luZ2V0IOWuieijhSBOb2RlLmpzIExUUyAuLi4='
  'es:node' = 'Tm9kZS5qcyBubyBlc3TDoSBpbnN0YWxhZG87IGluc3RhbGFuZG8gTm9kZS5qcyBMVFMgY29uIHdpbmdldCAuLi4='
  'en:signin' = 'U2lnbiBpbiB3aXRoIHlvdXIgU1lDLUFJIGFjY291bnQ6'
  'fa:signin' = '2KjYpyDYrdiz2KfYqCBTWUMtQUkg2K7ZiNivINmI2KfYsdivINi02YjbjNivOg=='
  'ar:signin' = '2LPYrNmR2YQg2KfZhNiv2K7ZiNmEINio2K3Ys9in2KggU1lDLUFJOg=='
  'ru:signin' = '0JLQvtC50LTQuNGC0LUg0LIg0YHQstC+0Lkg0LDQutC60LDRg9C90YIgU1lDLUFJOg=='
  'zh:signin' = '6K+355m75b2V5L2g55qEIFNZQy1BSSDotKbmiLfvvJo='
  'es:signin' = 'SW5pY2lhIHNlc2nDs24gY29uIHR1IGN1ZW50YSBkZSBTWUMtQUk6'
  'en:running' = 'U1lDIE5vZGUgaXMgcnVubmluZyAoVGFzayBTY2hlZHVsZXI6ICJTWUMgTm9kZSIpLg=='
  'fa:running' = 'U1lDIE5vZGUg2K/YsSDYrdin2YQg2KfYrNix2KfYs9iqIChUYXNrIFNjaGVkdWxlcjogwqtTWUMgTm9kZcK7KS4='
  'ar:running' = 'U1lDIE5vZGUg2YrYudmF2YQgKFRhc2sgU2NoZWR1bGVyOiAiU1lDIE5vZGUiKS4='
  'ru:running' = 'U1lDIE5vZGUg0LfQsNC/0YPRidC10L0gKNCf0LvQsNC90LjRgNC+0LLRidC40Log0LfQsNC00LDQvdC40Lk6ICJTWUMgTm9kZSIpLg=='
  'zh:running' = 'U1lDIE5vZGUg5q2j5Zyo6L+Q6KGM77yI5Lu75Yqh6K6h5YiS56iL5bqP77ya4oCcU1lDIE5vZGXigJ3vvInjgII='
  'es:running' = 'U1lDIE5vZGUgZXN0w6EgZW4gbWFyY2hhIChQcm9ncmFtYWRvciBkZSB0YXJlYXM6ICJTWUMgTm9kZSIpLg=='
  'en:done' = 'RG9uZS4gT3BlbiBodHRwczovL2FwcC5zeWMtYWkuY29tL3Byb2ZhZ2UgLT4gY2hvb3NlIHRoaXMgZGV2aWNlIGFuZCBpbnN0YWxsIENsYXVkZSBvciBDb2RleC4gVG8gcmVtb3ZlIGl0IGxhdGVyOiBzeWMtbm9kZSB1bmluc3RhbGw='
  'fa:done' = '2KrZhdin2YUg2LTYry4g2KjYp9iyINqp2YbbjNivOiBodHRwczovL2FwcC5zeWMtYWkuY29tL3Byb2ZhZ2Ug4oaQINmH2YXbjNmGINiv2LPYqtqv2KfZhyDYsdinINin2YbYqtiu2KfYqCDaqdmG24zYryDZiCBDbGF1ZGUg24zYpyBDb2RleCDYsdinINmG2LXYqCDaqdmG24zYry4g2KjYsdin24wg2K3YsNmBOiBzeWMtbm9kZSB1bmluc3RhbGw='
  'ar:done' = '2KrZhS4g2KfZgdiq2K0gaHR0cHM6Ly9hcHAuc3ljLWFpLmNvbS9wcm9mYWdlIOKGkCDYp9iu2KrYsSDZh9iw2Kcg2KfZhNis2YfYp9iyINmI2KvYqNmR2KogQ2xhdWRlINij2YggQ29kZXguINmE2YTYpdiy2KfZhNipOiBzeWMtbm9kZSB1bmluc3RhbGw='
  'ru:done' = '0JPQvtGC0L7QstC+LiDQntGC0LrRgNC+0LnRgtC1IGh0dHBzOi8vYXBwLnN5Yy1haS5jb20vcHJvZmFnZSAtPiDQstGL0LHQtdGA0LjRgtC1INGN0YLQviDRg9GB0YLRgNC+0LnRgdGC0LLQviDQuCDRg9GB0YLQsNC90L7QstC40YLQtSBDbGF1ZGUg0LjQu9C4IENvZGV4LiDQo9C00LDQu9C40YLRjDogc3ljLW5vZGUgdW5pbnN0YWxs'
  'zh:done' = '5a6M5oiQ44CC5omT5byAIGh0dHBzOi8vYXBwLnN5Yy1haS5jb20vcHJvZmFnZSAtPiDpgInmi6nmraTorr7lpIflubblronoo4UgQ2xhdWRlIOaIliBDb2RleOOAguWNuOi9ve+8mnN5Yy1ub2RlIHVuaW5zdGFsbA=='
  'es:done' = 'TGlzdG8uIEFicmUgaHR0cHM6Ly9hcHAuc3ljLWFpLmNvbS9wcm9mYWdlIC0+IGVsaWdlIGVzdGUgZGlzcG9zaXRpdm8gZSBpbnN0YWxhIENsYXVkZSBvIENvZGV4LiBQYXJhIHF1aXRhcmxvOiBzeWMtbm9kZSB1bmluc3RhbGw='
  'en:clis' = 'SW5zdGFsbCBDbGF1ZGUgQ29kZSBhbmQgQ29kZXggb24gdGhpcyBjb21wdXRlciBub3cgdG9vPyAoeW91IGNhbiBhbHNvIGRvIGl0IGxhdGVyIGZyb20gdGhlIHBhbmVsKSBbWS9uXQ=='
  'fa:clis' = 'Q2xhdWRlIENvZGUg2YggQ29kZXgg2YfZhSDYp9mE2KfZhiDYsdmI24wg2KfbjNmGINqp2KfZhdm+24zZiNiq2LEg2YbYtdioINi02YjZhtiv2J8gKNio2LnYr9in2Ysg2YfZhSDYp9iyINm+2YbZhCDZhduM4oCM2LTZiNivKSBbWS9uXQ=='
  'ar:clis' = '2YfZhCDYqtix2YrYryDYqtir2KjZitiqIENsYXVkZSBDb2RlINmIQ29kZXgg2LnZhNmJINmH2LDYpyDYp9mE2YPZhdio2YrZiNiq2LEg2KfZhNii2YYg2KPZiti22YvYp9ifICjZitmF2YPZhiDYsNmE2YMg2YTYp9it2YLZi9inINmF2YYg2KfZhNmE2YjYrdipKSBbWS9uXQ=='
  'ru:clis' = '0KPRgdGC0LDQvdC+0LLQuNGC0Ywg0L3QsCDRjdGC0L7RgiDQutC+0LzQv9GM0Y7RgtC10YAg0YLQsNC60LbQtSBDbGF1ZGUgQ29kZSDQuCBDb2RleCDRgdC10LnRh9Cw0YE/ICjQvNC+0LbQvdC+INC4INC/0L7Qt9C20LUg0LjQtyDQv9Cw0L3QtdC70LgpIFtZL25d'
  'zh:clis' = '546w5Zyo5Lmf5Zyo6L+Z5Y+w55S16ISR5LiK5a6J6KOFIENsYXVkZSBDb2RlIOWSjCBDb2RleCDlkJfvvJ/vvIjkuYvlkI7kuZ/lj6/lnKjpnaLmnb/kuK3lronoo4XvvIlbWS9uXQ=='
  'es:clis' = 'wr9JbnN0YWxhciB0YW1iacOpbiBDbGF1ZGUgQ29kZSB5IENvZGV4IGVuIGVzdGUgZXF1aXBvIGFob3JhPyAodGFtYmnDqW4gc2UgcHVlZGUgbcOhcyB0YXJkZSBkZXNkZSBlbCBwYW5lbCkgW1kvbl0='
  'en:clising' = 'SW5zdGFsbGluZyBDbGF1ZGUgQ29kZSBhbmQgQ29kZXggLi4uIChhIGZldyBtaW51dGVzKQ=='
  'fa:clising' = '2K/YsSDYrdin2YQg2YbYtdioIENsYXVkZSBDb2RlINmIIENvZGV4IC4uLiAo2obZhtivINiv2YLbjNmC2Ycp'
  'ar:clising' = '2KzYp9ix2Y0g2KrYq9io2YrYqiBDbGF1ZGUgQ29kZSDZiENvZGV4IC4uLiAo2KjYtti5INiv2YLYp9im2YIp'
  'ru:clising' = '0KPRgdGC0LDQvdCw0LLQu9C40LLQsNGOIENsYXVkZSBDb2RlINC4IENvZGV4IC4uLiAo0L3QtdGB0LrQvtC70YzQutC+INC80LjQvdGD0YIp'
  'zh:clising' = '5q2j5Zyo5a6J6KOFIENsYXVkZSBDb2RlIOWSjCBDb2RleCAuLi7vvIjpnIDopoHlh6DliIbpkp/vvIk='
  'es:clising' = 'SW5zdGFsYW5kbyBDbGF1ZGUgQ29kZSB5IENvZGV4IC4uLiAodW5vcyBtaW51dG9zKQ=='
  'en:clisok' = 'Q2xhdWRlIENvZGUgYW5kIENvZGV4IGFyZSBpbnN0YWxsZWQuIFByZXNzICJTaWduIGluIiBpbiB0aGUgcGFuZWwgdG8gY29ubmVjdCB5b3VyIGFjY291bnQu'
  'fa:clisok' = 'Q2xhdWRlIENvZGUg2YggQ29kZXgg2YbYtdioINi02K/ZhtivLiDYr9ixINm+2YbZhCDYsdmI24wgwqvZiNix2YjYr8K7INio2LLZhtuM2K8g2KrYpyDYp9qp2KfZhtiq2KrYp9mGINmI2LXZhCDYtNmI2K8u'
  'ar:clisok' = '2KrZhSDYqtir2KjZitiqIENsYXVkZSBDb2RlINmIQ29kZXguINin2LbYuti3IMKr2KrYs9is2YrZhCDYp9mE2K/YrtmI2YTCuyDZgdmKINin2YTZhNmI2K3YqSDZhNix2KjYtyDYrdiz2KfYqNmDLg=='
  'ru:clisok' = 'Q2xhdWRlIENvZGUg0LggQ29kZXgg0YPRgdGC0LDQvdC+0LLQu9C10L3Riy4g0J3QsNC20LzQuNGC0LUgwqvQktC+0LnRgtC4wrsg0LIg0L/QsNC90LXQu9C4LCDRh9GC0L7QsdGLINC/0L7QtNC60LvRjtGH0LjRgtGMINCw0LrQutCw0YPQvdGCLg=='
  'zh:clisok' = 'Q2xhdWRlIENvZGUg5ZKMIENvZGV4IOW3suWuieijheOAguWcqOmdouadv+S4reeCueKAnOeZu+W9leKAnei/nuaOpeS9oOeahOi0puaIt+OAgg=='
  'es:clisok' = 'Q2xhdWRlIENvZGUgeSBDb2RleCBpbnN0YWxhZG9zLiBQdWxzYSDCq0luaWNpYXIgc2VzacOzbsK7IGVuIGVsIHBhbmVsIHBhcmEgY29uZWN0YXIgdHUgY3VlbnRhLg=='
  'en:clisfail' = 'VGhlIGluc3RhbGwgZGlkIG5vdCBmaW5pc2ggKGRldGFpbHM6ICVVU0VSUFJPRklMRSVcLnN5Yy1ub2RlXGluc3RhbGwtY2xpcy5sb2cpLiBUcnkgYWdhaW4gZnJvbSB0aGUgcGFuZWwgd2l0aCAiSW5zdGFsbCIu'
  'fa:clisfail' = '2YbYtdioINqp2KfZhdmEINmG2LTYryAo2KzYstim24zYp9iqOiAlVVNFUlBST0ZJTEUlXC5zeWMtbm9kZVxpbnN0YWxsLWNsaXMubG9nKS4g2KfYsiDZvtmG2YQg2KjYpyDYr9qp2YXZh9mUIMKr2YbYtdiowrsg2K/ZiNio2KfYsdmHINin2YXYqtit2KfZhiDaqdmG24zYry4='
  'ar:clisfail' = '2YTZhSDZitmD2KrZhdmEINin2YTYqtir2KjZitiqICjYp9mE2KrZgdin2LXZitmEOiAlVVNFUlBST0ZJTEUlXC5zeWMtbm9kZVxpbnN0YWxsLWNsaXMubG9nKS4g2KPYudivINin2YTZhdit2KfZiNmE2Kkg2YXZhiDYp9mE2YTZiNit2Kkg2KjYstixIMKr2KrYq9io2YrYqsK7Lg=='
  'ru:clisfail' = '0KPRgdGC0LDQvdC+0LLQutCwINC90LUg0LfQsNCy0LXRgNGI0LjQu9Cw0YHRjCAo0L/QvtC00YDQvtCx0L3QvtGB0YLQuDogJVVTRVJQUk9GSUxFJVwuc3ljLW5vZGVcaW5zdGFsbC1jbGlzLmxvZykuINCf0L7QstGC0L7RgNC40YLQtSDQuNC3INC/0LDQvdC10LvQuCDQutC90L7Qv9C60L7QuSDCq9Cj0YHRgtCw0L3QvtCy0LjRgtGMwrsu'
  'zh:clisfail' = '5a6J6KOF5pyq5a6M5oiQ77yI6K+m5oOF77yaJVVTRVJQUk9GSUxFJVwuc3ljLW5vZGVcaW5zdGFsbC1jbGlzLmxvZ++8ieOAguivt+WcqOmdouadv+S4reeUqOKAnOWuieijheKAneaMiemSrumHjeivleOAgg=='
  'es:clisfail' = 'TGEgaW5zdGFsYWNpw7NuIG5vIHRlcm1pbsOzIChkZXRhbGxlczogJVVTRVJQUk9GSUxFJVwuc3ljLW5vZGVcaW5zdGFsbC1jbGlzLmxvZykuIFZ1ZWx2ZSBhIGludGVudGFybG8gZGVzZGUgZWwgcGFuZWwgY29uIMKrSW5zdGFsYXLCuy4='
  'en:lang' = 'RW5nbGlzaA=='
  'fa:lang' = '2YHYp9ix2LPbjA=='
  'ar:lang' = '2KfZhNi52LHYqNmK2Kk='
  'ru:lang' = '0KDRg9GB0YHQutC40Lk='
  'zh:lang' = '5Lit5paH'
  'es:lang' = 'RXNwYcOxb2w='
}
function M($key) {
  $v = $T["${L}:$key"]; if (-not $v) { $v = $T["en:$key"] }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($v))
}
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
function Say($m) { Write-Host ">> $m" -ForegroundColor Cyan }

if ($LangDefault -ne 'en' -and -not $env:SYC_LANG_FIXED) {
  $L = 'en'; $name = M 'lang'; $L = $LangDefault; $native = M 'lang'
  $answer = Read-Host "Language / $native :  1) English   2) $native   [2]"
  if ($answer -eq '1') { $L = 'en' } else { $L = $LangDefault }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node -and (Get-Command winget -ErrorAction SilentlyContinue)) {
  Say (M 'node')
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent | Out-Host
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $node = Get-Command node -ErrorAction SilentlyContinue
}
if (-not $node) { throw 'Node.js 20+ is required (https://nodejs.org). Install it and run this again.' }
$major = [int]((& node -p "process.versions.node.split('.')[0]"))
if ($major -lt 20) { throw "Node.js $major found; 20 or newer is required." }

New-Item -ItemType Directory -Force -Path $Home_, $Bin | Out-Null
Say (M 'download')
Invoke-WebRequest -UseBasicParsing "$Download/node/syc-node.mjs" -OutFile (Join-Path $Home_ 'syc-node.mjs')
Set-Content -Path (Join-Path $Bin 'syc-node.cmd') -Value "@echo off`r`nnode `"$Home_\syc-node.mjs`" %*" -Encoding ASCII
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$Bin*") { [Environment]::SetEnvironmentVariable('Path', "$Bin;$userPath", 'User'); $env:Path = "$Bin;$env:Path" }

Say (M 'signin')
& node (Join-Path $Home_ 'syc-node.mjs') login --server $Server --lang $L
if (Test-Path (Join-Path $Home_ 'config.json')) {
  # Hidden window: a tiny VBScript launcher so no console stays open on the desktop.
  $vbs = Join-Path $Home_ 'syc-node-hidden.vbs'
  Set-Content -Path $vbs -Encoding ASCII -Value "CreateObject(`"WScript.Shell`").Run `"`"`"$($node.Source)`"`" `"`"$Home_\syc-node.mjs`"`" run`", 0, False"
  $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName 'SYC Node' -Description 'Keeps this computer connected to your SYC-AI account (syc-ai.com). Remove with: syc-node uninstall' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName 'SYC Node'
  Say (M 'running')

  # Claude Code and Codex: the same install the panel's "Install" button runs
  # (into .syc-node\npm), offered here so a new computer is ready in one step.
  # SYC_NODE_CLIS=yes|no answers it for unattended installs. npm.cmd, not npm:
  # npm.ps1 is refused where scripts are disabled. Package names are quoted
  # because a bare @name is PowerShell splatting.
  $wantClis = $env:SYC_NODE_CLIS
  if (-not $wantClis) {
    $answer = Read-Host (M 'clis')
    $wantClis = if ($answer -match '^(n|no|2)') { 'no' } else { 'yes' }
  }
  if ($wantClis -eq 'yes') {
    Say (M 'clising')
    $npmPrefix = Join-Path $Home_ 'npm'
    $log = Join-Path $Home_ 'install-clis.log'
    # npm writes warnings to stderr; with 'Stop' Windows PowerShell 5.1 would
    # turn the first one into a terminating error.
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & npm.cmd install -g --prefix $npmPrefix '@anthropic-ai/claude-code@latest' '@openai/codex@latest' *>> $log
    $clisOk = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prev
    if ($clisOk) { Say (M 'clisok') } else { Say (M 'clisfail') }
  }
}
Say (M 'done')
