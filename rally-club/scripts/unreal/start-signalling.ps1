# Windows: start Epic's Pixel Streaming signalling/web server (UE 5.6 branch) serving the Rally Club site.
#   Players open http://<host>/ ; Unreal connects to ws://<host>:8888 (see run-streamed-game.ps1).
param([int]$PlayerPort = 80, [int]$StreamerPort = 8888)
$ErrorActionPreference = 'Stop'
$Club = Resolve-Path "$PSScriptRoot\..\.."
$Infra = if ($env:PS_INFRA_DIR) { $env:PS_INFRA_DIR } else { "$Club\.pixelstreaming\PixelStreamingInfrastructure" }
if (-not (Test-Path "$Club\dist\web\stream.html")) { throw "Build the site first: cd $Club; npm run build" }
if (-not (Test-Path $Infra)) { git clone --depth 1 --branch UE5.6 https://github.com/EpicGamesExt/PixelStreamingInfrastructure.git $Infra }
Set-Location "$Infra\SignallingWebServer"
& .\platform_scripts\cmd\start.bat --serve --http_root "$Club\dist\web" --homepage stream.html --player_port $PlayerPort --streamer_port $StreamerPort @args
