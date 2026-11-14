// AtmosphereDirector (brief §6): the single event bus that turns match events into presentation cues —
// scoreboard, crowd energy, DJ cues, music ducking, commentary priorities, camera moves, celebration VFX
// and controller haptics. Port of /shared/src/atmosphere.ts + commentary.ts. Listeners (crowd actor,
// DJ booth, broadcast camera, HUD, controller relay) bind to the dynamic delegates below.
#pragma once

#include "CoreMinimal.h"
#include "RallyTypes.h"
#include "Subsystems/WorldSubsystem.h"

#include "AtmosphereDirectorSubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnRallyCrowdCue, ERallyCrowdState, State, float, Intensity);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRallyDjCue, ERallyDjAction, Action);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FOnRallyCommentary, FName, Category, const FString&, Text, float, Duration);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRallyCameraCue, ERallyCameraAction, Action);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnRallyVfxCue, FName, Effect, int32, Side);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnRallyHapticCue, int32, Side, ERallyHaptic, Pattern);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRallyEnergy, float, Energy);

UCLASS()
class RALLYCLUB_API UAtmosphereDirectorSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	UPROPERTY(BlueprintAssignable) FOnRallyCrowdCue OnCrowdCue;
	UPROPERTY(BlueprintAssignable) FOnRallyDjCue OnDjCue;
	UPROPERTY(BlueprintAssignable) FOnRallyCommentary OnCommentary;
	UPROPERTY(BlueprintAssignable) FOnRallyCameraCue OnCameraCue;
	UPROPERTY(BlueprintAssignable) FOnRallyVfxCue OnVfxCue;
	UPROPERTY(BlueprintAssignable) FOnRallyHapticCue OnHapticCue;
	UPROPERTY(BlueprintAssignable) FOnRallyEnergy OnEnergy;

	/** Crowd energy 0..1. */
	UPROPERTY(BlueprintReadOnly, Category = "Rally") float Energy = 0.25f;

	void BeginMatch(const FString& Name0, const FString& Name1, int32 PointsToWin);
	/** Feed every RallyCore::SimEvent from the match loop. */
	void HandleSimEvent(const RallyCore::SimEvent& E);

	// UTickableWorldSubsystem
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UAtmosphereDirectorSubsystem, STATGROUP_Tickables); }

	static constexpr int32 LongRally = 8;
	static constexpr int32 EpicRally = 15;

private:
	struct FCategory
	{
		int32 Priority;
		float Cooldown;
		TArray<FString> Lines;
	};
	void InitCommentary();
	bool Say(FName Category, const TMap<FString, FString>& Ctx);
	void Crowd(ERallyCrowdState State, float Intensity);
	void OnPoint(const RallyCore::RuleEvent& P);
	void Bump(float X) { Energy = FMath::Min(1.f, Energy + X); }

	TMap<FName, FCategory> Commentary;
	TMap<FName, double> LastSpoken;
	TArray<FString> History;
	double LastAnyTime = -1e9;
	int32 LastPriority = 0;
	FRandomStream Rand{7};

	FString Names[2] = {TEXT("You"), TEXT("Rival")};
	int32 Target = 11;
	double Now = 0;
	bool bTensionRaised = false;
	bool bBuildSent = false;
	bool bDucked = false;
	double DuckUntil = 0;
	bool bGamePointPending = false;
	FName PendingFault = NAME_None;
};
