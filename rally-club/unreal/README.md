# Rally Club — Unreal Engine 5 project

**Pinned engine: Unreal Engine 5.6** (`RallyClub.uproject` → `EngineAssociation`). See
`docs/FEATURE_STATUS.md` for why, and upgrade only after the module compiles on the workstation.

> **Build status:** the engine-agnostic core in `Source/RallyClub/Core` (rules, physics, shot solver,
> match loop, AI) **is compiled and tested** without Unreal via `CoreTests/` (18/18 passing, and
> bit-identical to the TypeScript core). The UE gameplay module (`Public/`, `Private/`, `Tests/`) has
> **not been compiled** — the authoring environment had no Unreal Engine or GPU. Expect to fix minor
> API drift on first build.

## Build & run (workstation with UE 5.6)

```bash
# Windows (from the engine's Build/BatchFiles):
RunUAT.bat BuildCookRun -project="%CD%\RallyClub.uproject" -platform=Win64 -clientconfig=Development -build
# or generate IDE files: right-click RallyClub.uproject → Generate Visual Studio project files, build "RallyClubEditor".

# Linux:
$UE_ROOT/Engine/Build/BatchFiles/Linux/Build.sh RallyClubEditor Linux Development -Project="$PWD/RallyClub.uproject"

# Automation tests (headless):
UnrealEditor-Cmd RallyClub.uproject -ExecCmds="Automation RunTests RallyClub; Quit" -unattended -nullrhi -log

# Core tests without Unreal (any C++17 compiler + CMake):
cmake -S CoreTests -B ../build/core-tests && cmake --build ../build/core-tests && ../build/core-tests/rally_core_tests
```

## Layout

| Path | Contents |
| --- | --- |
| `Source/RallyClub/Core/` | `RallyCore.*` (court, physics, solver, rules) and `RallyMatch.*` (MatchSim, AI) — plain C++17 |
| `Source/RallyClub/Public|Private/` | `ARallyMatchGameMode`, `ARallyPlayerPawn`, `ARallyBall`, `UAtmosphereDirectorSubsystem`, `ARallyDJBooth`, `ARallyCrowd`, `ARallyBroadcastCamera` |
| `Source/RallyClub/Tests/` | Unreal Automation tests (rules, solver, full AI-vs-AI match with TS parity score) |
| `CoreTests/` | CMake test runner for the core (also `--parity` mode used by `scripts/parity-check.sh`) |
| `Config/` | Default map/game mode, renderer (Lumen, VSM), Enhanced Input classes, audio mixer |
| `Content/` | Editor-authored assets — see `Content/README.md` |
