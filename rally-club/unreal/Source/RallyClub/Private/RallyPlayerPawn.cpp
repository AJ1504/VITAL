#include "RallyPlayerPawn.h"

#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "GameFramework/PlayerController.h"
#include "RallyMatchGameMode.h"

ARallyPlayerPawn::ARallyPlayerPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	Capsule = CreateDefaultSubobject<UCapsuleComponent>(TEXT("Capsule"));
	Capsule->InitCapsuleSize(30.f, 85.f);
	Capsule->SetCollisionProfileName(TEXT("Pawn"));
	RootComponent = Capsule;
	Body = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(Capsule);
	Body->SetRelativeLocation(FVector(0, 0, -85.f));
	Paddle = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Paddle"));
	Paddle->SetupAttachment(Body, TEXT("hand_r")); // socket on the stylised skeleton
	Paddle->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	AutoPossessPlayer = EAutoReceiveInput::Disabled;
}

void ARallyPlayerPawn::InitForSide(int32 InSide, ARallyMatchGameMode* InMode)
{
	Side = InSide;
	Mode = InMode;
}

void ARallyPlayerPawn::PossessedBy(AController* NewController)
{
	Super::PossessedBy(NewController);
	if (APlayerController* PC = Cast<APlayerController>(NewController))
	{
		if (UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			if (MappingContext) Sub->AddMappingContext(MappingContext, 0);
		}
	}
}

void ARallyPlayerPawn::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	UEnhancedInputComponent* Input = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!Input) return;
	if (MoveAction)
	{
		Input->BindAction(MoveAction, ETriggerEvent::Triggered, this, &ARallyPlayerPawn::OnMove);
		Input->BindAction(MoveAction, ETriggerEvent::Completed, this, &ARallyPlayerPawn::OnMoveEnd);
	}
	if (DriveAction) Input->BindActionValueLambda(DriveAction, ETriggerEvent::Started, [this](const FInputActionValue&) { Swing(RallyCore::EShotType::Drive); });
	if (DinkAction) Input->BindActionValueLambda(DinkAction, ETriggerEvent::Started, [this](const FInputActionValue&) { Swing(RallyCore::EShotType::Dink); });
	if (LobAction) Input->BindActionValueLambda(LobAction, ETriggerEvent::Started, [this](const FInputActionValue&) { Swing(RallyCore::EShotType::Lob); });
}

void ARallyPlayerPawn::OnMove(const FInputActionValue& V) { Move = V.Get<FVector2D>(); }
void ARallyPlayerPawn::OnMoveEnd(const FInputActionValue&) { Move = FVector2D::ZeroVector; }

void ARallyPlayerPawn::Swing(RallyCore::EShotType Shot)
{
	if (!Mode.IsValid()) return;
	RallyCore::ControlInput In;
	In.MoveX = Move.X;
	In.MoveZ = Move.Y;
	In.bSwing = true;
	In.Shot = Shot;
	In.Aim = FMath::Clamp(Move.X, -1.0, 1.0);
	Mode->SetHumanInput(In);
}

void ARallyPlayerPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (IsLocallyControlled() && Mode.IsValid())
	{
		RallyCore::ControlInput In;
		In.MoveX = Move.X; // player frame: +X right
		In.MoveZ = Move.Y; // player frame: +Y toward the net
		Mode->SetHumanInput(In);
	}
}

void ARallyPlayerPawn::ApplySimState(const FVector& WorldPos, const FRotator& Facing, const RallyCore::PlayerState& P)
{
	SetActorLocationAndRotation(WorldPos + FVector(0, 0, 85.f), Facing);
	GroundSpeed = FMath::Sqrt(P.Vel.x * P.Vel.x + P.Vel.z * P.Vel.z) * 100.f;
	SwingAlpha = static_cast<float>(P.SwingAnim);
	bBackhand = P.Stroke == RallyCore::EStroke::Backhand;
	bServing = P.Stroke == RallyCore::EStroke::Serve && P.SwingAnim > 0;
	bCelebrating = P.Anim == RallyCore::EAnim::Celebrate;
	bDejected = P.Anim == RallyCore::EAnim::Dejected;
}
