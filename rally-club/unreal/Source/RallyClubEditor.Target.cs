using UnrealBuildTool;

public class RallyClubEditorTarget : TargetRules
{
	public RallyClubEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("RallyClub");
	}
}
