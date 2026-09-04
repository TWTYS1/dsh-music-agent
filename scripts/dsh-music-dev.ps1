[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('init', 'sync-plugin', 'dump-config', 'start', 'gui', 'ask')]
  [string]$Action = 'gui',
  # Named-only: without an explicit Parameter attribute PowerShell would make
  # this positional, and `ask "问题"` would try to parse the question as a port.
  [Parameter()]
  [int]$Port = 3080,
  # Open a normal browser tab instead of the standalone desktop window.
  [Parameter()]
  [switch]$Browser,
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
  [string[]]$DshArgs
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$dshHome = Join-Path $projectRoot '.dsh-music-dev'
$webProfile = 'dsh-music-agent-dev'
$cliProfile = 'dsh-music-agent-cli'
$profileCli = Join-Path $dshHome 'profiles\node_modules\@deepseek-ai\dsh\lib\bin.js'
$projectCli = Join-Path $projectRoot 'node_modules\@deepseek-ai\dsh\lib\bin.js'
$guiBundle = '@deepseek-ai/dsh-web-app'
$cliBundle = '@deepseek-ai/dsh-headless'
$musicPreset = 'music'
$env:DSH_HOME = $dshHome

function Invoke-IsolatedDsh([string]$ProfileName, [string[]]$Arguments) {
  [Console]::Error.WriteLine("[DSH-Music-Agent-Dev] DSH_HOME=$dshHome; profile=$ProfileName")
  if ($env:DSH_CLI_PATH) { & node $env:DSH_CLI_PATH @Arguments }
  elseif (Test-Path $profileCli) { & node $profileCli @Arguments }
  elseif (Test-Path $projectCli) { & node $projectCli @Arguments }
  else {
    $command = Get-Command dsh -ErrorAction SilentlyContinue
    if (-not $command) { throw 'DSH CLI not found. Set DSH_CLI_PATH to the installed dsh lib/bin.js path.' }
    & $command.Source @Arguments
  }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# dsh-base carries no user-facing surface: the browser UI comes from
# dsh-web-app and one-shot question answering comes from dsh-headless.
# A profile with only dsh-base starts and then hangs with no entry point.
#
# `bundles` is the patch-layer order and local plugins are layers too, so a
# surface bundle must sit BEFORE dsh-music-agent: these bundles restate the
# system-prompt persona, and a later layer wins. Appending would silently
# replace the music persona with the stock coding-agent one.
#
# The manifest must stay BOM-free: DSH parses it with JSON.parse.
function Add-ProfileBundle([string]$ProfileName, [string]$Bundle) {
  $manifest = Join-Path $dshHome "profiles\$ProfileName\package.json"
  if (-not (Test-Path $manifest)) { return $false }
  $json = [System.IO.File]::ReadAllText($manifest) | ConvertFrom-Json
  $bundles = @($json.dsh.profile.bundles)
  if ($bundles -contains $Bundle) { return $false }

  # Keep official bundles first, then the new one, then local plugin layers.
  $officialCount = 0
  foreach ($entry in $bundles) {
    if ($entry -like '@deepseek-ai/*') { $officialCount++ } else { break }
  }
  $ordered = @()
  if ($officialCount -gt 0) { $ordered += $bundles[0..($officialCount - 1)] }
  $ordered += $Bundle
  if ($officialCount -lt $bundles.Count) { $ordered += $bundles[$officialCount..($bundles.Count - 1)] }

  $json.dsh.profile.bundles = $ordered
  $text = ($json | ConvertTo-Json -Depth 12) + "`n"
  [System.IO.File]::WriteAllText($manifest, $text, (New-Object System.Text.UTF8Encoding($false)))
  [Console]::Error.WriteLine("[DSH-Music-Agent-Dev] added $Bundle before local plugin layers in $ProfileName")
  return $true
}

function Set-SurfaceBundles {
  $webChanged = Add-ProfileBundle $webProfile $guiBundle
  $cliChanged = Add-ProfileBundle $cliProfile $cliBundle
  return ($webChanged -or $cliChanged)
}

# Desktop shell: a Chromium app window (--app) instead of a browser tab. No extra
# runtime to install, and the window gets its own taskbar entry, so the web UI
# behaves like a native app. A dedicated --user-data-dir keeps it out of the
# user's everyday browser session and guarantees a separate window.
function Get-ChromiumPath {
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Programs\Google\Chrome\Application\chrome.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

# The server binds after this script hands control to DSH, so the window has to
# be opened by a detached waiter that polls the URL first.
function Start-DesktopShell([int]$TargetPort) {
  $chromium = Get-ChromiumPath
  if (-not $chromium) {
    [Console]::Error.WriteLine('[DSH-Music-Agent-Dev] no Edge/Chrome found; falling back to the default browser')
    return $false
  }
  $url = "http://127.0.0.1:$TargetPort"
  $dataDir = Join-Path $dshHome 'desktop-shell'
  $waiter = @'
$url = "__URL__"
for ($i = 0; $i -lt 120; $i++) {
  try { $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; break }
  catch { Start-Sleep -Milliseconds 500 }
}
Start-Process -FilePath "__CHROMIUM__" -ArgumentList "--app=$url", "--user-data-dir=__DATADIR__", "--window-size=1180,860", "--no-first-run", "--no-default-browser-check"
'@
  $waiter = $waiter.Replace('__URL__', $url).Replace('__CHROMIUM__', $chromium).Replace('__DATADIR__', $dataDir)
  # -EncodedCommand avoids a second round of quote parsing: the Edge path holds
  # spaces and parentheses that break a plain -Command string.
  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($waiter))
  Start-Process -FilePath 'powershell' -WindowStyle Hidden -ArgumentList '-NoProfile', '-EncodedCommand', $encoded | Out-Null
  [Console]::Error.WriteLine("[DSH-Music-Agent-Dev] desktop window -> $url ($(Split-Path -Leaf $chromium))")
  return $true
}

# Agent presets live under $DSH_HOME, which is generated state excluded from git.
# The authoritative copies sit in the repo under presets/, so a fresh clone
# reproduces the music preset instead of falling back to the coding-agent default.
function Sync-AgentPreset {
  $source = Join-Path $projectRoot 'presets'
  if (-not (Test-Path -LiteralPath $source)) { return }
  $target = Join-Path $dshHome '.agent-presets'
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
  $names = (Get-ChildItem -LiteralPath $source -Directory | ForEach-Object { $_.Name }) -join ', '
  [Console]::Error.WriteLine("[DSH-Music-Agent-Dev] synced agent presets: $names")
}

# The music preset must also be written into the USER settings layer, not only
# into cordis.patch.yml. dsh-agent-presets treats `config.default` as an assembly
# base that the user settings document overrides — so once the GUI's preset
# picker writes a value, the patched default is permanently shadowed.
#
# Only the agent-presets key is touched; every other setting is preserved.
function Set-DefaultPreset {
  $settings = Join-Path $dshHome 'settings.yaml'
  $lines = if (Test-Path -LiteralPath $settings) {
    @([System.IO.File]::ReadAllLines($settings))
  } else { @() }

  # Drop any existing agent-presets block (the key plus its indented body).
  $kept = @()
  $skipping = $false
  foreach ($line in $lines) {
    if ($line -match '^agent-presets:') { $skipping = $true; continue }
    if ($skipping) {
      if ($line -match '^\s' -or $line.Trim() -eq '') { continue }
      $skipping = $false
    }
    $kept += $line
  }

  $rebuilt = @($kept | Where-Object { $_.Trim() -ne '' }) + @('agent-presets:', "  default: $musicPreset")
  $text = ($rebuilt -join "`n") + "`n"
  [System.IO.File]::WriteAllText($settings, $text, (New-Object System.Text.UTF8Encoding($false)))
  [Console]::Error.WriteLine("[DSH-Music-Agent-Dev] user setting agent-presets.default=$musicPreset")
}

$linkSpec = 'link:' + $projectRoot.Replace('\', '/')
function Sync-Plugin {
  Invoke-IsolatedDsh $webProfile @('plugin', '--profile', $webProfile, 'add', $linkSpec)
  Invoke-IsolatedDsh $cliProfile @('plugin', '--profile', $cliProfile, 'add', $linkSpec)
}

switch ($Action) {
  'init' {
    Invoke-IsolatedDsh $webProfile @('plugin', '--profile', $webProfile, 'list', '--depth=0')
    Invoke-IsolatedDsh $cliProfile @('plugin', '--profile', $cliProfile, 'list', '--depth=0')
    Set-SurfaceBundles | Out-Null
    Sync-AgentPreset
    Set-DefaultPreset
    Sync-Plugin
  }
  'sync-plugin' {
    # A bundle change only takes effect after the profile is installed again.
    Set-SurfaceBundles | Out-Null
    Sync-AgentPreset
    Set-DefaultPreset
    Sync-Plugin
  }
  'dump-config' { Invoke-IsolatedDsh $webProfile @('--profile', $webProfile, '--dump-config') }
  'start' { Invoke-IsolatedDsh $webProfile (@('--profile', $webProfile) + $DshArgs) }
  'gui' {
    Sync-AgentPreset
    Set-DefaultPreset
    if (Set-SurfaceBundles) { Sync-Plugin }
    $arguments = @('--profile', $webProfile, '--port', "$Port")
    # --no-open suppresses DSH's own browser launch so the desktop window is the
    # only surface that opens.
    if (-not $Browser -and (Start-DesktopShell $Port)) { $arguments += '--no-open' }
    Invoke-IsolatedDsh $webProfile ($arguments + $DshArgs)
  }
  'ask' {
    if ($DshArgs.Count -eq 0) { throw 'ask needs a question, e.g. pnpm run dsh:ask "推荐几首适合通勤的轻松音乐"' }
    if (Set-SurfaceBundles) { Sync-Plugin }
    Invoke-IsolatedDsh $cliProfile (@('--profile', $cliProfile) + $DshArgs)
  }
}
