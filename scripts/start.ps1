$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$imageName = "pm-app"
$containerName = "pm-app"
$dataDir = Join-Path $root "backend\data"

Set-Location $root
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

docker build -t $imageName .
if ($LASTEXITCODE -ne 0) {
    throw "Docker build failed."
}

$existingContainer = docker ps -aq --filter "name=^/$containerName$"
if ($existingContainer) {
    docker rm -f $containerName | Out-Null
}

docker run -d --env-file ".env" -p 8000:8000 -v "${dataDir}:/app/backend/data" --name $containerName $imageName | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Docker run failed."
}

Write-Host "App running at http://127.0.0.1:8000"
