// Standalone tests for the engine-agnostic C++ core (no Unreal required).
//   cmake -S unreal/CoreTests -B build/core-tests && cmake --build build/core-tests && ./build/core-tests/rally_core_tests
// Mirrors the key cases of tests/unit/*.test.ts so the TS harness and the Unreal port stay in lockstep.

#include "../Source/RallyClub/Core/RallyCore.h"
#include "../Source/RallyClub/Core/RallyMatch.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

using namespace RallyCore;

static int Failures = 0, Passes = 0;
#define CHECK(cond)                                                                \
	do                                                                             \
	{                                                                              \
		if (!(cond))                                                               \
		{                                                                          \
			std::printf("    CHECK FAILED %s:%d: %s\n", __FILE__, __LINE__, #cond); \
			throw 1;                                                               \
		}                                                                          \
	} while (0)

static void Test(const char* Name, const std::function<void()>& Fn)
{
	try
	{
		Fn();
		++Passes;
		std::printf("ok   - %s\n", Name);
	}
	catch (...)
	{
		++Failures;
		std::printf("FAIL - %s\n", Name);
	}
}

static const Court C = MakePickleballCourt();
static const PhysicsParams P = MakePickleballPhysics();

static const RuleEvent* Find(const std::vector<RuleEvent>& Ev, ERuleEvent T)
{
	for (const auto& E : Ev)
		if (E.Type == T) return &E;
	return nullptr;
}
static Vec3 GoodServe(const PickleballRules& R)
{
	return {R.TargetCourtXSign() * C.HalfWidth * 0.5, 0, (R.Receiver() == 0 ? 1 : -1) * (C.NvzDepth + 2)};
}
static std::vector<RuleEvent> ServerWins(PickleballRules& R)
{
	R.Serve();
	R.Bounce(GoodServe(R));
	auto Ev = R.Bounce(GoodServe(R));
	R.NextPoint();
	return Ev;
}
static PickleballRules RallyToShot4()
{
	PickleballRules R(C);
	R.Serve();
	R.Bounce(GoodServe(R));
	R.Hit(1, {0, 0, -C.HalfLength});
	R.Bounce({0, 0, C.HalfLength - 1});
	R.Hit(0, {0, 0, C.HalfLength});
	return R;
}

/** Prints one line per seed in the same format as scripts/parity.ts (cross-language determinism check). */
static int RunParity()
{
	for (uint32_t Seed : {1u, 2u, 3u, 4u, 5u, 6u})
	{
		MatchOptions O;
		O.Seed = Seed;
		MatchSim Sim(O);
		AiController A(0, AiMedium(), Seed * 7 + 1), B(1, AiMedium(), Seed * 13 + 5);
		int Points = 0, MaxRally = 0;
		int Steps = 0;
		while (!Sim.IsOver() && Steps < 1800 * 60)
		{
			const double Dt = 1.0 / 60;
			Sim.Update(Dt, {A.Think(Sim, Dt), B.Think(Sim, Dt)});
			++Steps;
			for (const SimEvent& E : Sim.DrainEvents())
				if (E.Type == ESimEvent::Rule && E.Rule.Type == ERuleEvent::Point)
				{
					++Points;
					MaxRally = std::max(MaxRally, E.Rule.RallyLength);
				}
		}
		const auto& Sc = Sim.Rules.State().Score;
		std::printf("seed=%u score=%d-%d points=%d maxRally=%d frames=%d\n", Seed, Sc[0], Sc[1], Points, MaxRally, Steps);
	}
	return 0;
}

int main(int Argc, char** Argv)
{
	if (Argc > 1 && std::string(Argv[1]) == "--parity") return RunParity();
	Test("court uses regulation dimensions", [] {
		CHECK(std::abs(C.Width - 6.096) < 1e-6);
		CHECK(std::abs(C.Length - 13.4112) < 1e-6);
		CHECK(std::abs(C.NvzDepth - 2.1336) < 1e-6);
		CHECK(std::abs(NetHeightAt(C, 0) - 0.8636) < 1e-6);
	});
	Test("service box: kitchen line is a fault, centre line and baseline in", [] {
		CHECK(!InServiceBox(C, {1, 0, -C.NvzDepth}, 1, 1));
		CHECK(InServiceBox(C, {0, 0, -4}, 1, 1));
		CHECK(!InServiceBox(C, {-0.2, 0, -4}, 1, 1));
		CHECK(InServiceBox(C, {1, 0, -C.HalfLength}, 1, 1));
	});
	Test("serve alternates court with server score", [] {
		PickleballRules R(C);
		CHECK(R.ServerCourtXSign() == 1);
		ServerWins(R);
		CHECK(R.State().Score[0] == 1);
		CHECK(R.ServerCourtXSign() == -1);
	});
	Test("serve in kitchen is a fault and a side out", [] {
		PickleballRules R(C);
		R.Serve();
		auto Ev = R.Bounce({-1, 0, -C.NvzDepth});
		CHECK(Find(Ev, ERuleEvent::Fault)->Fault == EFault::ServeInKitchen);
		CHECK(Find(Ev, ERuleEvent::Point)->bSideOut);
		CHECK(R.State().Server == 1);
	});
	Test("unreturned serve is an ace", [] {
		PickleballRules R(C);
		auto Ev = ServerWins(R);
		CHECK(Find(Ev, ERuleEvent::Point)->bAce);
	});
	Test("two-bounce rule: receiver volley and server third-shot volley are faults", [] {
		PickleballRules R(C);
		R.Serve();
		CHECK(Find(R.Hit(1, {0, 0, -C.HalfLength}), ERuleEvent::Fault)->Fault == EFault::TwoBounceRule);
		PickleballRules R2(C);
		R2.Serve();
		R2.Bounce(GoodServe(R2));
		R2.Hit(1, {0, 0, -C.HalfLength});
		CHECK(Find(R2.Hit(0, {0, 0, C.HalfLength}), ERuleEvent::Fault)->Fault == EFault::TwoBounceRule);
	});
	Test("kitchen volley (line included) is a fault; kitchen after bounce is legal", [] {
		auto R = RallyToShot4();
		CHECK(Find(R.Hit(1, {0, 0, -C.NvzDepth}), ERuleEvent::Fault)->Fault == EFault::KitchenVolley);
		auto R2 = RallyToShot4();
		R2.Bounce({0, 0, -1});
		CHECK(Find(R2.Hit(1, {0, 0, -1}), ERuleEvent::Fault) == nullptr);
	});
	Test("out / net / double bounce faults", [] {
		auto R = RallyToShot4();
		CHECK(Find(R.Bounce({C.HalfWidth + 0.05, 0, -3}), ERuleEvent::Fault)->Fault == EFault::Out);
		auto R2 = RallyToShot4();
		CHECK(Find(R2.Bounce({0, 0, 1}), ERuleEvent::Fault)->Fault == EFault::Net);
		auto R3 = RallyToShot4();
		R3.Bounce({0, 0, -3});
		const RuleEvent* F = Find(R3.Bounce({0, 0, -5}), ERuleEvent::Fault);
		CHECK(F->Fault == EFault::DoubleBounce && F->S == 1);
	});
	Test("game to 11, win by 2; game point flagged", [] {
		PickleballRules R(C, 11);
		R.MutableState().Score = {10, 10};
		auto Ev = ServerWins(R);
		CHECK(Find(Ev, ERuleEvent::Point)->bGamePoint);
		CHECK(R.State().Phase == EPhase::AwaitingServe);
		R.Serve();
		R.Bounce(GoodServe(R));
		Ev = R.Bounce(GoodServe(R));
		CHECK(Find(Ev, ERuleEvent::GameOver) != nullptr);
		CHECK(R.State().Winner && *R.State().Winner == 0);
	});
	Test("score call puts server first", [] {
		PickleballRules R(C, 11, 2, 1);
		R.MutableState().Score = {3, 7};
		CHECK(R.ScoreCall() == "7-3");
	});
	Test("78 in drop rebounds within 30-34 in spec band (+/-1 in)", [] {
		BallState B{{0, 78 * 0.0254 + P.BallRadius, 3}, {}, {}};
		std::vector<PhysicsEvent> Ev;
		int N = 0;
		double Apex = 0;
		for (double T = 0; T < 3 && N < 2; T += 1.0 / 120)
		{
			Ev.clear();
			StepBall(B, 1.0 / 120, P, C, Ev);
			for (auto& E : Ev)
				if (E.Type == EPhysicsEvent::Bounce) ++N;
			if (N == 1) Apex = std::max(Apex, B.P.y - P.BallRadius);
		}
		const double Inches = Apex / 0.0254;
		CHECK(Inches >= 29 && Inches <= 35);
	});
	Test("low ball is stopped by the net", [] {
		BallState B{{0, 0.5, 3}, {0, 0.5, -12}, {}};
		std::vector<PhysicsEvent> Ev;
		bool bNet = false;
		for (double T = 0; T < 2; T += 1.0 / 120)
		{
			Ev.clear();
			StepBall(B, 1.0 / 120, P, C, Ev);
			for (auto& E : Ev)
				if (E.Type == EPhysicsEvent::Net) bNet = true;
		}
		CHECK(bNet && B.P.z > 0);
	});
	Test("shot solver lands within 5 cm and clears the net for every shot type", [] {
		struct Case
		{
			EShotType T;
			Vec3 From, To;
		};
		const Case Cases[] = {
			{EShotType::Serve, {1.5, 0.75, 7.0}, {-1.5, 0, -5.0}}, {EShotType::Drive, {-1, 0.6, 6.5}, {2, 0, -5.5}},
			{EShotType::Drive, {0, 0.25, 6.0}, {0, 0, -5.8}},       {EShotType::Dink, {0.5, 0.4, 2.4}, {-0.8, 0, -1.2}},
			{EShotType::Drop, {0, 0.5, 6.4}, {1, 0, -1.6}},         {EShotType::Lob, {0, 0.9, 2.5}, {-1, 0, -6.0}},
		};
		for (const auto& K : Cases)
		{
			const ShotSolution S = SolveShot(K.From, K.To, K.T, P, C);
			CHECK(std::hypot(S.Landing.x - K.To.x, S.Landing.z - K.To.z) < 0.05);
			CHECK(S.NetClearance >= GetShotProfile(K.T).NetClearance - 1e-6);
		}
	});

	for (uint32_t Seed : {1u, 2u, 3u, 4u})
	{
		const std::string Name = "AI vs AI plays a complete game to 11 with a legal score (seed " + std::to_string(Seed) + ")";
		Test(Name.c_str(), [Seed] {
			MatchOptions O;
			O.Seed = Seed;
			MatchSim Sim(O);
			AiController A(0, AiMedium(), Seed * 7 + 1), B(1, AiMedium(), Seed * 13 + 5);
			int Scored = 0, Points = 0, MaxRally = 0, GameOvers = 0;
			double T = 0;
			while (!Sim.IsOver() && T < 1800)
			{
				const double Dt = 1.0 / 60;
				Sim.Update(Dt, {A.Think(Sim, Dt), B.Think(Sim, Dt)});
				T += Dt;
				for (const SimEvent& E : Sim.DrainEvents())
				{
					if (E.Type != ESimEvent::Rule) continue;
					if (E.Rule.Type == ERuleEvent::Point)
					{
						++Points;
						Scored += E.Rule.bScored ? 1 : 0;
						MaxRally = std::max(MaxRally, E.Rule.RallyLength);
					}
					if (E.Rule.Type == ERuleEvent::GameOver) ++GameOvers;
				}
			}
			const auto& Sc = Sim.Rules.State().Score;
			std::printf("    seed %u: %d-%d in %.0fs sim, %d rallies, longest %d\n", Seed, Sc[0], Sc[1], T, Points, MaxRally);
			CHECK(Sim.IsOver());
			CHECK(std::max(Sc[0], Sc[1]) >= 11 && std::abs(Sc[0] - Sc[1]) >= 2);
			CHECK(Scored == Sc[0] + Sc[1]);
			CHECK(GameOvers == 1);
			CHECK(MaxRally >= 4);
		});
	}
	Test("swing from the server launches a legal serve; unreturned serve scores", [] {
		MatchSim Sim;
		Sim.Update(1, {ControlInput{}, ControlInput{}});
		CHECK(Sim.Rules.State().Phase == EPhase::AwaitingServe && Sim.bBallHeld);
		ControlInput Swing;
		Swing.bSwing = true;
		Sim.Update(1.0 / 60, {Swing, ControlInput{}});
		CHECK(Sim.Rules.State().Phase == EPhase::InPlay && !Sim.bBallHeld);
		for (int I = 0; I < 300 && Sim.Rules.State().Phase == EPhase::InPlay; ++I) Sim.Update(1.0 / 60, {ControlInput{}, ControlInput{}});
		CHECK(Sim.Rules.State().Score[0] == 1);
	});

	std::printf("\n%d passed, %d failed\n", Passes, Failures);
	return Failures == 0 ? 0 : 1;
}
