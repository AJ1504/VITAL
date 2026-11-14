#include "RallyMatchGameMode.h"

#include "AtmosphereDirectorSubsystem.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "RallyBall.h"
#include "RallyClub.h"
#include "RallyPlayerPawn.h"
#include "RallyStreamBridge.h"

using namespace RallyCore;

ARallyMatchGameMode::ARallyMatchGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	DefaultPawnClass = ARallyPlayerPawn::StaticClass();
	BallClass = ARallyBall::StaticClass();
	OpponentClass = ARallyPlayerPawn::StaticClass();
}

void ARallyMatchGameMode::BeginPlay()
{
	Super::BeginPlay();
	Director = GetWorld()->GetSubsystem<UAtmosphereDirectorSubsystem>();
	// Pixel Streaming bridge: lets the website drive this match and receive score/commentary.
	if (!StreamBridge) StreamBridge = GetWorld()->SpawnActor<ARallyStreamBridge>();
	StartMatch();
}

void ARallyMatchGameMode::StartMatch()
{
	MatchOptions Opts;
	Opts.Assist = {bAutoplay ? EAssist::Classic : ToCore(PlayerAssist), EAssist::Classic};
	Opts.PointsToWin = PointsToWin;
	Opts.Seed = static_cast<uint32>(FMath::Rand());
	Sim = MakeUnique<MatchSim>(Opts);

	const AiProfile& Profile = OpponentDifficulty == 0 ? AiEasy() : OpponentDifficulty == 2 ? AiHard() : AiMedium();
	Ai[1] = MakeUnique<AiController>(1, Profile, Opts.Seed ^ 0x9e3779b9u);
	Ai[0] = bAutoplay ? MakeUnique<AiController>(0, AiMedium(), Opts.Seed ^ 0x85ebca6bu) : nullptr;

	UWorld* World = GetWorld();
	if (!Ball && BallClass) Ball = World->SpawnActor<ARallyBall>(BallClass, CoreToWorld(Sim->Ball.P), FRotator::ZeroRotator);
	Players[0] = Cast<ARallyPlayerPawn>(UGameplayStatics::GetPlayerPawn(this, 0));
	if (!Players[1] && OpponentClass)
	{
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		Players[1] = World->SpawnActor<ARallyPlayerPawn>(OpponentClass, CoreToWorld(Sim->Players[1].Pos), FRotator(0, 0, 0), Params);
	}
	if (Players[0]) Players[0]->InitForSide(0, this);
	if (Players[1]) Players[1]->InitForSide(1, this);

	if (Director) Director->BeginMatch(TEXT("You"), OpponentDifficulty == 0 ? TEXT("Coco") : OpponentDifficulty == 2 ? TEXT("Ines") : TEXT("Rafa"), PointsToWin);
	RallyLength = 0;
	UE_LOG(LogRallyClub, Log, TEXT("Match started: first to %d, assist %d, seed %u"), PointsToWin, static_cast<int32>(PlayerAssist), Opts.Seed);
}

void ARallyMatchGameMode::SetHumanInput(const ControlInput& In)
{
	HumanInput.MoveX = In.MoveX;
	HumanInput.MoveZ = In.MoveZ;
	if (In.bSwing)
	{
		HumanInput.bSwing = true;
		HumanInput.Shot = In.Shot;
		HumanInput.Aim = In.Aim;
	}
}

void ARallyMatchGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!Sim) return;

	std::array<ControlInput, 2> Inputs;
	Inputs[0] = Ai[0] ? Ai[0]->Think(*Sim, DeltaSeconds) : HumanInput;
	Inputs[1] = Ai[1] ? Ai[1]->Think(*Sim, DeltaSeconds) : ControlInput{};
	Sim->Update(DeltaSeconds, Inputs);
	HumanInput.bSwing = false; // edge-triggered

	for (const SimEvent& E : Sim->DrainEvents())
	{
		if (E.Type == ESimEvent::Rule && E.Rule.Type == ERuleEvent::Hit) RallyLength = E.Rule.HitCount;
		if (E.Type == ESimEvent::Rule && E.Rule.Type == ERuleEvent::Serve) RallyLength = 1;
		if (E.Type == ESimEvent::Contact && Ball) Ball->OnStruck(E.Speed, E.bPerfect);
		if (E.Type == ESimEvent::BallBounce && Ball) Ball->OnBounce(E.Speed);
		if (Director) Director->HandleSimEvent(E);
	}
	SyncActors();
}

void ARallyMatchGameMode::SyncActors()
{
	if (Ball)
	{
		Ball->SetActorLocation(CoreToWorld(Sim->Ball.P));
		Ball->SetActorHiddenInGame(Sim->Ball.P.y < -1);
	}
	for (int32 I = 0; I < 2; ++I)
	{
		if (!Players[I]) continue;
		const PlayerState& P = Sim->Players[I];
		// Side 0 faces -z (core) = -X (Unreal); side 1 faces +X.
		const FRotator Facing = CourtOrigin.GetRotation().Rotator() + FRotator(0, I == 0 ? 180.f : 0.f, 0);
		Players[I]->ApplySimState(CoreToWorld(P.Pos), Facing, P);
	}
}

FRallyScoreboard ARallyMatchGameMode::GetScoreboard() const
{
	FRallyScoreboard S;
	if (!Sim) return S;
	const RulesState& St = Sim->Rules.State();
	S.Score0 = St.Score[0];
	S.Score1 = St.Score[1];
	S.Server = St.Server;
	S.RallyLength = RallyLength;
	S.ScoreCall = UTF8_TO_TCHAR(Sim->Rules.ScoreCall().c_str());
	S.bGameOver = St.Phase == EPhase::GameOver;
	S.Winner = St.Winner ? *St.Winner : -1;
	return S;
}
