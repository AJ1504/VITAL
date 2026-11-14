// Unreal Automation tests for the rules/physics/match core. Run in editor (Session Frontend > Automation,
// filter "RallyClub") or headless:
//   UnrealEditor-Cmd RallyClub.uproject -ExecCmds="Automation RunTests RallyClub; Quit" -unattended -nullrhi
// The same cases also run without Unreal via unreal/CoreTests (CMake).
#include "Misc/AutomationTest.h"
#include "RallyCore.h"
#include "RallyMatch.h"

#if WITH_DEV_AUTOMATION_TESTS

using namespace RallyCore;

namespace
{
const RuleEvent* FindEvent(const std::vector<RuleEvent>& Ev, ERuleEvent T)
{
	for (const RuleEvent& E : Ev)
		if (E.Type == T) return &E;
	return nullptr;
}
} // namespace

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRallyRulesKitchenServe, "RallyClub.Rules.ServeIntoKitchenIsSideOut", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRallyRulesKitchenServe::RunTest(const FString&)
{
	const Court C = MakePickleballCourt();
	PickleballRules R(C);
	R.Serve();
	const auto Ev = R.Bounce({-1, 0, -C.NvzDepth});
	const RuleEvent* F = FindEvent(Ev, ERuleEvent::Fault);
	TestTrue(TEXT("fault emitted"), F != nullptr);
	TestTrue(TEXT("kitchen fault"), F && F->Fault == EFault::ServeInKitchen);
	TestEqual(TEXT("side out"), R.State().Server, 1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRallyRulesTwoBounce, "RallyClub.Rules.TwoBounceRule", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRallyRulesTwoBounce::RunTest(const FString&)
{
	const Court C = MakePickleballCourt();
	PickleballRules R(C);
	R.Serve();
	const RuleEvent* F = FindEvent(R.Hit(1, {0, 0, -C.HalfLength}), ERuleEvent::Fault);
	TestTrue(TEXT("receiver volley is a two-bounce fault"), F && F->Fault == EFault::TwoBounceRule);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRallyShotSolver, "RallyClub.Physics.ShotSolverAccuracy", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRallyShotSolver::RunTest(const FString&)
{
	const Court C = MakePickleballCourt();
	const PhysicsParams P = MakePickleballPhysics();
	const ShotSolution S = SolveShot({-1, 0.6, 6.5}, {2, 0, -5.5}, EShotType::Drive, P, C);
	TestTrue(TEXT("lands within 5 cm"), FMath::Sqrt(FMath::Square(S.Landing.x - 2) + FMath::Square(S.Landing.z + 5.5)) < 0.05);
	TestTrue(TEXT("clears the net"), S.NetClearance >= GetShotProfile(EShotType::Drive).NetClearance);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRallyFullMatch, "RallyClub.Match.AiVsAiCompletesGame", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRallyFullMatch::RunTest(const FString&)
{
	MatchOptions O;
	O.Seed = 1;
	MatchSim Sim(O);
	AiController A(0, AiMedium(), 8), B(1, AiMedium(), 18);
	for (int32 I = 0; I < 1800 * 60 && !Sim.IsOver(); ++I) Sim.Update(1.0 / 60, {A.Think(Sim, 1.0 / 60), B.Think(Sim, 1.0 / 60)});
	TestTrue(TEXT("game finished"), Sim.IsOver());
	// Parity with the TypeScript core (scripts/parity.ts, seed 1).
	TestEqual(TEXT("score side 0"), Sim.Rules.State().Score[0], 9);
	TestEqual(TEXT("score side 1"), Sim.Rules.State().Score[1], 11);
	return true;
}

#endif
