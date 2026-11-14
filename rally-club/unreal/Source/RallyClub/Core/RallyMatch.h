// Rally Club — engine-agnostic match loop + AI (C++17). Port of /shared/src/match.ts and ai.ts
// (match mode; the TS practice ball-machine mode is not yet ported — see docs/FEATURE_STATUS.md).
#pragma once

#include "RallyCore.h"

#include <array>
#include <cstdint>
#include <optional>
#include <vector>

namespace RallyCore
{
constexpr double SimDt = 1.0 / 120.0;
constexpr double SwingIdeal = 0.15;

enum class EAssist : uint8_t { Casual, Classic, Precision };
enum class EStroke : uint8_t { Forehand, Backhand, Serve };
enum class EAnim : uint8_t { Ready, Run, Swing, Celebrate, Dejected };

double ReachFor(EAssist A);

/** Deterministic RNG (mulberry32) shared with the TS core. */
class Rng
{
public:
	explicit Rng(uint32_t Seed) : State(Seed) {}
	double Next();
	double Gaussian();

private:
	uint32_t State;
};

struct ControlInput
{
	double MoveX = 0; // player frame: + = right
	double MoveZ = 0; // player frame: + = toward net
	bool bSwing = false;
	EShotType Shot = EShotType::Drive;
	double Aim = 0; // -1 left .. +1 right (player frame)
};

struct PlayerState
{
	Side S = 0;
	Vec3 Pos, Vel;
	bool bRightHanded = true;
	EAssist Assist = EAssist::Classic;
	double ErrorScale = 1;
	double SwingWindow = 0, SwingElapsed = 0, ClosestDist = 1e9;
	std::optional<ControlInput> PendingSwing;
	double SwingAnim = 0;
	EStroke Stroke = EStroke::Forehand;
	EAnim Anim = EAnim::Ready;
};

enum class ESimEvent : uint8_t { Rule, MatchStart, Contact, Whiff, NetTouch, NetCord, BallBounce, PointReset };
struct SimEvent
{
	explicit SimEvent(ESimEvent InType) : Type(InType) {}
	ESimEvent Type;
	RuleEvent Rule{ERuleEvent::Serve}; // valid when Type == Rule
	Side S = 0;
	double Quality = 0, Speed = 0;
	bool bPerfect = false;
	EShotType Shot = EShotType::Drive;
	EStroke Stroke = EStroke::Forehand;
	Vec3 P;
};

struct InterceptPlan
{
	Vec3 Contact, Stand;
	double TimeToContact = 0, ComputedAt = 0;
	bool bAfterBounce = false, bBallGoingOut = false;
};

struct MatchOptions
{
	std::array<EAssist, 2> Assist{EAssist::Classic, EAssist::Classic};
	int PointsToWin = 11;
	Side FirstServer = 0;
	uint32_t Seed = 1234;
};

class MatchSim
{
public:
	explicit MatchSim(const MatchOptions& Opts = {});

	void Update(double Dt, std::array<ControlInput, 2> Inputs);
	std::vector<SimEvent> DrainEvents();
	bool IsOver() const { return Rules.State().Phase == EPhase::GameOver; }
	bool BallIncomingFor(Side Who) const;
	std::optional<InterceptPlan> Intercept(Side Who);
	Vec3 ReadyPosition(Side Who) const;

	Court C;
	PhysicsParams Physics;
	PickleballRules Rules;
	std::array<PlayerState, 2> Players;
	BallState Ball;
	bool bBallHeld = true;
	double Time = 0;

private:
	void FixedStep(std::array<ControlInput, 2>& Inputs);
	void SetupServe();
	Vec3 ServeBallPos() const;
	void UpdatePlayer(PlayerState& P, const ControlInput& In, double Dt);
	std::optional<Vec3> AutoTarget(const PlayerState& P);
	std::optional<InterceptPlan> ComputeIntercept(Side Who);
	bool CanStrike(const PlayerState& P) const;
	void ResolveContact(PlayerState& P);
	Vec3 ChooseTarget(const PlayerState& P, EShotType Shot, double Aim, double Quality);
	void PerformServe(PlayerState& P, const ControlInput& Req);
	void Emit(const SimEvent& E);
	void EmitRules(const std::vector<RuleEvent>& Es);

	Rng R;
	std::vector<SimEvent> Events;
	double Accumulator = 0;
	double PointTimer = 0;
	std::array<std::optional<InterceptPlan>, 2> InterceptCache;
	std::array<double, 2> InterceptAge{99, 99};
};

struct AiProfile
{
	double ServeDelay, Judgement, CommitReach, TimingJitter, Aggression, ErrorScale;
};
const AiProfile& AiEasy();
const AiProfile& AiMedium();
const AiProfile& AiHard();

class AiController
{
public:
	AiController(Side InSide, const AiProfile& InProfile, uint32_t Seed) : S(InSide), Profile(InProfile), R(Seed) {}
	ControlInput Think(MatchSim& Sim, double Dt);

private:
	EShotType ChooseShot(MatchSim& Sim);
	double ChooseAim(MatchSim& Sim);
	Side S;
	AiProfile Profile;
	Rng R;
	double ServeClock = 0;
	bool bSwungThisBall = false;
	int LastHitCount = -1;
	std::optional<bool> LetGo, KitchenLapse;
	std::optional<double> Lead;
};
} // namespace RallyCore
