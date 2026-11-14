# Windows: launch the packaged Rally Club build as a Pixel Streaming 2 streamer (headless window).
# Package first: RunUAT BuildCookRun -project=<path>\RallyClub.uproject -platform=Win64 -clientconfig=Shipping -build -cook -stage -pak -archive -archivedirectory=<out>
param(
  [string]$Exe = "$PSScriptRoot\..\..\unreal\Packaged\Windows\RallyClub.exe",
  [string]$Signalling = "ws://127.0.0.1:8888",
  [int]$ResX = 1920, [int]$ResY = 1080
)
& $Exe "-PixelStreamingConnectionURL=$Signalling" -RenderOffScreen -ForceRes "-ResX=$ResX" "-ResY=$ResY" -Unattended -AudioMixer -PixelStreamingEncoderCodec=H264 -log
