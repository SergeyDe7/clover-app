CLOVER → 1C TEST: REAL ORDER QUEUE UPDATE (installer fix V2)

1. Extract ALL files from this ZIP directly into:
   C:\Users\Lonovo\Desktop\Clover\clover-app
2. Confirm replacement of files if Windows asks.
3. Right-click INSTALL_CLOVER_1C_QUEUE_UPDATE.bat and choose
   "Run as administrator".
4. Wait for UPDATE INSTALLED SUCCESSFULLY and press any key.

The V2 installer no longer calls tools\Stop-Clover.ps1, because that old
script could terminate the installer itself. It stops only Clover's Node
processes and the known Clover ports.

The installer preserves server\.env, server\data, server\uploads and creates
code/data backups before replacing application code.
