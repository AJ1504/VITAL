#include "AtmosphereDirectorSubsystem.h"

using namespace RallyCore;

void UAtmosphereDirectorSubsystem::InitCommentary()
{
	if (Commentary.Num() > 0) return;
	// Original placeholder copy for the temporary VO pass (mirrors shared/src/commentary.ts).
	// P6: move to a DataTable with recorded voice assets per line.
	Commentary.Add("intro", {9, 60, {TEXT("Welcome to the Vital Pickleball Club — a full house, the DJ is rolling, and it’s {a} versus {b}."), TEXT("The sun is out, the music is warm, and the court is ready. {a} and {b}, the floor is yours."), TEXT("What a setting for pickleball. {a} against {b}, first to {target}. Let’s play!")}});
	Commentary.Add("serve_fault", {4, 6, {TEXT("Oh, the serve doesn’t find the box."), TEXT("Fault on the serve — that one wandered."), TEXT("Not the serve {server} {was} looking for.")}});
	Commentary.Add("ace", {6, 8, {TEXT("Unreturnable! Served up and delivered."), TEXT("Ace! The terrace loved that one."), TEXT("Straight past them — a serve with a postmark.")}});
	Commentary.Add("long_rally", {5, 12, {TEXT("Listen to this crowd — {rally} shots and counting!"), TEXT("Neither of them will blink. What a rally!"), TEXT("Back and forth, back and forth… someone has to crack.")}});
	Commentary.Add("net", {3, 6, {TEXT("Into the tape."), TEXT("The net says no."), TEXT("Caught the net — so close.")}});
	Commentary.Add("out", {3, 6, {TEXT("Just long!"), TEXT("Wide — the line judge didn’t need long on that."), TEXT("That one sailed with the sunset.")}});
	Commentary.Add("kitchen", {5, 10, {TEXT("Foot in the kitchen! You can’t volley from there."), TEXT("Kitchen violation — the cardinal sin."), TEXT("Out of the kitchen, please! Fault.")}});
	Commentary.Add("two_bounce", {5, 10, {TEXT("Too eager — it had to bounce first!"), TEXT("Two-bounce rule! Patience is a virtue."), TEXT("That one needed a bounce. Fault.")}});
	Commentary.Add("winner", {4, 5, {TEXT("That point goes to {winnerObj}."), TEXT("Lovely stuff from {winnerObj}."), TEXT("{winner} {takes} it — {score}."), TEXT("Clean finish. {score}.")}});
	Commentary.Add("side_out", {2, 7, {TEXT("Side out."), TEXT("Over to {serverObj} to serve."), TEXT("Serve changes hands.")}});
	Commentary.Add("game_point", {7, 4, {TEXT("Game point, {serverObj} serving."), TEXT("One point from the match — the terrace is on its feet."), TEXT("Here it is… game point.")}});
	Commentary.Add("save", {7, 6, {TEXT("Saved! {winner} {is} not done yet!"), TEXT("Game point erased — what nerve!"), TEXT("Fought off! We play on.")}});
	Commentary.Add("comeback", {8, 60, {TEXT("From way back — what a comeback by {winnerObj}!"), TEXT("They were buried, and {winner} dug all the way out!")}});
	Commentary.Add("win", {10, 30, {TEXT("Game, set and sunset — {winner} {wins} it {score}!"), TEXT("{winner} {takes} the match! Cue the confetti!"), TEXT("That’s the match! {winner} {wins} {score} — what an evening!")}});
	Commentary.Add("perfect", {1, 9, {TEXT("Sweet spot!"), TEXT("Pure contact."), TEXT("Oh, that sounded perfect.")}});
}

// Verb agreement for the default player name "You" (mirrors nameSlots() in shared/src/commentary.ts).
static TMap<FString, FString> NameSlots(const FString& Name, bool bWinner)
{
	const bool bYou = Name.Equals(TEXT("You"), ESearchCase::IgnoreCase);
	TMap<FString, FString> Slots;
	const FString Prefix = bWinner ? TEXT("winner") : TEXT("server");
	Slots.Add(Prefix, Name);
	Slots.Add(Prefix + TEXT("Obj"), bYou ? TEXT("you") : Name);
	if (bWinner)
	{
		Slots.Add(TEXT("wins"), bYou ? TEXT("win") : TEXT("wins"));
		Slots.Add(TEXT("takes"), bYou ? TEXT("take") : TEXT("takes"));
		Slots.Add(TEXT("is"), bYou ? TEXT("are") : TEXT("is"));
	}
	else
	{
		Slots.Add(TEXT("was"), bYou ? TEXT("were") : TEXT("was"));
	}
	return Slots;
}

