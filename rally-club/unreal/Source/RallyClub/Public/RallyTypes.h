// Unreal-facing types and conversions for the engine-agnostic RallyCore.
#pragma once

#include "CoreMinimal.h"
#include "RallyCore.h"
#include "RallyMatch.h"

#include "RallyTypes.generated.h"

namespace RallyUE
{
/** Core metres (x across, y up, z along, right-handed) -> Unreal centimetres (X forward, Y right, Z up, left-handed). */
inline FVector ToUnreal(const RallyCore::Vec3& V) { return FVector(V.z * 100.0, -V.x * 100.0, V.y * 100.0); }
inline RallyCore::Vec3 FromUnreal(const FVector& V) { return RallyCore::Vec3(-V.Y / 100.0, V.Z / 100.0, V.X / 100.0); }
} // namespace RallyUE

UENUM(BlueprintType)
enum class ERallyAssist : uint8
{
	Casual,
	Classic,
	Precision
};

UENUM(BlueprintType)
enum class ERallyShot : uint8
{
	Drive,
	Dink,
	Lob
};

UENUM(BlueprintType)
enum class ERallyCrowdState : uint8
{
	Idle,
	Murmur,
	Tension,
	Cheer,
	Gasp,
	Ovation,
	Applause
};

UENUM(BlueprintType)
enum class ERallyDjAction : uint8
{
	Duck,
	Unduck,
	Sting,
	Build,
	Drop,
	FilterDown,
	FilterUp
};

UENUM(BlueprintType)
enum class ERallyCameraAction : uint8
{
	ServeView,
	RallyFollow,
	PointSweep,
	TensionPush,
	Celebrate
};

UENUM(BlueprintType)
enum class ERallyHaptic : uint8
{
	Impact,
	Perfect,
	Miss,
	Point,
	Win
};

/** Snapshot of the match for HUD / UMG. */
USTRUCT(BlueprintType)
struct FRallyScoreboard
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) int32 Score0 = 0;
	UPROPERTY(BlueprintReadOnly) int32 Score1 = 0;
	UPROPERTY(BlueprintReadOnly) int32 Server = 0;
	UPROPERTY(BlueprintReadOnly) int32 RallyLength = 0;
	UPROPERTY(BlueprintReadOnly) FString ScoreCall;
	UPROPERTY(BlueprintReadOnly) bool bGameOver = false;
	UPROPERTY(BlueprintReadOnly) int32 Winner = -1;
};

inline RallyCore::EAssist ToCore(ERallyAssist A)
{
	return A == ERallyAssist::Casual ? RallyCore::EAssist::Casual : A == ERallyAssist::Classic ? RallyCore::EAssist::Classic : RallyCore::EAssist::Precision;
}

inline RallyCore::EShotType ToCore(ERallyShot S)
{
	return S == ERallyShot::Dink ? RallyCore::EShotType::Dink : S == ERallyShot::Lob ? RallyCore::EShotType::Lob : RallyCore::EShotType::Drive;
}
