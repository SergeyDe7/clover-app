#Requires -RunAsAdministrator
# Совместимый алиас: раньше файл назывался Install-CloverWindowsService.ps1,
# но это задача Планировщика (schtasks), а не служба Windows.
& "$PSScriptRoot\Install-CloverAutostart.ps1" @args
