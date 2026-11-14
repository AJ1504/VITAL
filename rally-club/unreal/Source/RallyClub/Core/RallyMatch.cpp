// Port of /shared/src/match.ts (match mode) and /shared/src/ai.ts. Keep behaviour in lockstep with the
// TypeScript core; CoreTests exercises full AI-vs-AI games through this code.
#include "RallyMatch.h"

#include <algorithm>
#include <cmath>

namespace RallyCore
{
namespace
{
double Clamp(double V, double Lo, double Hi) { return V < Lo ? Lo : (V > Hi ? Hi : V); }
double WindowFor(EAssist A) { return A == EAssist::Casual ? 0.7 : A == EAssist::Classic ? 0.5 : 0.35; }
double SpeedFor(EAssist A) { return A == EAssist::Casual ? 5.6 : A == EAssist::Classic ? 5.2 : 5.0; }
double TimingTolFor(EAssist A) { return A == EAssist::Casual ? 0.35 : A == EAssist::Classic ? 0.22 : 0.13; }
double ShotErrorRadius(double Quality, bool bPrecision)
{
	const double Base = bPrecision ? 2.0 : 1.3;
	const double Q = Clamp(Quality, 0, 1);
	return Base * (1 - Q) + (bPrecision ? 0.12 : 0.08);
}
constexpr double PointPause = 1.9;

struct TrajSample
{
	double T;
	Vec3 P, V;
	int Bounces;
};

std::vector<TrajSample> Predict(const BallState& Ball, const PhysicsParams& Pa, const Court& C, double MaxT, double Dt, int MaxBounces)
{
	BallState B = Ball;
	std::vector<TrajSample> Out;
	std::vector<PhysicsEvent> Ev;
	int Bounces = 0;
	for (double T = 0; T <= MaxT; T += Dt)
	{
		Ev.clear();
		StepBall(B, Dt, Pa, C, Ev);
		for (const auto& E : Ev)
		{
			if (E.Type == EPhysicsEvent::Bounce) ++Bounces;
			if (E.Type == EPhysicsEvent::Net) return Out;
		}
		Out.push_back({T + Dt, B.P, B.V, Bounces});
		if (Bounces >= MaxBounces) break;
	}
	return Out;
}
} // namespace

double ReachFor(EAssist A) { return A == EAssist::Casual ? 1.45 : A == EAssist::Classic ? 1.15 : 0.9; }

double Rng::Next()
{
	State += 0x6d2b79f5u;
	uint32_t T = State;
	T = (T ^ (T >> 15)) * (T | 1u);
	T ^= T + (T ^ (T >> 7)) * (T | 61u);
	return static_cast<double>(T ^ (T >> 14)) / 4294967296.0;
}

double Rng::Gaussian() { return Next() + Next() + Next() + Next() + Next() + Next() - 3; }

// ------------------------------------------------------------------ MatchSim

MatchSim::MatchSim(const MatchOptions& Opts)
	: C(MakePickleballCourt()), Physics(MakePickleballPhysics()), Rules(C, Opts.PointsToWin, 2, Opts.FirstServer), R(Opts.Seed)
{
	for (int I = 0; I < 2; ++I)
	{
		Players[I].S = I;
		Players[I].Assist = Opts.Assist[I];
		Players[I].Pos = {0, 0, SideSign(I) * (C.HalfLength - 0.3)};
	}
	Ball.P = {0, 1, 0};
	SetupServe();
	SimEvent E(ESimEvent::MatchStart);
	E.S = Rules.State().Server;
	Emit(E);
}

void MatchSim::Update(double Dt, std::array<ControlInput, 2> Inputs)
{
	Accumulator += std::min(Dt, 0.1);
	while (Accumulator >= SimDt)
	{
		FixedStep(Inputs);
		Accumulator -= SimDt;
		Inputs[0].bSwing = Inputs[1].bSwing = false; // swing requests are edge-triggered
	}
}

std::vector<SimEvent> MatchSim::DrainEvents()
{
	std::vector<SimEvent> Out;
	Out.swap(Events);
	return Out;
}

bool MatchSim::BallIncomingFor(Side Who) const
{
	if (bBallHeld) return false;
	const RulesState& St = Rules.State();
	return St.Phase == EPhase::InPlay && (!St.LastHitter || *St.LastHitter != Who);
}

std::optional<InterceptPlan> MatchSim::Intercept(Side Who)
{
	if (InterceptAge[Who] < 0.08) return InterceptCache[Who];
	InterceptAge[Who] = 0;
	InterceptCache[Who] = ComputeIntercept(Who);
	return InterceptCache[Who];
}

Vec3 MatchSim::ReadyPosition(Side Who) const
{
	const PlayerState& P = Players[Who];
	const bool bAtNet = Rules.State().HitCount >= 3 && P.Assist != EAssist::Precision;
	const double Depth = bAtNet ? C.NvzDepth + 0.5 : C.HalfLength - 0.4;
	return {Clamp(Ball.P.x * 0.35, -1.2, 1.2), 0, SideSign(Who) * Depth};
}

void MatchSim::FixedStep(std::array<ControlInput, 2>& Inputs)
{
	const double Dt = SimDt;
	Time += Dt;
	InterceptAge[0] += Dt;
	InterceptAge[1] += Dt;

	if (Rules.State().Phase == EPhase::PointOver)
	{
		PointTimer -= Dt;
		if (PointTimer <= 0)
		{
			Rules.NextPoint();
			SetupServe();
			SimEvent E(ESimEvent::PointReset);
			E.S = Rules.State().Server;
			Emit(E);
		}
	}

	for (PlayerState& P : Players) UpdatePlayer(P, Inputs[P.S], Dt);

	if (bBallHeld)
	{
		Ball.P = ServeBallPos();
		Ball.V = {};
	}
	else
	{
		std::vector<PhysicsEvent> Ev;
		StepBall(Ball, Dt, Physics, C, Ev);
		for (const auto& E : Ev)
		{
			if (E.Type == EPhysicsEvent::Bounce)
			{
				SimEvent B(ESimEvent::BallBounce);
				B.P = E.P;
				B.Speed = E.Speed;
				Emit(B);
				EmitRules(Rules.Bounce(E.P));
			}
			else if (E.Type == EPhysicsEvent::Net || E.Type == EPhysicsEvent::NetCord)
			{
				SimEvent N(E.Type == EPhysicsEvent::Net ? ESimEvent::NetTouch : ESimEvent::NetCord);
				N.P = E.P;
				Emit(N);
			}
		}
		if (std::abs(Ball.P.z) > 40 || std::abs(Ball.P.x) > 30)
		{
			EmitRules(Rules.Bounce({Ball.P.x, 0, Ball.P.z}));
			Ball.V = {};
			Ball.P = {0, -5, 0};
		}
	}
	for (PlayerState& P : Players) ResolveContact(P);
}

void MatchSim::SetupServe()
{
	const Side Server = Rules.State().Server;
	Players[Server].Pos = Rules.ServerPosition();
	Players[OtherSide(Server)].Pos = Rules.ReceiverPosition();
	for (PlayerState& P : Players)
	{
		P.Vel = {};
		P.SwingWindow = 0;
		P.PendingSwing.reset();
		P.Anim = EAnim::Ready;
	}
	bBallHeld = true;
	Ball.W = {};
	InterceptAge = {99, 99};
}

Vec3 MatchSim::ServeBallPos() const
{
	const PlayerState& Sp = Players[Rules.State().Server];
	const int S = SideSign(Sp.S);
	return {Sp.Pos.x + 0.35 * S * (Sp.bRightHanded ? 1 : -1), 0.75, Sp.Pos.z - S * 0.35};
}

void MatchSim::UpdatePlayer(PlayerState& P, const ControlInput& In, double Dt)
{
	const RulesState& St = Rules.State();
	const int S = SideSign(P.S);
	const bool bLocked = St.Phase == EPhase::AwaitingServe || St.Phase == EPhase::GameOver;

	if (In.bSwing && P.SwingWindow <= 0)
	{
		P.PendingSwing = In;
		P.SwingWindow = WindowFor(P.Assist);
		P.SwingElapsed = 0;
		P.ClosestDist = 1e9;
	}
	if (St.Phase == EPhase::AwaitingServe && P.S == St.Server && P.PendingSwing)
	{
		const ControlInput Req = *P.PendingSwing;
		P.PendingSwing.reset();
		P.SwingWindow = 0;
		P.SwingAnim = 0.001;
		P.Stroke = EStroke::Serve;
		PerformServe(P, Req);
	}
	if (P.SwingWindow > 0)
	{
		P.SwingElapsed += Dt;
		P.SwingWindow -= Dt;
		if (P.SwingWindow <= 0 && P.PendingSwing)
		{
			P.PendingSwing.reset();
			P.SwingAnim = 0.001;
			SimEvent W(ESimEvent::Whiff);
			W.S = P.S;
			Emit(W);
		}
	}
	if (P.SwingAnim > 0)
	{
		P.SwingAnim += Dt / 0.35;
		if (P.SwingAnim >= 1) P.SwingAnim = 0;
	}
	if (bLocked)
	{
		P.Vel = {};
		P.Anim = St.Phase == EPhase::GameOver ? (St.Winner && *St.Winner == P.S ? EAnim::Celebrate : EAnim::Dejected) : EAnim::Ready;
		return;
	}

	double Wx = In.MoveX * S;
	double Wz = -In.MoveZ * S;
	const bool bManual = std::hypot(Wx, Wz) > 0.05;
	if (P.Assist != EAssist::Precision && !bManual)
	{
		if (const std::optional<Vec3> Target = AutoTarget(P))
		{
			const double Dx = Target->x - P.Pos.x, Dz = Target->z - P.Pos.z;
			const double D = std::hypot(Dx, Dz);
			if (D > 0.04)
			{
				const double K = std::min(1.0, D / 0.6);
				Wx = Dx / D * K;
				Wz = Dz / D * K;
			}
		}
	}
	const double Mag = std::hypot(Wx, Wz);
	if (Mag > 1)
	{
		Wx /= Mag;
		Wz /= Mag;
	}
	const double Speed = SpeedFor(P.Assist);
	const double Accel = 1 - std::exp(-14 * Dt);
	P.Vel.x += (Wx * Speed - P.Vel.x) * Accel;
	P.Vel.z += (Wz * Speed - P.Vel.z) * Accel;
	P.Pos.x = Clamp(P.Pos.x + P.Vel.x * Dt, -(C.HalfWidth + 2.2), C.HalfWidth + 2.2);
	P.Pos.z = S * Clamp((P.Pos.z + P.Vel.z * Dt) * S, 0.25, C.HalfLength + 2.5);
	P.Anim = std::hypot(P.Vel.x, P.Vel.z) > 0.6 && St.Phase != EPhase::PointOver ? EAnim::Run : EAnim::Ready;
	if (P.SwingAnim > 0) P.Anim = EAnim::Swing;
}

std::optional<Vec3> MatchSim::AutoTarget(const PlayerState& P)
{
	if (Rules.State().Phase != EPhase::InPlay) return std::nullopt;
	if (BallIncomingFor(P.S))
	{
		if (auto Plan = Intercept(P.S)) return Plan->Stand;
	}
	return ReadyPosition(P.S);
}

std::optional<InterceptPlan> MatchSim::ComputeIntercept(Side Who)
{
	if (!BallIncomingFor(Who)) return std::nullopt;
	const int S = SideSign(Who);
	const bool bMustBounce = Rules.MustLetBounce(Who);
	const std::vector<TrajSample> Traj = Predict(Ball, Physics, C, 3.5, SimDt * 2, 2);
	const PlayerState& P = Players[Who];
	std::optional<Vec3> FirstBounce;
	const TrajSample* Choice = nullptr;
	const TrajSample* VolleyChoice = nullptr;
	for (const TrajSample& Smp : Traj)
	{
		if (Smp.Bounces >= 1 && !FirstBounce) FirstBounce = Smp.P;
		if (Smp.P.z * S < 0.3) continue;
		if (Smp.Bounces == 0 && !bMustBounce && !VolleyChoice && Smp.P.y > 0.45 && Smp.P.y < 1.5 && Smp.P.z * S > C.NvzDepth + 0.35) VolleyChoice = &Smp;
		if (Smp.Bounces == 1 && !Choice && (Smp.P.y > 0.4 || (Smp.V.y <= 0 && Smp.P.y > 0.15))) Choice = &Smp;
	}
	const bool bGoingOut = FirstBounce ? !InCourt(C, *FirstBounce) : false;
	const TrajSample* Pick = Choice ? Choice : (Traj.empty() ? nullptr : &Traj.back());
	if (VolleyChoice)
	{
		const double BounceDepth = FirstBounce ? FirstBounce->z * S : 99;
		if (BounceDepth > C.HalfLength - 0.5 || P.Pos.z * S < C.HalfLength - 2) Pick = VolleyChoice;
	}
	if (!Pick) return std::nullopt;
	const Vec3 Left{Pick->P.x - 0.55, 0, Pick->P.z + S * 0.25};
	const Vec3 Right{Pick->P.x + 0.55, 0, Pick->P.z + S * 0.25};
	Vec3 Stand = DistXZ(Left, P.Pos) < DistXZ(Right, P.Pos) ? Left : Right;
	if (Pick->Bounces == 0) Stand.z = S * std::max(Stand.z * S, C.NvzDepth + 0.2);
	InterceptPlan Plan;
	Plan.Contact = Pick->P;
	Plan.Stand = Stand;
	Plan.TimeToContact = Pick->T;
	Plan.ComputedAt = Time;
	Plan.bAfterBounce = Pick->Bounces >= 1;
	Plan.bBallGoingOut = bGoingOut;
	return Plan;
}

bool MatchSim::CanStrike(const PlayerState& P) const
{
	if (bBallHeld || !BallIncomingFor(P.S)) return false;
	const Vec3& B = Ball.P;
	if (B.z * SideSign(P.S) < -0.02) return false;
	if (B.y < 0.04 || B.y > 2.1) return false;
	if (DistXZ(B, P.Pos) > ReachFor(P.Assist)) return false;
	const bool bNoBounce = Rules.State().BouncesSinceHit == 0;
	if (P.Assist == EAssist::Casual && bNoBounce && (Rules.MustLetBounce(P.S) || InKitchen(C, P.Pos))) return false;
	return true;
}

void MatchSim::ResolveContact(PlayerState& P)
{
	if (P.SwingWindow <= 0 || !P.PendingSwing || !CanStrike(P)) return;
	const double D = DistXZ(Ball.P, P.Pos);
	const bool bClosing = D < P.ClosestDist - 1e-4;
	P.ClosestDist = std::min(P.ClosestDist, D);
	const bool bLowBall = Ball.P.y < 0.18 && Ball.V.y < 0;
	if (bClosing && !bLowBall && P.SwingWindow > SimDt * 1.5) return;

	const ControlInput Req = *P.PendingSwing;
	P.PendingSwing.reset();
	P.SwingWindow = 0;
	P.SwingAnim = 0.001;
	const int S = SideSign(P.S);

	const double Reach = ReachFor(P.Assist);
	const double DistQ = Clamp(1 - std::abs(D - 0.5) / Reach, 0, 1);
	const double TimeQ = Clamp(1 - std::abs((P.SwingElapsed - SwingIdeal) / TimingTolFor(P.Assist)), 0, 1);
	const double Incoming = Length(Ball.V);
	const double PacePenalty = Clamp((Incoming - 11) / 14, 0, 0.5) * (P.Assist == EAssist::Casual ? 0.5 : 1);
	const double Quality = Clamp((0.35 * DistQ + 0.65 * TimeQ) * (1 - PacePenalty) + (P.Assist == EAssist::Casual ? 0.1 : 0), 0, 1);
	const double BallRight = (Ball.P.x - P.Pos.x) * S;
	P.Stroke = (BallRight * (P.bRightHanded ? 1 : -1) >= -0.05 || std::abs(Ball.P.x - P.Pos.x) < 0.1) ? EStroke::Forehand : EStroke::Backhand;

	EmitRules(Rules.Hit(P.S, P.Pos));

	EShotType Shot = Req.Shot;
	if (Shot == EShotType::Dink && Ball.P.y > 1.2) Shot = EShotType::Drive;
	const Vec3 Target = ChooseTarget(P, Shot, Req.Aim, Quality);
	ShotSolution Sol = SolveShot(Ball.P, Target, Shot, Physics, C);
	const bool bSoft = Shot == EShotType::Dink || Shot == EShotType::Drop;
	const double LaunchErr = ShotErrorRadius(Quality, P.Assist == EAssist::Precision) * (P.Assist == EAssist::Casual ? 0.4 : 1) * P.ErrorScale;
	Sol.Velocity.y += R.Gaussian() * LaunchErr * (bSoft ? 0.35 : 0.8);
	Ball.V = Sol.Velocity;
	Ball.W = Sol.Spin;
	InterceptAge = {99, 99};

	SimEvent E(ESimEvent::Contact);
	E.S = P.S;
	E.Quality = Quality;
	E.bPerfect = Quality > 0.88;
	E.Shot = Shot;
	E.Stroke = P.Stroke;
	E.Speed = Length(Sol.Velocity);
	Emit(E);
}

Vec3 MatchSim::ChooseTarget(const PlayerState& P, EShotType Shot, double Aim, double Quality)
{
	const int Opp = -SideSign(P.S);
	const double Margin = P.Assist == EAssist::Casual ? 0.75 : P.Assist == EAssist::Classic ? 0.5 : 0.25;
	double X = Clamp(Aim, -1, 1) * SideSign(P.S) * (C.HalfWidth - Margin);
	double Depth;
	switch (Shot)
	{
	case EShotType::Dink:
		Depth = C.NvzDepth * 0.6;
		X *= 0.7;
		break;
	case EShotType::Drop: Depth = C.NvzDepth * 0.75; break;
	case EShotType::Lob: Depth = C.HalfLength - Margin - 0.3; break;
	default: Depth = C.HalfLength - Margin - 0.9;
	}
	const bool bSoft = Shot == EShotType::Dink || Shot == EShotType::Drop;
	const double Err = ShotErrorRadius(Quality, P.Assist == EAssist::Precision) * (P.Assist == EAssist::Casual ? 0.5 : 1) * P.ErrorScale;
	X += R.Gaussian() * Err * 0.8;
	Depth += R.Gaussian() * Err * (bSoft ? 0.45 : 0.9);
	return {X, 0, Opp * std::max(0.4, Depth)};
}

void MatchSim::PerformServe(PlayerState& P, const ControlInput& Req)
{
	const std::vector<RuleEvent> Ev = Rules.Serve();
	if (Ev.empty()) return;
	EmitRules(Ev);
	const int Tx = Rules.TargetCourtXSign();
	const double Margin = P.Assist == EAssist::Casual ? 0.5 : P.Assist == EAssist::Classic ? 0.35 : 0.15;
	const double BoxDepth = C.HalfLength - C.NvzDepth;
	double X = Tx * C.HalfWidth * 0.5 + Clamp(Req.Aim, -1, 1) * SideSign(P.S) * (C.HalfWidth * 0.5 - Margin);
	double Depth = C.NvzDepth + BoxDepth * (Req.Shot == EShotType::Lob ? 0.85 : 0.68);
	const double Err = P.Assist == EAssist::Precision ? 0.35 : P.Assist == EAssist::Classic ? 0.18 : 0.08;
	X += R.Gaussian() * Err;
	Depth += R.Gaussian() * Err;
	const Vec3 Target{X, 0, SideSign(OtherSide(P.S)) * Depth};
	bBallHeld = false;
	Ball.P = ServeBallPos();
	const ShotSolution Sol = SolveShot(Ball.P, Target, EShotType::Serve, Physics, C);
	Ball.V = Sol.Velocity;
	Ball.W = Sol.Spin;
	InterceptAge = {99, 99};
	SimEvent E(ESimEvent::Contact);
	E.S = P.S;
	E.Quality = 1;
	E.Shot = EShotType::Serve;
	E.Stroke = EStroke::Serve;
	E.Speed = Length(Sol.Velocity);
	Emit(E);
}

void MatchSim::Emit(const SimEvent& E)
{
	Events.push_back(E);
	if (E.Type == ESimEvent::Rule && E.Rule.Type == ERuleEvent::Point) PointTimer = PointPause;
}

void MatchSim::EmitRules(const std::vector<RuleEvent>& Es)
{
	for (const RuleEvent& R2 : Es)
	{
		SimEvent E(ESimEvent::Rule);
		E.Rule = R2;
		Emit(E);
	}
}

// ------------------------------------------------------------------ AI

const AiProfile& AiEasy()
{
	static const AiProfile P{1.4, 0.4, 0.75, 0.22, 0.2, 2.2};
	return P;
}
const AiProfile& AiMedium()
{
	static const AiProfile P{1.1, 0.7, 0.7, 0.15, 0.45, 1.6};
	return P;
}
const AiProfile& AiHard()
{
	static const AiProfile P{0.9, 0.92, 0.65, 0.08, 0.7, 1.15};
	return P;
}

ControlInput AiController::Think(MatchSim& Sim, double Dt)
{
	const RulesState& St = Sim.Rules.State();
	PlayerState& Me = Sim.Players[S];
	Me.ErrorScale = Profile.ErrorScale;
	ControlInput None;

	if (St.Phase == EPhase::AwaitingServe)
	{
		bSwungThisBall = false;
		LetGo.reset();
		if (St.Server != S) return None;
		ServeClock += Dt;
		if (ServeClock >= Profile.ServeDelay)
		{
			ServeClock = 0;
			ControlInput In;
			In.bSwing = true;
			In.Aim = (R.Next() * 2 - 1) * 0.7;
			In.Shot = R.Next() < 0.15 ? EShotType::Lob : EShotType::Drive;
			return In;
		}
		return None;
	}
	ServeClock = 0;
	if (St.HitCount != LastHitCount)
	{
		LastHitCount = St.HitCount;
		bSwungThisBall = false;
		LetGo.reset();
		Lead.reset();
		KitchenLapse.reset();
	}
	if (!Sim.BallIncomingFor(S) || bSwungThisBall) return None;
	const std::optional<InterceptPlan> Plan = Sim.Intercept(S);
	if (!Plan) return None;
	if (Plan->bBallGoingOut && St.BouncesSinceHit == 0)
	{
		if (!LetGo) LetGo = R.Next() < Profile.Judgement;
		if (*LetGo) return None;
	}
	if (St.BouncesSinceHit == 0 && InKitchen(Sim.C, Me.Pos))
	{
		if (!KitchenLapse) KitchenLapse = R.Next() < 0.08;
		if (!*KitchenLapse) return None;
	}
	if (Sim.Rules.MustLetBounce(S) && St.BouncesSinceHit == 0) return None;
	const double Remaining = Plan->TimeToContact - (Sim.Time - Plan->ComputedAt);
	if (!Lead) Lead = SwingIdeal + (R.Next() - 0.5) * 2 * Profile.TimingJitter;
	const bool bNear = DistXZ(Sim.Ball.P, Me.Pos) < ReachFor(Me.Assist) * Profile.CommitReach;
	if (Remaining <= *Lead || (bNear && Remaining < 0.3))
	{
		bSwungThisBall = true;
		Lead.reset();
		ControlInput In;
		In.bSwing = true;
		In.Shot = ChooseShot(Sim);
		In.Aim = ChooseAim(Sim);
		return In;
	}
	return None;
}

EShotType AiController::ChooseShot(MatchSim& Sim)
{
	const RulesState& St = Sim.Rules.State();
	const PlayerState& Me = Sim.Players[S];
	const PlayerState& Opp = Sim.Players[OtherSide(S)];
	const bool bOppAtNet = std::abs(Opp.Pos.z) < Sim.C.NvzDepth + 1.2;
	const bool bMeAtNet = Me.Pos.z * SideSign(S) < Sim.C.NvzDepth + 1.0;
	const double Roll = R.Next();
	if (St.HitCount == 2 && Roll < 0.45) return EShotType::Drop;
	if (bMeAtNet && Sim.Ball.P.y < 0.95 && Roll < 0.75) return EShotType::Dink;
	if (bMeAtNet && Sim.Ball.P.y >= 0.95) return EShotType::Drive;
	if (bOppAtNet && Roll < 0.12 + Profile.Aggression * 0.08) return EShotType::Lob;
	return EShotType::Drive;
}

double AiController::ChooseAim(MatchSim& Sim)
{
	const PlayerState& Opp = Sim.Players[OtherSide(S)];
	const double OppRight = Clamp(Opp.Pos.x * SideSign(S) / Sim.C.HalfWidth, -1, 1);
	double Away = OppRight > 0 ? -1 : (OppRight < 0 ? 1 : (R.Next() < 0.5 ? 1 : -1));
	return Clamp(Away * (0.3 + Profile.Aggression * 0.5) + (R.Next() - 0.5) * 0.6, -1, 1);
}
} // namespace RallyCore
