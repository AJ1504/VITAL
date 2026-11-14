// Rally Club core — see RallyCore.h. Mirrors /shared/src/{court,physics,shot,rules/pickleball}.ts.
#include "RallyCore.h"

#include <algorithm>
#include <cmath>

namespace RallyCore
{
namespace
{
constexpr double FT = 0.3048;
constexpr double IN = 0.0254;
constexpr double EPS = 1e-9;
constexpr double PI = 3.14159265358979323846;
int Sign(double V) { return V > 0 ? 1 : (V < 0 ? -1 : 0); }
} // namespace

double Length(const Vec3& v) { return std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
double DistXZ(const Vec3& a, const Vec3& b) { return std::hypot(a.x - b.x, a.z - b.z); }
Vec3 Cross(const Vec3& a, const Vec3& b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }

// ------------------------------------------------------------------ court

Court MakePickleballCourt()
{
	Court C;
	C.Sport = ESport::Pickleball;
	C.Width = 20 * FT;
	C.Length = 44 * FT;
	C.NvzDepth = 7 * FT;
	C.LineWidth = 2 * IN;
	C.NetHeightPost = 36 * IN;
	C.NetHeightCenter = 34 * IN;
	C.NetPostOffset = 12 * IN;
	C.HalfWidth = C.Width / 2;
	C.HalfLength = C.Length / 2;
	return C;
}

double NetHeightAt(const Court& C, double X)
{
	const double Span = C.HalfWidth + C.NetPostOffset;
	const double T = std::min(1.0, std::abs(X) / Span);
	return C.NetHeightCenter + (C.NetHeightPost - C.NetHeightCenter) * T;
}

bool InCourt(const Court& C, const Vec3& P) { return std::abs(P.x) <= C.HalfWidth + EPS && std::abs(P.z) <= C.HalfLength + EPS; }
bool InKitchen(const Court& C, const Vec3& P) { return std::abs(P.z) <= C.NvzDepth + EPS; }

bool InServiceBox(const Court& C, const Vec3& P, Side Receiver, int XSign)
{
	const double ZAbs = P.z * SideSign(Receiver);
	if (ZAbs <= C.NvzDepth + EPS) return false;
	if (ZAbs > C.HalfLength + EPS) return false;
	const double XRel = P.x * XSign;
	if (XRel < -C.LineWidth / 2 - EPS) return false;
	if (XRel > C.HalfWidth + EPS) return false;
	return true;
}

// ------------------------------------------------------------------ physics

PhysicsParams MakePickleballPhysics()
{
	PhysicsParams P;
	const double Rho = 1.225, R = 0.037, Cd = 0.4, Mass = 0.026;
	P.BallRadius = R;
	P.DragK = 0.5 * Rho * Cd * PI * R * R / Mass;
	return P;
}

void StepBall(BallState& B, double Dt, const PhysicsParams& Pa, const Court& C, std::vector<PhysicsEvent>& Out, bool bCollideNet)
{
	Vec3& P = B.P;
	Vec3& V = B.V;
	Vec3& W = B.W;
	const double Speed = Length(V);
	const double Drag = -Pa.DragK * Speed;
	const Vec3 Mag = Cross(W, V);
	V.x += (Drag * V.x + Pa.MagnusK * Mag.x) * Dt;
	V.y += (Drag * V.y + Pa.MagnusK * Mag.y - Pa.Gravity) * Dt;
	V.z += (Drag * V.z + Pa.MagnusK * Mag.z) * Dt;
	const Vec3 Prev = P;
	P = P + V * Dt;
	const double Decay = std::max(0.0, 1 - Pa.SpinDecay * Dt);
	W = W * Decay;

	const double R = Pa.BallRadius;
	if (bCollideNet && Sign(Prev.z) != Sign(P.z) && Prev.z != 0)
	{
		const double T = Prev.z / (Prev.z - P.z);
		const double Cx = Prev.x + (P.x - Prev.x) * T;
		const double Cy = Prev.y + (P.y - Prev.y) * T;
		const double Span = C.HalfWidth + C.NetPostOffset;
		const double Top = NetHeightAt(C, Cx);
		if (std::abs(Cx) <= Span && Cy - R < Top)
		{
			if (Cy < Top + R * 0.25)
			{
				const int Back = Sign(Prev.z) != 0 ? Sign(Prev.z) : 1;
				P = {Cx, std::max(R, Cy), Back * (R + 0.001)};
				V.z = -V.z * Pa.NetDamping;
				V.x *= 0.4;
				V.y = std::min(V.y, 0.0) * 0.4;
				Out.push_back({EPhysicsEvent::Net, {Cx, Cy, 0}});
			}
			else
			{
				V.x *= 0.7;
				V.z *= 0.55;
				V.y = std::abs(V.y) * 0.3 + 0.6;
				Out.push_back({EPhysicsEvent::NetCord, {Cx, Cy, 0}});
				Out.push_back({EPhysicsEvent::CrossNet, {Cx, Cy, 0}});
			}
		}
		else
		{
			Out.push_back({EPhysicsEvent::CrossNet, {Cx, Cy, 0}});
		}
	}

	if (P.y < R && V.y < 0)
	{
		const double Impact = -V.y;
		P.y = R;
		if (Impact > 0.35)
		{
			Out.push_back({EPhysicsEvent::Bounce, {P.x, 0, P.z}, Impact});
			V.y = Impact * Pa.Restitution;
			const double Kick = 0.25 * R;
			V.x = (V.x + W.z * Kick) * Pa.BounceFriction;
			V.z = (V.z - W.x * Kick) * Pa.BounceFriction;
			W = W * 0.5;
		}
		else
		{
			if (Impact > 0.05) Out.push_back({EPhysicsEvent::Bounce, {P.x, 0, P.z}, Impact});
			V.y = 0;
			const double Roll = std::max(0.0, 1 - 1.5 * Dt);
			V.x *= Roll;
			V.z *= Roll;
		}
	}
}

// ------------------------------------------------------------------ shots

const ShotProfile& GetShotProfile(EShotType Type)
{
	static const ShotProfile Profiles[] = {
		{12, 0.9, 0.3, 20},  // Serve
		{15, 0.55, 0.12, 60}, // Drive
		{4.5, 0.8, 0.1, 5},  // Dink
		{7, 1.1, 0.2, -15},  // Drop
		{7, 1.7, 2.0, 25},   // Lob
	};
	return Profiles[static_cast<int>(Type)];
}

namespace
{
Vec3 Ballistic(const Vec3& From, const Vec3& To, double T, double G)
{
	return {(To.x - From.x) / T, (To.y - From.y + 0.5 * G * T * T) / T, (To.z - From.z) / T};
}

struct LandingSim
{
	Vec3 Landing;
	std::optional<double> CrossHeight;
	double CrossX = 0;
	double T = 0;
};

LandingSim SimulateLanding(const Vec3& From, const Vec3& Vel, const Vec3& Spin, const PhysicsParams& Pa, const Court& C)
{
	BallState B{From, Vel, Spin};
	const double Dt = 1.0 / 120.0; // must match the match simulation step
	LandingSim R;
	std::vector<PhysicsEvent> Ev;
	for (double T = 0; T < 6; T += Dt)
	{
		const Vec3 Prev = B.P;
		Ev.clear();
		StepBall(B, Dt, Pa, C, Ev, false);
		if (!R.CrossHeight && Sign(Prev.z) != Sign(B.P.z) && Prev.z != 0)
		{
			const double K = Prev.z / (Prev.z - B.P.z);
			R.CrossHeight = Prev.y + (B.P.y - Prev.y) * K;
			R.CrossX = Prev.x + (B.P.x - Prev.x) * K;
		}
		for (const auto& E : Ev)
		{
			if (E.Type == EPhysicsEvent::Bounce)
			{
				R.Landing = {B.P.x, 0, B.P.z};
				R.T = T + Dt;
				return R;
			}
		}
	}
	R.Landing = {B.P.x, 0, B.P.z};
	R.T = 6;
	return R;
}
} // namespace

ShotSolution SolveShot(const Vec3& From, const Vec3& Target, EShotType Type, const PhysicsParams& Pa, const Court& C)
{
	const ShotProfile& Prof = GetShotProfile(Type);
	const double Dist = DistXZ(From, Target);
	const int DirZ = Sign(Target.z - From.z) != 0 ? Sign(Target.z - From.z) : 1;
	const Vec3 Spin{-DirZ * Prof.Topspin, 0, 0};
	const Vec3 Goal{Target.x, Pa.BallRadius, Target.z};
	double T = std::max(Prof.MinFlightTime, Dist / Prof.Pace);
	ShotSolution Best;
	for (int Attempt = 0; Attempt < 25; ++Attempt)
	{
		Vec3 Aim = Goal;
		Vec3 Vel = Ballistic(From, Aim, T, Pa.Gravity);
		LandingSim Sim = SimulateLanding(From, Vel, Spin, Pa, C);
		for (int I = 0; I < 6; ++I)
		{
			const double Ex = Goal.x - Sim.Landing.x, Ez = Goal.z - Sim.Landing.z;
			if (std::hypot(Ex, Ez) < 0.005) break;
			Aim = {Aim.x + Ex, Aim.y, Aim.z + Ez};
			Vel = Ballistic(From, Aim, T, Pa.Gravity);
			Sim = SimulateLanding(From, Vel, Spin, Pa, C);
		}
		const double Clearance = Sim.CrossHeight ? *Sim.CrossHeight - Pa.BallRadius - NetHeightAt(C, Sim.CrossX) : 1e9;
		Best = {Vel, Spin, Sim.Landing, Sim.T, Clearance};
		if (Clearance >= Prof.NetClearance) return Best;
		T *= 1.08;
	}
	return Best;
}

// ------------------------------------------------------------------ rules

const char* FaultName(EFault F)
{
	switch (F)
	{
	case EFault::ServeIntoNet: return "serve_into_net";
	case EFault::ServeInKitchen: return "serve_in_kitchen";
	case EFault::ServeWrongCourt: return "serve_wrong_court";
	case EFault::ServeOut: return "serve_out";
	case EFault::Net: return "net";
	case EFault::Out: return "out";
	case EFault::DoubleBounce: return "double_bounce";
	case EFault::TwoBounceRule: return "two_bounce_rule";
	case EFault::KitchenVolley: return "kitchen_volley";
	case EFault::DoubleHit: return "double_hit";
	default: return "none";
	}
}

PickleballRules::PickleballRules(const Court& InCourt, int InPointsToWin, int InWinBy, Side FirstServer)
	: C(InCourt), PointsToWin(InPointsToWin), WinBy(InWinBy)
{
	S.Server = FirstServer;
}

int PickleballRules::ServerCourtXSign() const
{
	const int Right = S.Server == 0 ? 1 : -1; // side 0 faces -z: right = +x
	return ServerOnRight() ? Right : -Right;
}

Vec3 PickleballRules::ServerPosition() const
{
	return {ServerCourtXSign() * C.HalfWidth * 0.45, 0, SideSign(S.Server) * (C.HalfLength + 0.35)};
}

Vec3 PickleballRules::ReceiverPosition() const
{
	return {TargetCourtXSign() * C.HalfWidth * 0.45, 0, SideSign(Receiver()) * (C.HalfLength - 0.2)};
}

bool PickleballRules::MustLetBounce(Side Who) const
{
	if (S.Phase != EPhase::InPlay) return false;
	const int Next = S.HitCount + 1;
	return (Next == 2 || Next == 3) && (!S.LastHitter || *S.LastHitter != Who);
}

bool PickleballRules::IsGamePointFor(Side Who) const
{
	const int Me = S.Score[Who], Them = S.Score[OtherSide(Who)];
	return Me + 1 >= PointsToWin && Me + 1 - Them >= WinBy;
}

std::vector<RuleEvent> PickleballRules::Serve()
{
	if (S.Phase != EPhase::AwaitingServe) return {};
	S.Phase = EPhase::InPlay;
	S.HitCount = 1;
	S.LastHitter = S.Server;
	S.BouncesSinceHit = 0;
	RuleEvent E{ERuleEvent::Serve};
	E.S = S.Server;
	return {E};
}

std::vector<RuleEvent> PickleballRules::Hit(Side Who, const Vec3& PlayerPos)
{
	if (S.Phase != EPhase::InPlay) return {};
	if (S.LastHitter && *S.LastHitter == Who) return FaultOn(Who, EFault::DoubleHit);
	const bool bVolley = S.BouncesSinceHit == 0;
	if (bVolley && MustLetBounce(Who)) return FaultOn(Who, EFault::TwoBounceRule);
	if (bVolley && InKitchen(C, PlayerPos)) return FaultOn(Who, EFault::KitchenVolley);
	S.HitCount++;
	S.LastHitter = Who;
	S.BouncesSinceHit = 0;
	RuleEvent E{ERuleEvent::Hit};
	E.S = Who;
	E.HitCount = S.HitCount;
	E.bVolley = bVolley;
	return {E};
}

std::vector<RuleEvent> PickleballRules::Bounce(const Vec3& P)
{
	if (S.Phase != EPhase::InPlay || !S.LastHitter) return {};
	const Side Landed = SideOfPoint(P);
	const Side Hitter = *S.LastHitter;
	const bool bServe = S.HitCount == 1;
	S.BouncesSinceHit++;

	RuleEvent B{ERuleEvent::Bounce};
	B.S = Landed;
	B.P = P;
	if (S.BouncesSinceHit == 1)
	{
		B.bInBounds = bServe ? InServiceBox(C, P, Receiver(), TargetCourtXSign()) : InCourt(C, P);
		if (Landed == Hitter) return FaultOn(Hitter, bServe ? EFault::ServeIntoNet : EFault::Net, {B});
		if (!B.bInBounds)
		{
			EFault Reason = EFault::Out;
			if (bServe)
			{
				if (InKitchen(C, P) && std::abs(P.x) <= C.HalfWidth) Reason = EFault::ServeInKitchen;
				else if (P.x * TargetCourtXSign() < 0 && InCourt(C, P)) Reason = EFault::ServeWrongCourt;
				else Reason = EFault::ServeOut;
			}
			return FaultOn(Hitter, Reason, {B});
		}
		return {B};
	}
	B.bInBounds = InCourt(C, P);
	return FaultOn(OtherSide(Hitter), EFault::DoubleBounce, {B});
}

void PickleballRules::NextPoint()
{
	if (S.Phase != EPhase::PointOver) return;
	S.Phase = EPhase::AwaitingServe;
	S.HitCount = 0;
	S.LastHitter.reset();
	S.BouncesSinceHit = 0;
}

std::vector<RuleEvent> PickleballRules::FaultOn(Side Who, EFault Reason, std::vector<RuleEvent> Events)
{
	const Side RallyWinner = OtherSide(Who);
	const Side ServerBefore = S.Server;
	const bool bScored = RallyWinner == S.Server;
	const int RallyLength = S.HitCount;
	const bool bSaved = GamePointAgainst && *GamePointAgainst == RallyWinner;
	if (bScored) S.Score[RallyWinner]++;
	else S.Server = RallyWinner;
	S.PointsPlayed++;
	for (Side X : {0, 1})
	{
		const int Deficit = S.Score[OtherSide(X)] - S.Score[X];
		S.MaxDeficit[X] = std::max(S.MaxDeficit[X], Deficit);
	}
	RuleEvent F{ERuleEvent::Fault};
	F.S = Who;
	F.Fault = Reason;
	Events.push_back(F);

	const std::optional<Side> Winner = CheckWinner();
	const bool bGamePoint = !Winner && IsGamePointFor(S.Server);
	GamePointAgainst = bGamePoint ? std::optional<Side>(OtherSide(S.Server)) : std::nullopt;

	RuleEvent Pt{ERuleEvent::Point};
	Pt.S = RallyWinner;
	Pt.Fault = Reason;
	Pt.bScored = bScored;
	Pt.bSideOut = !bScored;
	Pt.RallyLength = RallyLength;
	Pt.Score = S.Score;
	Pt.bAce = RallyLength == 1 && RallyWinner == ServerBefore && Reason != EFault::DoubleHit;
	Pt.bGamePoint = bGamePoint;
	Pt.bSavedGamePoint = bSaved;
	Events.push_back(Pt);

	if (Winner)
	{
		S.Phase = EPhase::GameOver;
		S.Winner = Winner;
		RuleEvent G{ERuleEvent::GameOver};
		G.S = *Winner;
		G.Score = S.Score;
		G.bComeback = S.MaxDeficit[*Winner] >= 4;
		Events.push_back(G);
	}
	else
	{
		S.Phase = EPhase::PointOver;
	}
	return Events;
}

std::optional<Side> PickleballRules::CheckWinner() const
{
	const int A = S.Score[0], B = S.Score[1];
	if (A >= PointsToWin && A - B >= WinBy) return 0;
	if (B >= PointsToWin && B - A >= WinBy) return 1;
	return std::nullopt;
}

std::string PickleballRules::ScoreCall() const
{
	return std::to_string(S.Score[S.Server]) + "-" + std::to_string(S.Score[OtherSide(S.Server)]);
}
} // namespace RallyCore
