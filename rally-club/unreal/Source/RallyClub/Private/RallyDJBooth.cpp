#include "RallyDJBooth.h"

#include "AtmosphereDirectorSubsystem.h"
#include "Components/AudioComponent.h"
#include "Quartz/QuartzSubsystem.h"

ARallyDJBooth::ARallyDJBooth()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	Speakers = CreateDefaultSubobject<UAudioComponent>(TEXT("Speakers"));
	Speakers->SetupAttachment(Root);
	Speakers->bAutoActivate = false;
	Speakers->bAllowSpatialization = true;
}

void ARallyDJBooth::BeginPlay()
{
	Super::BeginPlay();
	if (SpeakerAttenuation) Speakers->AttenuationSettings = SpeakerAttenuation;
	if (DJSet) Speakers->SetSound(DJSet);

	if (UAtmosphereDirectorSubsystem* Director = GetWorld()->GetSubsystem<UAtmosphereDirectorSubsystem>())
	{
		Director->OnDjCue.AddDynamic(this, &ARallyDJBooth::HandleDjCue);
	}

	// Quartz clock: 4/4 at the set's BPM. Cues are quantised to bar boundaries.
	if (UQuartzSubsystem* Quartz = UQuartzSubsystem::Get(GetWorld()))
	{
		FQuartzClockSettings Settings;
		Settings.TimeSignature.NumBeats = 4;
		Clock = Quartz->CreateNewClock(this, TEXT("RallyDJClock"), Settings, true);
		if (Clock)
		{
			FQuartzQuantizationBoundary Now(EQuartzCommandQuantization::None);
			FOnQuartzCommandEventBP NoDelegate;
			Clock->SetBeatsPerMinute(this, Now, NoDelegate, Clock, BPM);
			FOnQuartzMetronomeEventBP OnBeat;
			OnBeat.BindUFunction(this, GET_FUNCTION_NAME_CHECKED(ARallyDJBooth, HandleMetronome));
			Clock->SubscribeToQuantizationEvent(this, EQuartzCommandQuantization::Beat, OnBeat, Clock);
			Clock->StartClock(this, Clock);
			// Start the set exactly on the next bar so stems stay aligned with the clock.
			FQuartzQuantizationBoundary NextBar(EQuartzCommandQuantization::Bar);
			Speakers->PlayQuantized(this, Clock, NextBar, NoDelegate);
		}
	}
	if (!Clock && DJSet) Speakers->Play();
}

void ARallyDJBooth::HandleMetronome(FName, EQuartzCommandQuantization, int32 NumBars, int32 Beat, float)
{
	Bar = NumBars;
	LastBeatTime = GetWorld()->GetTimeSeconds();
	if (Beat == 1)
	{
		for (const FName& T : PendingBarTriggers) Speakers->SetTriggerParameter(T);
		PendingBarTriggers.Reset();
	}
	BP_OnBeat(NumBars, Beat);
}

void ARallyDJBooth::FireOnNextBar(FName Trigger) { PendingBarTriggers.AddUnique(Trigger); }

void ARallyDJBooth::HandleDjCue(ERallyDjAction Action)
{
	switch (Action)
	{
	case ERallyDjAction::Duck: TargetDuck = DuckedGain; break;
	case ERallyDjAction::Unduck: TargetDuck = 1.f; break;
	case ERallyDjAction::FilterDown: TargetCutoff = TensionCutoffHz; break;
	case ERallyDjAction::FilterUp: TargetCutoff = 20000.f; break;
	case ERallyDjAction::Build: Speakers->SetTriggerParameter(TEXT("Build")); break; // riser starts immediately
	case ERallyDjAction::Drop:
		TargetCutoff = 20000.f;
		FireOnNextBar(TEXT("Drop"));
		break;
	case ERallyDjAction::Sting: Speakers->SetTriggerParameter(TEXT("Sting")); break;
	}
}

void ARallyDJBooth::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	// Smooth parameter changes (ducking ~80 ms attack / 400 ms release; filter ~500 ms).
	const float DuckRate = TargetDuck < CurrentDuck ? 12.f : 2.5f;
	CurrentDuck = FMath::FInterpTo(CurrentDuck, TargetDuck, DeltaSeconds, DuckRate);
	CurrentCutoff = FMath::FInterpTo(CurrentCutoff, TargetCutoff, DeltaSeconds, 2.f);
	Speakers->SetFloatParameter(TEXT("DuckGain"), CurrentDuck);
	Speakers->SetFloatParameter(TEXT("FilterCutoff"), CurrentCutoff);
	const float SecondsPerBeat = 60.f / BPM;
	BeatPhase = FMath::Fmod(static_cast<float>(GetWorld()->GetTimeSeconds() - LastBeatTime), SecondsPerBeat) / SecondsPerBeat;
}