void UAtmosphereDirectorSubsystem::BeginMatch(const FString& Name0, const FString& Name1, int32 PointsToWin)
{
	InitCommentary();
	Names[0] = Name0;
	Names[1] = Name1;
	Target = PointsToWin;
	Energy = 0.25f;
	bGamePointPending = bTensionRaised = bBuildSent = false;
	LastSpoken.Reset();
	History.Reset();
}

void UAtmosphereDirectorSubsystem::Tick(float DeltaTime)
{
	Now += DeltaTime;
	const float Rest = bGamePointPending ? 0.55f : 0.25f;
	Energy += (Rest - Energy) * FMath::Min(1.f, DeltaTime * 0.35f);
	if (bDucked && Now >= DuckUntil)
	{
		bDucked = false;
		OnDjCue.Broadcast(ERallyDjAction::Unduck);
	}
}

bool UAtmosphereDirectorSubsystem::Say(FName Category, const TMap<FString, FString>& Ctx)
{
	const FCategory* Def = Commentary.Find(Category);
	if (!Def) return false;
	const double* Last = LastSpoken.Find(Category);
	if (Last && Now - *Last < Def->Cooldown) return false;
	if (Now - LastAnyTime < 2.2 && Def->Priority <= LastPriority) return false;

	TArray<FString> Pool;
	for (const FString& L : Def->Lines)
		if (!History.Contains(L)) Pool.Add(L);
	if (Pool.Num() == 0) Pool = Def->Lines;
	const FString Template = Pool[Rand.RandRange(0, Pool.Num() - 1)];
	FString Text = Template;
	for (const TPair<FString, FString>& Kv : Ctx) Text.ReplaceInline(*FString::Printf(TEXT("{%s}"), *Kv.Key), *Kv.Value);

	LastSpoken.Add(Category, Now);
	LastAnyTime = Now;
	LastPriority = Def->Priority;
	History.Add(Template);
	if (History.Num() > 8) History.RemoveAt(0);
	TArray<FString> Words;
	const float Duration = 0.6f + Text.ParseIntoArrayWS(Words) * 0.32f;
	OnCommentary.Broadcast(Category, Text, Duration);
	if (!bDucked) OnDjCue.Broadcast(ERallyDjAction::Duck);
	bDucked = true;
	DuckUntil = FMath::Max(DuckUntil, Now + Duration);
	return true;
}

void UAtmosphereDirectorSubsystem::Crowd(ERallyCrowdState State, float Intensity)
{
	OnCrowdCue.Broadcast(State, FMath::Clamp(Intensity * (0.6f + Energy * 0.6f), 0.f, 1.f));
}

