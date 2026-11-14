// Owns the authoritative RallyCore::MatchSim for a local match, feeds it input from the player pawn
// (or AI), mirrors ball/player state onto actors, and forwards every SimEvent to the AtmosphereDirector.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "RallyTypes.h"

#include "RallyMatchGameMode.generated.h"

class ARallyBall;
class ARallyPlayerPawn;
class UAtmosphereDirectorSubsystem;

UCLASS()
class RALLYCLUB_API ARallyMatchGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ARallyMatchGameMode();

	UPROPERTY(EditDefaultsOnly, Category = "Rally") TSubclassOf<ARallyBall> BallClass;
	UPROPERTY(EditDefaultsOnly, Category = "Rally") TSubclassOf<ARallyPlayerPawn> OpponentClass;
	UPROPERTY(EditAnywhere, Category = "Rally") ERallyAssist PlayerAssist = ERallyAssist::Classic;
	UPROPERTY(EditAnywhere, Category = "Rally", meta = (ClampMin = 3, ClampMax = 21)) int32 PointsToWin = 11;
	/** 0 = easy, 1 = medium, 2 = hard. */
	UPROPERTY(EditAnywhere, Category = "Rally", meta = (ClampMin = 0, ClampMax = 2)) int32 OpponentDifficulty = 1;
	/** World transform of the court centre (net centre on the ground). */
	UPROPERTY(EditAnywhere, Category = "Rally") FTransform CourtOrigin;
	/** QA: let the AI play side 0 too. */
	UPROPERTY(EditAnywhere, Category = "Rally|Debug") bool bAutoplay = false;

	UFUNCTION(BlueprintCallable, Category = "Rally") void StartMatch();
	UFUNCTION(BlueprintPure, Category = "Rally") FRallyScoreboard GetScoreboard() const;

	/** Called by the local player pawn each frame with its fallback (keyboard/gamepad/touch) input. */
	void SetHumanInput(const RallyCore::ControlInput& In);

	const RallyCore::MatchSim* GetSim() const { return Sim.Get(); }
	FVector CoreToWorld(const RallyCore::Vec3& V) const { return CourtOrigin.TransformPosition(RallyUE::ToUnreal(V)); }

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void SyncActors();

	TUniquePtr<RallyCore::MatchSim> Sim;
	TUniquePtr<RallyCore::AiController> Ai[2];
	RallyCore::ControlInput HumanInput;

	UPROPERTY() TObjectPtr<ARallyBall> Ball;
	UPROPERTY() TObjectPtr<ARallyPlayerPawn> Players[2];
	UPROPERTY() TObjectPtr<UAtmosphereDirectorSubsystem> Director;
	int32 RallyLength = 0;
};
