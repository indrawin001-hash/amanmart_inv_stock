@echo off
cd /d "%~dp0"
"C:\Users\mdtea\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js > "..\..\work\stock-server-out.log" 2> "..\..\work\stock-server-err.log"
