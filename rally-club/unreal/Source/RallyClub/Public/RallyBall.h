// Visual ball. Flight is simulated by RallyCore (deterministic, 120 Hz); this actor only renders it,
// draws a readable trail, and plays impact audio/VFX hooks.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "RallyBall.generated.h"

class UStaticMeshComponent;
class USoundBase;

UCLASS()
class RALLYCLUB_API ARallyBall : public AActor
{
	GENERATED_BODY()

public:
	ARallyBall();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UStaticMeshComponent> Mesh;
	/** Render-only scale so the 74 mm ball reads at broadcast distance (physics keeps regulation size). */
	UPROPERTY(EditAnywhere, Category = "Rally") float VisualScale = 1.6f;
	UPROPERTY(EditDefaultsOnly, Category = "Rally|Audio") TObjectPtr<USoundBase> PaddleSound;
	UPROPERTY(EditDefaultsOnly, Category = "Rally|Audio") TObjectPtr<USoundBase> PerfectSound;
	UPROPERTY(EditDefaultsOnly, Category = "Rally|Audio") TObjectPtr<USoundBase> BounceSound;

	void OnStruck(double Speed, bool bPerfect);
	void OnBounce(double Speed);

	UFUNCTION(BlueprintImplementableEvent, Category = "Rally") void BP_OnStruck(float Speed, bool bPerfect);
	UFUNCTION(BlueprintImplementableEvent, Category = "Rally") void BP_OnBounce(float Speed);
};
