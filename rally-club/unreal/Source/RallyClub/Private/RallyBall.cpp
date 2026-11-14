#include "RallyBall.h"

#include "Components/StaticMeshComponent.h"
#include "Kismet/GameplayStatics.h"
#include "UObject/ConstructorHelpers.h"

ARallyBall::ARallyBall()
{
	PrimaryActorTick.bCanEverTick = false;
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	RootComponent = Mesh;
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->CastShadow = true;
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	if (Sphere.Succeeded()) Mesh->SetStaticMesh(Sphere.Object);
	// Engine sphere is 100 cm across; pickleball is ~7.4 cm.
	Mesh->SetRelativeScale3D(FVector(0.074f * VisualScale));
}

void ARallyBall::OnStruck(double Speed, bool bPerfect)
{
	if (PaddleSound) UGameplayStatics::PlaySoundAtLocation(this, PaddleSound, GetActorLocation(), 1.f, 0.9f + static_cast<float>(Speed) * 0.01f);
	if (bPerfect && PerfectSound) UGameplayStatics::PlaySoundAtLocation(this, PerfectSound, GetActorLocation());
	BP_OnStruck(static_cast<float>(Speed), bPerfect);
}

void ARallyBall::OnBounce(double Speed)
{
	if (BounceSound) UGameplayStatics::PlaySoundAtLocation(this, BounceSound, GetActorLocation(), FMath::Clamp(static_cast<float>(Speed) * 0.1f, 0.1f, 1.f));
	BP_OnBounce(static_cast<float>(Speed));
}
