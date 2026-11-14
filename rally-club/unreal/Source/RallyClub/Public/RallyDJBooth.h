// In-world DJ booth (brief §6). Plays the venue's MetaSound DJ set from the booth's speakers with 3D
// attenuation, runs a Quartz clock so AtmosphereDirector cues land on bar lines, and maps cues to
// MetaSound parameters: Duck (commentary), FilterCutoff (game-point tension), Build / Drop / Sting triggers.
//
// Content contract for MS_SunsetDJSet (MetaSound Source, authored in editor):
//   inputs  float "DuckGain" (0..1), float "FilterCutoff" (Hz), trigger "Build", trigger "Drop", trigger "Sting"
//   tracks  original or properly licensed French house / nu-disco / funky house / sunset deep house stems
//           (record every track in docs/ASSET_LICENSING.md before import).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Quartz/AudioMixerClockHandle.h"
#include "RallyTypes.h"

#include "RallyDJBooth.generated.h"

class UAudioComponent;
class USoundBase;
class USoundAttenuation;

UCLASS()
class RALLYCLUB_API ARallyDJBooth : public AActor
{
	GENERATED_BODY()

public:
	ARallyDJBooth();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UAudioComponent> Speakers;
	UPROPERTY(EditAnywhere, Category = "DJ") TObjectPtr<USoundBase> DJSet;
	UPROPERTY(EditAnywhere, Category = "DJ") TObjectPtr<USoundAttenuation> SpeakerAttenuation;
	UPROPERTY(EditAnywhere, Category = "DJ") float BPM = 122.f;
	UPROPERTY(EditAnywhere, Category = "DJ") float DuckedGain = 0.45f;
	UPROPERTY(EditAnywhere, Category = "DJ") float TensionCutoffHz = 900.f;

	/** 0..1 phase within the current beat, for animating the DJ, lights and crowd sway. */
	UPROPERTY(BlueprintReadOnly, Category = "DJ") float BeatPhase = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "DJ") int32 Bar = 0;

	UFUNCTION(BlueprintImplementableEvent, Category = "DJ") void BP_OnBeat(int32 InBar, int32 InBeat);

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	UFUNCTION() void HandleDjCue(ERallyDjAction Action);
	UFUNCTION() void HandleMetronome(FName ClockName, EQuartzCommandQuantization QuantizationType, int32 NumBars, int32 Beat, float BeatFraction);
	void FireOnNextBar(FName Trigger);

	UPROPERTY() TObjectPtr<UQuartzClockHandle> Clock;
	float TargetDuck = 1.f, CurrentDuck = 1.f;
	float TargetCutoff = 20000.f, CurrentCutoff = 20000.f;
	TArray<FName> PendingBarTriggers;
	double LastBeatTime = 0;
};
