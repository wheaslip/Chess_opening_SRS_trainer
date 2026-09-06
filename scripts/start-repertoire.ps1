$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
$trainerUrl = 'http://localhost:3000/'

try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $trainerUrl -TimeoutSec 1
    if ($response.StatusCode -eq 200) {
        Start-Process $trainerUrl
        exit 0
    }
} catch {
    # The server is not running yet.
}

$pnpmCommand = Get-Command 'pnpm.cmd' -ErrorAction SilentlyContinue
$pnpmPath = if ($pnpmCommand) {
    $pnpmCommand.Source
} else {
    Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
}

if (-not (Test-Path -LiteralPath $pnpmPath)) {
    throw 'pnpm was not found. Install pnpm, then try the launcher again.'
}

Start-Process -FilePath $pnpmPath -ArgumentList 'dev' -WorkingDirectory $projectDirectory -WindowStyle Hidden

$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $trainerUrl -TimeoutSec 1
        if ($response.StatusCode -eq 200) {
            Start-Process $trainerUrl
            exit 0
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

throw 'The trainer did not start within 45 seconds. Run pnpm dev in this folder to see more details.'
