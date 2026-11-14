// Rally Club — engine-agnostic racket-sports core (C++17, no Unreal dependencies).
//
// This is a faithful port of /shared/src (TypeScript): court geometry, ball physics, shot solver and
// the pickleball rules engine. It is compiled and unit-tested outside Unreal by /unreal/CoreTests
// (CMake + any C++17 compiler) and wrapped by the UE gameplay classes in Public/ and Private/.
//
// Coordinate convention (identical to the TS core): metres, right-handed, y up, x across the court,
// z along the court, net on z = 0, side 0 owns z > 0. Use RallyCore::ToUnreal / FromUnreal (in
// RallyCoreUE.h) to convert to Unreal centimetres (X forward = core z, Y right = -core x, Z up = core y).

#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace RallyCore
{
struct Vec3
{
	double x = 0, y = 0, z = 0;
	Vec3() = default;
	Vec3(double X, double Y, double Z) : x(X), y(Y), z(Z) {}
	Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
	Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
	Vec3 operator*(double s) const { return {x * s, y * s, z * s}; }
};
double Length(const Vec3& v);
double DistXZ(const Vec3& a, const Vec3& b);
Vec3 Cross(const Vec3& a, const Vec3& b);

// ------------------------------------------------------------------ court

enum class ESport : uint8_t { Pickleball, Tennis, Padel };
using Side = int; // 0 or 1

struct Court
{
	ESport Sport = ESport::Pickleball;
	double Width = 0, Length = 0, NvzDepth = 0, LineWidth = 0;
	double NetHeightPost = 0, NetHeightCenter = 0, NetPostOffset = 0;
	double HalfWidth = 0, HalfLength = 0;
};

Court MakePickleballCourt();
double NetHeightAt(const Court& C, double X);
inline int SideSign(Side S) { return S == 0 ? 1 : -1; }
inline Side OtherSide(Side S) { return S == 0 ? 1 : 0; }
inline Side SideOfPoint(const Vec3& P) { return P.z >= 0 ? 0 : 1; }
bool InCourt(const Court& C, const Vec3& P);
bool InKitchen(const Court& C, const Vec3& P);
bool InServiceBox(const Court& C, const Vec3& P, Side Receiver, int XSign);

// ------------------------------------------------------------------ physics

struct BallState
{
	Vec3 P, V, W; // position (m), velocity (m/s), spin (rad/s)
};

struct PhysicsParams
{
	double Gravity = 9.81;
	double BallRadius = 0.037;
	double DragK = 0;
	double MagnusK = 0.0006;
	double Restitution = 0.68;
	double BounceFriction = 0.8;
	double SpinDecay = 0.4;
	double NetDamping = 0.15;
};
PhysicsParams MakePickleballPhysics();

enum class EPhysicsEvent : uint8_t { Bounce, Net, NetCord, CrossNet };
struct PhysicsEvent
{
	EPhysicsEvent Type;
	Vec3 P;
	double Speed = 0;
	PhysicsEvent(EPhysicsEvent InType, const Vec3& InP, double InSpeed = 0) : Type(InType), P(InP), Speed(InSpeed) {}
};

/** Advance the ball by Dt seconds (semi-implicit Euler). Appends events to Out. */
void StepBall(BallState& Ball, double Dt, const PhysicsParams& Params, const Court& C, std::vector<PhysicsEvent>& Out, bool bCollideNet = true);

// ------------------------------------------------------------------ shots

enum class EShotType : uint8_t { Serve, Drive, Dink, Drop, Lob };
struct ShotProfile
{
	double Pace, MinFlightTime, NetClearance, Topspin;
};
const ShotProfile& GetShotProfile(EShotType Type);

struct ShotSolution
{
	Vec3 Velocity, Spin, Landing;
	double FlightTime = 0, NetClearance = 0;
};
/** Launch velocity that lands the ball on Target (ground point) and clears the net by the profile margin. */
ShotSolution SolveShot(const Vec3& From, const Vec3& Target, EShotType Type, const PhysicsParams& Params, const Court& C);

// ------------------------------------------------------------------ pickleball rules (singles, side-out scoring)

enum class EFault : uint8_t { None, ServeIntoNet, ServeInKitchen, ServeWrongCourt, ServeOut, Net, Out, DoubleBounce, TwoBounceRule, KitchenVolley, DoubleHit };
const char* FaultName(EFault F);
enum class EPhase : uint8_t { AwaitingServe, InPlay, PointOver, GameOver };

struct RulesState
{
	EPhase Phase = EPhase::AwaitingServe;
	Side Server = 0;
	std::array<int, 2> Score{0, 0};
	int HitCount = 0;
	std::optional<Side> LastHitter;
	int BouncesSinceHit = 0;
	std::optional<Side> Winner;
	std::array<int, 2> MaxDeficit{0, 0};
	int PointsPlayed = 0;
};

enum class ERuleEvent : uint8_t { Serve, Hit, Bounce, Fault, Point, GameOver };
struct RuleEvent
{
	explicit RuleEvent(ERuleEvent InType) : Type(InType) {}
	ERuleEvent Type;
	Side S = 0;          // serve: server; hit: hitter; bounce: landed side; fault: faulting side; point: rally winner; game over: winner
	EFault Fault = EFault::None;
	int HitCount = 0;
	bool bVolley = false;
	bool bInBounds = false;
	bool bScored = false, bSideOut = false, bAce = false, bGamePoint = false, bSavedGamePoint = false, bComeback = false;
	int RallyLength = 0;
	std::array<int, 2> Score{0, 0};
	Vec3 P;
};

class PickleballRules
{
public:
	explicit PickleballRules(const Court& InCourt, int PointsToWin = 11, int WinBy = 2, Side FirstServer = 0);

	const RulesState& State() const { return S; }
	RulesState& MutableState() { return S; } // for tests / save-games
	Side Receiver() const { return OtherSide(S.Server); }
	bool ServerOnRight() const { return S.Score[S.Server] % 2 == 0; }
	int ServerCourtXSign() const;
	int TargetCourtXSign() const { return -ServerCourtXSign(); }
	Vec3 ServerPosition() const;
	Vec3 ReceiverPosition() const;
	bool MustLetBounce(Side Who) const;
	bool IsGamePointFor(Side Who) const;

	std::vector<RuleEvent> Serve();
	std::vector<RuleEvent> Hit(Side Who, const Vec3& PlayerPos);
	std::vector<RuleEvent> Bounce(const Vec3& P);
	void NextPoint();
	std::string ScoreCall() const;

private:
	std::vector<RuleEvent> FaultOn(Side Who, EFault Reason, std::vector<RuleEvent> Prefix = {});
	std::optional<Side> CheckWinner() const;

	Court C;
	int PointsToWin, WinBy;
	RulesState S;
	std::optional<Side> GamePointAgainst;
};
} // namespace RallyCore