void UAtmosphereDirectorSubsystem::HandleSimEvent(const SimEvent& E)
{
	switch (E.Type)
	{
	case ESimEvent::MatchStart:
		Say("intro", {{TEXT("a"), Names[0]}, {TEXT("b"), Names[1]}, {TEXT("target"), FString::FromInt(Target)}});
		Crowd(ERallyCrowdState::Applause, 0.6f);
		OnCameraCue.Broadcast(ERallyCameraAction::ServeView);
		break;
	case ESimEvent::Contact:
		OnHapticCue.Broadcast(E.S, E.bPerfect ? ERallyHaptic::Perfect : ERallyHaptic::Impact);
		if (E.bPerfect)
		{
			OnVfxCue.Broadcast("sparkle", E.S);
			Say("perfect", {});
		}
		break;
	case ESimEvent::Whiff: OnHapticCue.Broadcast(E.S, ERallyHaptic::Miss); break;
	case ESimEvent::Rule:
	{
		const RuleEvent& R = E.Rule;
		switch (R.Type)
		{
		case ERuleEvent::Serve:
			bTensionRaised = bBuildSent = false;
			OnCameraCue.Broadcast(ERallyCameraAction::RallyFollow);
			Crowd(bGamePointPending ? ERallyCrowdState::Tension : ERallyCrowdState::Idle, bGamePointPending ? 0.7f : 0.2f);
			break;
		case ERuleEvent::Hit:
			Bump(0.02f);
			if (R.HitCount >= LongRally && !bTensionRaised)
			{
				bTensionRaised = true;
				Bump(0.15f);
				Crowd(ERallyCrowdState::Murmur, 0.5f);
			}
			if (R.HitCount >= EpicRally && !bBuildSent)
			{
				bBuildSent = true;
				Bump(0.2f);
				Crowd(ERallyCrowdState::Tension, 0.85f);
				OnDjCue.Broadcast(ERallyDjAction::Build);
				OnCameraCue.Broadcast(ERallyCameraAction::TensionPush);
				Say("long_rally", {{TEXT("rally"), FString::FromInt(R.HitCount)}});
			}
			break;
		case ERuleEvent::Fault:
			switch (R.Fault)
			{
			case EFault::ServeIntoNet:
			case EFault::ServeInKitchen:
			case EFault::ServeWrongCourt:
			case EFault::ServeOut: PendingFault = "serve_fault"; break;
			case EFault::Net: PendingFault = "net"; break;
			case EFault::Out: PendingFault = "out"; break;
			case EFault::KitchenVolley: PendingFault = "kitchen"; break;
			case EFault::TwoBounceRule: PendingFault = "two_bounce"; break;
			default: break;
			}
			OnHapticCue.Broadcast(R.S, ERallyHaptic::Miss);
			break;
		case ERuleEvent::Point: OnPoint(R); break;
		case ERuleEvent::GameOver:
		{
			const FString Winner = Names[R.S];
			const FString Score = FString::Printf(TEXT("%d-%d"), R.Score[R.S], R.Score[OtherSide(R.S)]);
			Energy = 1.f;
			bGamePointPending = false;
			Crowd(ERallyCrowdState::Ovation, 1.f);
			OnDjCue.Broadcast(ERallyDjAction::Sting);
			OnDjCue.Broadcast(ERallyDjAction::Drop);
			OnVfxCue.Broadcast("confetti", -1);
			OnCameraCue.Broadcast(ERallyCameraAction::Celebrate);
			OnHapticCue.Broadcast(R.S, ERallyHaptic::Win);
			if (R.bComeback) Say("comeback", NameSlots(Winner, true));
			TMap<FString, FString> WinCtx = NameSlots(Winner, true);
			WinCtx.Add(TEXT("score"), Score);
			Say("win", WinCtx);
			break;
		}
		default: break;
		}
		break;
	}
	default: break;
	}
	OnEnergy.Broadcast(Energy);
}

void UAtmosphereDirectorSubsystem::OnPoint(const RuleEvent& P)
{
	// Under side-out scoring the rally winner always serves next (they either scored or won the serve back).
	const Side ServerNow = P.S;
	const FString Score = FString::Printf(TEXT("%d-%d"), P.Score[ServerNow], P.Score[OtherSide(ServerNow)]);
	TMap<FString, FString> Ctx = NameSlots(Names[P.S], true);
	Ctx.Append(NameSlots(Names[ServerNow], false));
	Ctx.Add(TEXT("score"), Score);
	Ctx.Add(TEXT("rally"), FString::FromInt(P.RallyLength));
	const bool bLong = P.RallyLength >= LongRally;
	OnHapticCue.Broadcast(P.S, ERallyHaptic::Point);
	if (bLong && (P.Fault == EFault::Net || P.Fault == EFault::Out)) Crowd(ERallyCrowdState::Gasp, 0.8f);
	Bump(0.1f + P.RallyLength * 0.015f);
	Crowd(ERallyCrowdState::Cheer, FMath::Min(1.f, 0.45f + P.RallyLength * 0.04f + (P.bSavedGamePoint ? 0.3f : 0.f)));
	OnCameraCue.Broadcast(ERallyCameraAction::PointSweep);

	bool bSpoke = false;
	if (P.bSavedGamePoint) bSpoke = Say("save", Ctx);
	if (!bSpoke && P.bAce) bSpoke = Say("ace", Ctx);
	if (!bSpoke && PendingFault != NAME_None && P.Fault != EFault::DoubleBounce) bSpoke = Say(PendingFault, Ctx);
	if (!bSpoke && bLong) bSpoke = Say("long_rally", Ctx);
	if (!bSpoke && P.bSideOut) bSpoke = Say("side_out", Ctx);
	if (!bSpoke) Say("winner", Ctx);
	PendingFault = NAME_None;

	if (bTensionRaised || bBuildSent) OnDjCue.Broadcast(ERallyDjAction::Drop);
	const bool bWasPending = bGamePointPending;
	bGamePointPending = P.bGamePoint;
	if (P.bGamePoint)
	{
		OnDjCue.Broadcast(ERallyDjAction::FilterDown);
		Say("game_point", Ctx);
	}
	else if (bWasPending)
	{
		OnDjCue.Broadcast(ERallyDjAction::FilterUp);
	}
}
