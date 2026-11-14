// Bridges the Rally Club website and the Unreal match over Pixel Streaming 2 (protocol:
// shared/src/streamProtocol.ts). The browser sends `rally.input` (ControlInput) and `rally.command`
// messages via emitUIInteraction; this actor applies them to ARallyMatchGameMode and streams back
// `rally.state` (scoreboard, ~5 Hz + on change) and `rally.commentary` (subtitles) responses.
//
// Spawned automatically by ARallyMatchGameMode. Requires the PixelStreaming2 plugin (enabled in
// RallyClub.uproject). If your engine's PixelStreaming2 input component differs in name, the
// Blueprint fallback is: bind its "On Input Event" to HandleDescriptor and route OnSendToBrowser to
// its "Send Pixel Streaming Response".
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "RallyStreamBridge.generated.h"

class UPixelStreaming2Input;
class ARallyMatchGameMode;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRallySendToBrowser, const FString&, Json);

UCLASS()
class RALLYCLUB_API ARallyStreamBridge : public AActor
{
	GENERATED_BODY()

public:
	ARallyStreamBridge();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UPixelStreaming2Input> StreamInput;

	/** Fired for every message to the browser (also forwarded to StreamInput automatically). */
	UPROPERTY(BlueprintAssignable) FOnRallySendToBrowser OnSendToBrowser;

	/** Seconds between periodic scoreboard snapshots. */
	UPROPERTY(EditAnywhere, Category = "Rally|Stream") float StateInterval = 0.2f;

	/** Entry point for every browser message (JSON descriptor). */
	UFUNCTION(BlueprintCallable, Category = "Rally|Stream") void HandleDescriptor(const FString& Descriptor);

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	UFUNCTION() void HandleCommentary(FName Category, const FString& Text, float Duration);
	void Send(const FString& Json);
	void SendState(bool bForce);
	ARallyMatchGameMode* Mode() const;

	int32 AckSeq = 0;
	float StateClock = 0.f;
	float PeriodicClock = 0.f;
	FString LastStateJson;
};
