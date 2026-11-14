#include "RallyBroadcastCamera.h"

#include "AtmosphereDirectorSubsystem.h"
#include "Camera/CameraComponent.h"
#include "Kismet/GameplayStatics.h"
#include "RallyMatchGameMode.h"

ARallyBroadcastCamera::ARallyBroadcastCamera()
{
	PrimaryActorTick.bCanEverTick = true;
	GetCameraComponent()->SetFieldOfView(40.f);
	GetCameraComponent()->bConstrainAspectRatio = false;
}

void ARallyBroadcastCamera::BeginPlay()
{
	Super::BeginPlay();
	if (UAtmosphereDirectorSubsystem* Director = GetWorld()->GetSubsystem<UAtmosphereDirectorSubsystem>())
	{
		Director->OnCameraCue.AddDynamic(this, &ARallyBroadcastCamera::HandleCameraCue);
	}
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0)) PC->SetViewTarget(this);
}

void ARallyBroadcastCamera::HandleCameraCue(ERallyCameraAction Action)
{
	if (bReducedMotion && Action != ERallyCameraAction::ServeView && Action != ERallyCameraAction::RallyFollow) return;
	if (Mode == ERallyCameraAction::Celebrate) return;
	Mode = Action;
	ModeTime = 0.f;
}

void ARallyBroadcastCamera::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	ModeTime += DeltaSeconds;
	const ARallyMatchGameMode* GM = Cast<ARallyMatchGameMode>(UGameplayStatics::GetGameMode(this));
	if (!GM || !GM->GetSim()) return;
	const RallyCore::MatchSim& Sim = *GM->GetSim();

	FVector DesiredLocal;
	FVector LookLocal;
	if (Mode == ERallyCameraAction::Celebrate)
	{
		const int32 W = Sim.Rules.State().Winner ? *Sim.Rules.State().Winner : 0;
		const FVector Win = RallyUE::ToUnreal(Sim.Players[W].Pos);
		const float A = ModeTime * (bReducedMotion ? 0.05f : 0.35f);
		DesiredLocal = Win + FVector(FMath::Cos(A) * 500.f, FMath::Sin(A) * 500.f, 260.f);
		LookLocal = Win + FVector(0, 0, 110.f);
	}
	else
	{
		const FVector Ball = RallyUE::ToUnreal(Sim.Ball.P);
		const float Push = Mode == ERallyCameraAction::TensionPush ? 0.9f : 1.f;
		const float Sweep = Mode == ERallyCameraAction::PointSweep && ModeTime < 2.f ? FMath::Sin(ModeTime / 2.f * PI) * 120.f : 0.f;
		DesiredLocal = FVector(BroadcastOffset.X * Push, Ball.Y * FollowBallLateral + Sweep, BroadcastOffset.Z * Push);
		LookLocal = FVector(-90.f, Ball.Y * 0.12f, 0.f);
	}
	const FTransform& Origin = GM->CourtOrigin;
	const FVector Desired = Origin.TransformPosition(DesiredLocal);
	const FVector Look = Origin.TransformPosition(LookLocal);
	const float K = 1.f - FMath::Exp(-4.f * DeltaSeconds);
	const FVector NewLoc = FMath::Lerp(GetActorLocation(), Desired, K);
	SetActorLocationAndRotation(NewLoc, (Look - NewLoc).Rotation());
}
