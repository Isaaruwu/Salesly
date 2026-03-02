import { useState } from "react";
import { Header } from "@/components";
import {
  getDualRecordingSettings,
  setDualRecordingSettings,
  DEFAULT_DUAL_RECORDING_SETTINGS,
  type DualRecordingConfig,
} from "@/lib/storage";

const PRESETS: { label: string; values: DualRecordingConfig }[] = [
  { label: "Instant", values: { debounceMs: 0, flushThreshold: 1 } },
  { label: "Fast", values: { debounceMs: 150, flushThreshold: 1 } },
  { label: "Balanced", values: { debounceMs: 1_000, flushThreshold: 2 } },
  { label: "Batched", values: { debounceMs: 2_500, flushThreshold: 3 } },
];

export const DualRecordingSettings = () => {
  const [settings, setSettings] = useState<DualRecordingConfig>(
    getDualRecordingSettings
  );
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<DualRecordingConfig>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const save = () => {
    setDualRecordingSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const applyPreset = (preset: DualRecordingConfig) => {
    setSettings(preset);
    setDualRecordingSettings(preset);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => {
    applyPreset(DEFAULT_DUAL_RECORDING_SETTINGS);
  };

  return (
    <div className="space-y-4">
      <Header
        title="Dual Recording — Dispatch Timing"
        description="Controls how quickly new transcript segments are sent to the AI for KYC analysis. Lower values = faster updates; higher values = more context per call."
        isMainTitle
      />

      {/* Presets */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Presets
        </p>
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((p) => {
            const active =
              settings.debounceMs === p.values.debounceMs &&
              settings.flushThreshold === p.values.flushThreshold;
            return (
              <button
                key={p.label}
                onClick={() => applyPreset(p.values)}
                className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors cursor-pointer ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual controls */}
      <div className="space-y-4">
        {/* Debounce */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Header
              title="Debounce delay"
              description="Wait this long after the last speech segment before dispatching to AI."
            />
            <span className="text-xs font-mono text-muted-foreground shrink-0 ml-4">
              {settings.debounceMs} ms
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={5000}
            step={50}
            value={settings.debounceMs}
            onChange={(e) => update({ debounceMs: Number(e.target.value) })}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0 ms (instant)</span>
            <span>5 000 ms</span>
          </div>
        </div>

        {/* Flush threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Header
              title="Flush threshold"
              description="Skip the debounce and dispatch immediately once this many unsent segments accumulate."
            />
            <span className="text-xs font-mono text-muted-foreground shrink-0 ml-4">
              {settings.flushThreshold}{" "}
              {settings.flushThreshold === 1 ? "segment" : "segments"}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={settings.flushThreshold}
            onChange={(e) =>
              update({ flushThreshold: Number(e.target.value) })
            }
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>1 (every segment)</span>
            <span>10</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          className="px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
        <button
          onClick={reset}
          className="px-3 py-1.5 rounded text-xs font-medium bg-muted/40 text-muted-foreground border border-border hover:bg-muted transition-colors cursor-pointer"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
};
