// Reactive spectators (brief §6): seated/standing variants driven by AtmosphereDirector crowd cues.
// Uses one Hierarchical Instanced Static Mesh per body part with per-instance custom data (colour, phase,
// excitability) so a material/vertex animation can do most of the work on the GPU. CPU-side we only
// re-pose instances near the camera (animation LOD); far rows sway via the material's world-position offset.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "RallyTypes.h"

#include "RallyCrowd.generated.h"

class UHierarchicalInstancedStaticMeshComponent;

USTRUCT(BlueprintType)
struct FRallySeatRow
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere) FVector Start = FVector::ZeroVector;
	UPROPERTY(EditAnywhere) FVector End = FVector(1000, 0, 0);
	UPROPERTY(EditAnywhere) int32 Seats = 18;
	UPROPERTY(EditAnywhere) float FacingYaw = 90.f;
	UPROPERTY(EditAnywhere) bool bStanding = false;
};

UCLASS()
class RALLYCLUB_API ARallyCrowd : public AActor
{
	GENERATED_BODY()

public:
	ARallyCrowd();

	UPROPERTY(VisibleAnywhere) TObjectPtr<UHierarchicalInstancedStaticMeshComponent> Bodies;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UHierarchicalInstancedStaticMeshComponent> Heads;
	UPROPERTY(EditAnywhere, Category = "Crowd") TArray<FRallySeatRow> Rows;
	/** 0..1 — scaled by the graphics preset. */
	UPROPERTY(EditAnywhere, Category = "Crowd", meta = (ClampMin = 0, ClampMax = 1)) float Density = 1.f;
	/** Instances further than this from the camera are not re-posed on the CPU. */
	UPROPERTY(EditAnywhere, Category = "Crowd") float AnimLodDistance = 3500.f;

	UPROPERTY(BlueprintReadOnly, Category = "Crowd") ERallyCrowdState State = ERallyCrowdState::Idle;
	UPROPERTY(BlueprintReadOnly, Category = "Crowd") float Intensity = 0.2f;

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	UFUNCTION() void HandleCrowdCue(ERallyCrowdState NewState, float NewIntensity);

	struct FSpectator
	{
		FVector Base;
		float Yaw;
		bool bStanding;
		float Excitability;
		float Phase;
	};
	TArray<FSpectator> People;
	float StateAge = 0.f;
};
