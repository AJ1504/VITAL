using UnrealBuildTool;

public class RallyClub : ModuleRules
{
	public RallyClub(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		CppStandard = CppStandardVersion.Cpp20;

		PublicIncludePaths.Add(ModuleDirectory + "/Core");
		PublicIncludePaths.Add(ModuleDirectory + "/Public");

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput", "UMG", "AudioMixer", "AudioExtensions", "MetasoundEngine",
			"Json", "JsonUtilities",
			// Pixel Streaming 2 (browser delivery): UPixelStreaming2Input lives in the PixelStreaming2Input module.
			"PixelStreaming2Input"
		});
		PrivateDependencyModuleNames.AddRange(new string[] { "Slate", "SlateCore" });

		// The engine-agnostic core (Core/*.cpp) uses std:: containers and is also built standalone by CoreTests.
		bEnableExceptions = false;
		bUseRTTI = false;
	}
}
