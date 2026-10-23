# Ejecutar manualmente, como el usuario Windows que operará el sistema.
$root = Split-Path $PSScriptRoot -Parent
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path $startup 'ThordyPedidos.lnk'))
$link.TargetPath = Join-Path $root 'scripts\start.cmd'
$link.WorkingDirectory = $root
$link.Save()
Write-Host 'Inicio al iniciar sesión configurado. Eliminar el acceso directo de Inicio para deshabilitarlo.'
