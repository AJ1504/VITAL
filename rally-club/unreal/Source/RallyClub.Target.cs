using UnrealBuildTool;

public class RallyClubTarget : TargetRules
{
	public RallyClubTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("RallyClub");
	}
}
