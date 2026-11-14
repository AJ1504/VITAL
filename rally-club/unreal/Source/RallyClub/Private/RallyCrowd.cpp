#include "RallyCrowd.h"

#include "AtmosphereDirectorSubsystem.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Kismet/GameplayStatics.h"

ARallyCrowd::ARallyCrowd()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Bodies = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(TEXT("Bodies"));
	Bodies->SetupAttachment(RootComponent);
	Bodies->NumCustomDataFloats = 4; // RGB outfit + phase
	Heads = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(TEXT("Heads"));
	Heads->SetupAttachment(RootComponent);
	Heads->NumCustomDataFloats = 4; // RGB skin + phase
	for (UHierarchicalInstancedStaticMeshComponent* C : {Bodies.Get(), Heads.Get()})
	{
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->SetMobility(EComponentMobility::Movable);
	}
}

void ARallyCrowd::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Bodies->ClearInstances();
	Heads->ClearInstances();
	People.Reset();
	FRandomStream R(11);
	// Palette from the art direction (brief §1): coral, cobalt, lavender, gold, cream, emerald.
	static const FLinearColor Outfits[] = {FLinearColor(0.94f, 0.48f, 0.37f), FLinearColor(0.17f, 0.31f, 0.66f), FLinearColor(0.71f, 0.62f, 0.85f),
		FLinearColor(0.95f, 0.71f, 0.27f), FLinearColor(0.96f, 0.92f, 0.84f), FLinearColor(0.12f, 0.37f, 0.29f)};
	static const FLinearColor Skins[] = {FLinearColor(0.96f, 0.83f, 0.70f), FLinearColor(0.91f, 0.70f, 0.56f), FLinearColor(0.79f, 0.56f, 0.40f),
		FLinearColor(0.64f, 0.44f, 0.29f), FLinearColor(0.48f, 0.31f, 0.20f), FLinearColor(0.35f, 0.22f, 0.15f)};
	for (const FRallySeatRow& Row : Rows)
	{
		for (int32 I = 0; I < Row.Seats; ++I)
		{
			if (R.FRand() > Density) continue;
			const float T = Row.Seats > 1 ? static_cast<float>(I) / (Row.Seats - 1) : 0.f;
			FSpectator S{FMath::Lerp(Row.Start, Row.End, T), Row.FacingYaw + R.FRandRange(-12.f, 12.f), Row.bStanding, R.FRandRange(0.6f, 1.4f), R.FRandRange(0.f, 10.f)};
			People.Add(S);
			const FTransform Body(FRotator(0, S.Yaw, 0), S.Base + FVector(0, 0, S.bStanding ? 80.f : 55.f), FVector(0.4f, 0.4f, 0.55f));
			const FTransform Head(FRotator(0, S.Yaw, 0), S.Base + FVector(0, 0, S.bStanding ? 150.f : 125.f), FVector(0.34f));
			const int32 Bi = Bodies->AddInstance(Body);
			const int32 Hi = Heads->AddInstance(Head);
			const FLinearColor O = Outfits[R.RandRange(0, UE_ARRAY_COUNT(Outfits) - 1)];
			const FLinearColor Sk = Skins[R.RandRange(0, UE_ARRAY_COUNT(Skins) - 1)];
			Bodies->SetCustomData(Bi, {O.R, O.G, O.B, S.Phase});
			Heads->SetCustomData(Hi, {Sk.R, Sk.G, Sk.B, S.Phase});
		}
	}
}

void ARallyCrowd::BeginPlay()
{
	Super::BeginPlay();
	if (UAtmosphereDirectorSubsystem* Director = GetWorld()->GetSubsystem<UAtmosphereDirectorSubsystem>())
	{
		Director->OnCrowdCue.AddDynamic(this, &ARallyCrowd::HandleCrowdCue);
	}
}

void ARallyCrowd::HandleCrowdCue(ERallyCrowdState NewState, float NewIntensity)
{
	State = NewState;
	Intensity = NewIntensity;
	StateAge = 0.f;
}

void ARallyCrowd::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	StateAge += DeltaSeconds;
	// Transient reactions decay back to idle (matches web/src/scene/crowd.ts).
	const float Len = State == ERallyCrowdState::Cheer ? 2.6f : State == ERallyCrowdState::Gasp ? 0.9f : State == ERallyCrowdState::Applause ? 3.f : State == ERallyCrowdState::Ovation ? 8.f : -1.f;
	if (Len > 0 && StateAge > Len)
	{
		State = State == ERallyCrowdState::Gasp ? ERallyCrowdState::Cheer : ERallyCrowdState::Idle;
		StateAge = 0.f;
	}

	FVector CamLoc = FVector::ZeroVector;
	if (APlayerCameraManager* Cam = UGameplayStatics::GetPlayerCameraManager(this, 0)) CamLoc = Cam->GetCameraLocation();
	const float LodSq = AnimLodDistance * AnimLodDistance;

	for (int32 I = 0; I < People.Num(); ++I)
	{
		FSpectator& P = People[I];
		if (FVector::DistSquared(P.Base, CamLoc) > LodSq) continue; // far rows: material WPO sway only
		P.Phase += DeltaSeconds * (1.f + P.Excitability);
		float Jump = 0.f, Lean = 0.f;
		switch (State)
		{
		case ERallyCrowdState::Tension: Lean = 12.f * Intensity; break;
		case ERallyCrowdState::Murmur: Lean = 6.f; break;
		case ERallyCrowdState::Gasp: Lean = -12.f; break;
		case ERallyCrowdState::Cheer:
		case ERallyCrowdState::Ovation:
			Jump = FMath::Max(0.f, FMath::Sin(P.Phase * 5.f)) * 18.f * (State == ERallyCrowdState::Ovation ? 1.f : Intensity) * P.Excitability;
			break;
		default: break;
		}
		const bool bStand = P.bStanding || State == ERallyCrowdState::Ovation || (State == ERallyCrowdState::Cheer && Intensity * P.Excitability > 0.75f);
		const float BaseZ = bStand ? 80.f : 55.f;
		const FRotator Rot(Lean, P.Yaw, FMath::Sin(P.Phase * 0.7f) * 2.f);
		Bodies->UpdateInstanceTransform(I, FTransform(Rot, P.Base + FVector(0, 0, BaseZ + Jump), FVector(0.4f, 0.4f, 0.55f)), false, false, true);
		Heads->UpdateInstanceTransform(I, FTransform(Rot, P.Base + FVector(0, 0, BaseZ + 70.f + Jump), FVector(0.34f)), false, false, true);
	}
	Bodies->MarkRenderStateDirty();
	Heads->MarkRenderStateDirty();
}
