$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$imageName = "pm-app"
$containerName = "pm-app"

Set-Location $root

docker build -t $imageName .

$existingContainer = docker ps -aq --filter "name=^/$containerName$"
if ($existingContainer) {
    docker rm -f $containerName | Out-Null
}

docker run -d --env-file ".env" -p 8000:8000 --name $containerName $imageName | Out-Null

Write-Host "App running at http://127.0.0.1:8000"
