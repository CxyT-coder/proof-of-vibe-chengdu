[CmdletBinding()]
param([string]$Distribution = 'Ubuntu')

$ErrorActionPreference = 'Stop'

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    throw 'WSL is unavailable. Install WSL2 and Ubuntu first.'
}

$projectPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$linuxProjectPath = & wsl.exe --distribution $Distribution -- wslpath -u $projectPath
if ($LASTEXITCODE -ne 0) {
    throw "Cannot resolve the project in WSL distribution '$Distribution'. Check wsl --list --verbose."
}
$linuxProjectPath = ($linuxProjectPath -join "`n").Trim()
if (-not $linuxProjectPath.StartsWith('/')) {
    throw 'WSL returned an invalid project path.'
}

function ConvertTo-BashArgument([string]$Value) {
    return "'" + $Value.Replace("'", "'\''") + "'"
}

$bashScript = @'
set -eu
project_dir="$1"
cd -- "$project_dir"
runtime_dir="$project_dir/.tools/node-v24.14.1-linux-x64"
if [ -x "$runtime_dir/bin/node" ]; then
  export PATH="$runtime_dir/bin:$PATH"
  node_binary="$runtime_dir/bin/node"
  npm_cli="$runtime_dir/lib/node_modules/npm/bin/npm-cli.js"
else
  node_binary="$(command -v node || true)"
  npm_binary="$(command -v npm || true)"
  if [ -z "$node_binary" ] || [ -z "$npm_binary" ]; then
    printf '%s\n' 'Install Linux Node.js 24+ and npm inside Ubuntu, then retry.' >&2
    exit 1
  fi
  npm_cli="$(readlink -f "$npm_binary")"
  case "$npm_cli" in
    *.js) ;;
    *) printf '%s\n' 'The npm executable is not a Linux npm CLI. Install npm inside Ubuntu.' >&2; exit 1 ;;
  esac
fi
if [ "$("$node_binary" -p 'process.platform')" != 'linux' ]; then
  printf '%s\n' 'This script needs Linux Node.js inside WSL, not Windows node.exe.' >&2
  exit 1
fi
node_major="$("$node_binary" -p 'Number(process.versions.node.split(".")[0])')"
if [ "$node_major" -lt 24 ]; then
  printf '%s\n' 'Node.js 24 or newer is required.' >&2
  exit 1
fi
if [ ! -d node_modules ]; then
  printf '%s\n' 'Dependencies are missing. Run npm ci in this Ubuntu project directory first.' >&2
  exit 1
fi
"$node_binary" --version
# Build first so Next.js generates its route types before the standalone tsc check.
"$node_binary" "$npm_cli" run build
"$node_binary" "$npm_cli" run typecheck
"$node_binary" "$npm_cli" run test
'@

$encodedScript = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($bashScript -replace "`r", '')))
$command = 'printf %s ' + $encodedScript + ' | base64 --decode | bash --noprofile --norc -s -- ' + (ConvertTo-BashArgument $linuxProjectPath)

Write-Host "Checking Proof of Vibe in WSL '$Distribution': build, typecheck, test"
& wsl.exe --distribution $Distribution -- bash --noprofile --norc -c $command
if ($LASTEXITCODE -ne 0) {
    throw "The WSL checks failed with code $LASTEXITCODE."
}
