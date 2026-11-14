// Broadcast camera: elevated view from behind the near baseline (cf. the Rooftop Rally reference
// composition), with director-driven moves — point sweep, tension push-in and a celebration orbit.
#pragma once

#include "Camera/CameraActor.h"
#include "CoreMinimal.h"
#include "RallyTypes.h"

#include "RallyBroadcastCamera.generated.h"

UCLASS()
class RALLYCLUB_API ARallyBroadcastCamera : public ACameraActor
{
	GENERATED_BODY()

public:
	ARallyBroadcastCamera();
	/** Offset from the court origin in court space (cm): behind side 0's baseline and above. */
	UPROPERTY(EditAnywhere, Category = "Camera") FVector BroadcastOffset = FVector(1450.f, 0.f, 1050.f);
	UPROPERTY(EditAnywhere, Category = "Camera") float FollowBallLateral = 0.18f;
	UPROPERTY(EditAnywhere, Category = "Camera") bool bReducedMotion = false;

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	UFUNCTION() void HandleCameraCue(ERallyCameraAction Action);
	ERallyCameraAction Mode = ERallyCameraAction::ServeView;
	float ModeTime = 0.f;
};
