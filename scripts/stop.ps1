$ErrorActionPreference = "Stop"

$containerName = "pm-app"
$existingContainer = docker ps -aq --filter "name=^/$containerName$"

if ($existingContainer) {
    docker rm -f $containerName | Out-Null
    Write-Host "Stopped $containerName"
} else {
    Write-Host "$containerName is not running"
}
