$ErrorActionPreference = 'Stop'
$root = 'C:\Users\ASUS\Navya'
$patch = Split-Path -Parent $MyInvocation.MyCommand.Path

Copy-Item "$patch\backend\src\index.ts" "$root\backend\src\index.ts" -Force
Copy-Item "$patch\backend\src\routes\microgrid.ts" "$root\backend\src\routes\microgrid.ts" -Force
Copy-Item "$patch\backend\src\routes\scenario.ts" "$root\backend\src\routes\scenario.ts" -Force
Copy-Item "$patch\backend\src\services\engineClient.ts" "$root\backend\src\services\engineClient.ts" -Force
Copy-Item "$patch\frontend\src\App.tsx" "$root\frontend\src\App.tsx" -Force

Write-Host ''
Write-Host 'NAVYA FINAL REPAIR APPLIED.' -ForegroundColor Green
Write-Host 'Backend: auth + signal API aliases, contract adapters, engine wiring.'
Write-Host 'Frontend: live refresh, optimize/scenario response handling, login recovery.'
Write-Host ''
Write-Host 'Now run:' -ForegroundColor Cyan
Write-Host '  cd C:\Users\ASUS\Navya\backend'
Write-Host '  npx tsc --noEmit'
Write-Host '  npm run dev'
Write-Host ''
Write-Host 'Then in another terminal:' -ForegroundColor Cyan
Write-Host '  cd C:\Users\ASUS\Navya\frontend'
Write-Host '  npm run dev'
