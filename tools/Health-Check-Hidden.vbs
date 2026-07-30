Option Explicit

Dim shell, fileSystem, scriptDirectory, healthScript, commandLine
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
healthScript = fileSystem.BuildPath(scriptDirectory, "Health-Check.ps1")
commandLine = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & healthScript & """"

' Window style 0 means completely hidden. The health check remains independent
' from the browser and does not flash a PowerShell console over Clover.
shell.Run commandLine, 0, False
