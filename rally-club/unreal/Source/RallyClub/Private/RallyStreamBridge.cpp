#include "RallyStreamBridge.h"

#include "AtmosphereDirectorSubsystem.h"
#include "Dom/JsonObject.h"
#include "Kismet/GameplayStatics.h"
#include "PixelStreaming2InputComponent.h"
#include "RallyClub.h"
#include "RallyMatchGameMode.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

ARallyStreamBridge::ARallyStreamBridge()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bTickEvenWhenPaused = true; // keep answering the browser while paused
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	StreamInput = CreateDefaultSubobject<UPixelStreaming2Input>(TEXT("StreamInput"));
}

void ARallyStreamBridge::BeginPlay()
{
	Super::BeginPlay();
	if (StreamInput) StreamInput->OnInputEvent.AddDynamic(this, &ARallyStreamBridge::HandleDescriptor);
	if (UAtmosphereDirectorSubsystem* Director = GetWorld()->GetSubsystem<UAtmosphereDirectorSubsystem>())
	{
		Director->OnCommentary.AddDynamic(this, &ARallyStreamBridge::HandleCommentary);
	}
}

ARallyMatchGameMode* ARallyStreamBridge::Mode() const { return Cast<ARallyMatchGameMode>(UGameplayStatics::GetGameMode(this)); }

void ARallyStreamBridge::HandleDescriptor(const FString& Descriptor)
{
	TSharedPtr<FJsonObject> Msg;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Descriptor);
	if (!FJsonSerializer::Deserialize(Reader, Msg) || !Msg.IsValid()) return;
	const FString Type = Msg->GetStringField(TEXT("type"));
	ARallyMatchGameMode* GM = Mode();
	if (!GM) return;

	if (Type == TEXT("rally.input"))
	{
		const int32 Seq = static_cast<int32>(Msg->GetNumberField(TEXT("seq")));
		if (Seq <= AckSeq) return; // stale / out of order
		AckSeq = Seq;
		RallyCore::ControlInput In;
		In.MoveX = FMath::Clamp(Msg->GetNumberField(TEXT("moveX")), -1.0, 1.0);
		In.MoveZ = FMath::Clamp(Msg->GetNumberField(TEXT("moveZ")), -1.0, 1.0);
		const TSharedPtr<FJsonObject>* Swing = nullptr;
		if (Msg->TryGetObjectField(TEXT("swing"), Swing) && Swing && Swing->IsValid())
		{
			const FString Shot = (*Swing)->GetStringField(TEXT("shot"));
			In.bSwing = true;
			In.Shot = Shot == TEXT("dink") ? RallyCore::EShotType::Dink : Shot == TEXT("lob") ? RallyCore::EShotType::Lob : RallyCore::EShotType::Drive;
			In.Aim = FMath::Clamp((*Swing)->GetNumberField(TEXT("aim")), -1.0, 1.0);
		}
		GM->SetHumanInput(In);
	}
	else if (Type == TEXT("rally.command"))
	{
		const FString Cmd = Msg->GetStringField(TEXT("command"));
		const TSharedPtr<FJsonObject>* Settings = nullptr;
		if (Msg->TryGetObjectField(TEXT("settings"), Settings) && Settings && Settings->IsValid())
		{
			FString Assist, Difficulty;
			if ((*Settings)->TryGetStringField(TEXT("assist"), Assist))
				GM->PlayerAssist = Assist == TEXT("casual") ? ERallyAssist::Casual : Assist == TEXT("precision") ? ERallyAssist::Precision : ERallyAssist::Classic;
			if ((*Settings)->TryGetStringField(TEXT("difficulty"), Difficulty))
				GM->OpponentDifficulty = Difficulty == TEXT("easy") ? 0 : Difficulty == TEXT("hard") ? 2 : 1;
			double Points = 0;
			if ((*Settings)->TryGetNumberField(TEXT("pointsToWin"), Points)) GM->PointsToWin = FMath::Clamp(static_cast<int32>(Points), 3, 21);
		}
		if (Cmd == TEXT("start_match") || Cmd == TEXT("rematch"))
		{
			UGameplayStatics::SetGamePaused(this, false);
			AckSeq = 0;
			GM->StartMatch();
		}
		else if (Cmd == TEXT("pause")) UGameplayStatics::SetGamePaused(this, !UGameplayStatics::IsGamePaused(this));
		else if (Cmd == TEXT("resume")) UGameplayStatics::SetGamePaused(this, false);
		SendState(true);
	}
}

void ARallyStreamBridge::HandleCommentary(FName, const FString& Text, float)
{
	const TSharedRef<FJsonObject> O = MakeShared<FJsonObject>();
	O->SetStringField(TEXT("type"), TEXT("rally.commentary"));
	O->SetStringField(TEXT("text"), Text);
	FString Json;
	FJsonSerializer::Serialize(O, TJsonWriterFactory<>::Create(&Json));
	Send(Json);
}

void ARallyStreamBridge::SendState(bool bForce)
{
	const ARallyMatchGameMode* GM = Mode();
	if (!GM) return;
	const FRallyScoreboard S = GM->GetScoreboard();
	const TSharedRef<FJsonObject> O = MakeShared<FJsonObject>();
	O->SetStringField(TEXT("type"), TEXT("rally.state"));
	TArray<TSharedPtr<FJsonValue>> Names, Score;
	Names.Add(MakeShared<FJsonValueString>(TEXT("You")));
	Names.Add(MakeShared<FJsonValueString>(GM->OpponentDifficulty == 0 ? TEXT("Coco") : GM->OpponentDifficulty == 2 ? TEXT("Ines") : TEXT("Rafa")));
	Score.Add(MakeShared<FJsonValueNumber>(S.Score0));
	Score.Add(MakeShared<FJsonValueNumber>(S.Score1));
	O->SetArrayField(TEXT("names"), Names);
	O->SetArrayField(TEXT("score"), Score);
	O->SetNumberField(TEXT("server"), S.Server);
	O->SetStringField(TEXT("call"), FString::Printf(TEXT("Call %s"), *S.ScoreCall));
	O->SetNumberField(TEXT("rally"), S.RallyLength);
	O->SetBoolField(TEXT("gameOver"), S.bGameOver);
	O->SetNumberField(TEXT("winner"), S.Winner);
	FString Body;
	FJsonSerializer::Serialize(O, TJsonWriterFactory<>::Create(&Body));
	// Only resend unchanged state as a periodic keep-alive (ackSeq is appended after the comparison).
	if (!bForce && Body == LastStateJson && StateClock < 1.f) return;
	LastStateJson = Body;
	StateClock = 0.f;
	O->SetNumberField(TEXT("ackSeq"), AckSeq);
	FString Json;
	FJsonSerializer::Serialize(O, TJsonWriterFactory<>::Create(&Json));
	Send(Json);
}

void ARallyStreamBridge::Send(const FString& Json)
{
	if (StreamInput) StreamInput->SendPixelStreamingResponse(Json);
	OnSendToBrowser.Broadcast(Json);
}

void ARallyStreamBridge::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	StateClock += DeltaSeconds;
	PeriodicClock += DeltaSeconds;
	if (PeriodicClock >= StateInterval)
	{
		PeriodicClock = 0.f;
		SendState(false);
	}
}
