const STORAGE_KEY = "dual_recording_settings";

export interface DualRecordingConfig {
  debounceMs: number;
  flushThreshold: number;
}

export const DEFAULT_DUAL_RECORDING_SETTINGS: DualRecordingConfig = {
  debounceMs: 150,
  flushThreshold: 1,
};

export const getDualRecordingSettings = (): DualRecordingConfig => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_DUAL_RECORDING_SETTINGS;
    const parsed = JSON.parse(stored);
    return {
      debounceMs:
        typeof parsed.debounceMs === "number"
          ? parsed.debounceMs
          : DEFAULT_DUAL_RECORDING_SETTINGS.debounceMs,
      flushThreshold:
        typeof parsed.flushThreshold === "number"
          ? parsed.flushThreshold
          : DEFAULT_DUAL_RECORDING_SETTINGS.flushThreshold,
    };
  } catch {
    return DEFAULT_DUAL_RECORDING_SETTINGS;
  }
};

export const setDualRecordingSettings = (
  settings: DualRecordingConfig
): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
};
