import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

export const ContentProtectionToggle = () => {
  const { customizable, toggleContentProtection } = useApp();
  const isEnabled = customizable.contentProtection?.isEnabled ?? true;

  return (
    <div className="space-y-2">
      <Header
        title="Screen Capture Protection"
        description="Control whether the app is hidden from screenshots and screen sharing"
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">
            {isEnabled ? "Protection enabled" : "Protection disabled"}
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            {isEnabled
              ? "App is invisible to screenshots and screen recording"
              : "App is visible in screenshots and screen recording"}
          </p>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={toggleContentProtection}
          aria-label="Toggle screen capture protection"
        />
      </div>
    </div>
  );
};
