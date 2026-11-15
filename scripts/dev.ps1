$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    $portableRoot = Join-Path $env:LOCALAPPDATA 'LISASLexicon\runtime'
    $portableNode = Get-ChildItem -LiteralPath $portableRoot -Directory -Filter 'node-v*-win-x64' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'node.exe') } |
        Select-Object -First 1
    if (-not $portableNode) { throw 'Installa Node.js 24 LTS (https://nodejs.org), poi riapri il terminale.' }
    $env:Path = $portableNode.FullName + ';' + $env:Path
}
Push-Location -LiteralPath $projectRoot
try { & npm.cmd run dev @args } finally { Pop-Location }
