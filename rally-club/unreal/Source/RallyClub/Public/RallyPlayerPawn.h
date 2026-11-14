// Player character. Rendering-only: position, facing and animation come from RallyCore::MatchSim.
// The locally controlled pawn also gathers fallback input via Enhanced Input (keyboard/gamepad);
// P2 adds the phone motion controller, which produces the same RallyCore::ControlInput.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "InputActionValue.h"
#include "RallyTypes.h"

#include "RallyPlayerPawn.generated.h"

class UCapsuleComponent;
class USkeletalMeshComponent;
class UStaticMeshComponent;
class UInputAction;
class UInputMappingContext;
class ARallyMatchGameMode;

UCLASS()
class RALLYCLUB_API ARallyPlayerPawn : public APawn
{
	GENERATED_BODY()

public:
	ARallyPlayerPawn();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UCapsuleComponent> Capsule;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<USkeletalMeshComponent> Body;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UStaticMeshComponent> Paddle;

	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputMappingContext> MappingContext;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> MoveAction;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> DriveAction;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> DinkAction;
	UPROPERTY(EditDefaultsOnly, Category = "Input") TObjectPtr<UInputAction> LobAction;

	// Animation Blueprint inputs (ABP_RallyPlayer reads these).
	UPROPERTY(BlueprintReadOnly, Category = "Anim") float GroundSpeed = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Anim") float SwingAlpha = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Anim") bool bBackhand = false;
	UPROPERTY(BlueprintReadOnly, Category = "Anim") bool bServing = false;
	UPROPERTY(BlueprintReadOnly, Category = "Anim") bool bCelebrating = false;
	UPROPERTY(BlueprintReadOnly, Category = "Anim") bool bDejected = false;
	UPROPERTY(BlueprintReadOnly, Category = "Rally") int32 Side = 0;

	void InitForSide(int32 InSide, ARallyMatchGameMode* InMode);
	void ApplySimState(const FVector& WorldPos, const FRotator& Facing, const RallyCore::PlayerState& P);

	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void PossessedBy(AController* NewController) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void OnMove(const FInputActionValue& V);
	void OnMoveEnd(const FInputActionValue& V);
	void Swing(RallyCore::EShotType Shot);
	FVector2D Move = FVector2D::ZeroVector;
	TWeakObjectPtr<ARallyMatchGameMode> Mode;
};
