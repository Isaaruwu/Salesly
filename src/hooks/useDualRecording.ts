import { useEffect, useRef, useState, useCallback } from "react";
import { useMicVAD } from "@ricky0123/vad-react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "@/contexts";
import { fetchSTT } from "@/lib/functions";
import { floatArrayToWav, resampleAudioTo16k } from "@/lib/utils";
import { getDualRecordingSettings } from "@/lib/storage";

export interface DiarizedSegment {
  id: string;
  speaker: "Advisor" | "Client";
  text: string;
  timestamp: number;
}

const VAD_CONFIG = {
  enabled: true,
  hop_size: 1024,
  sensitivity_rms: 0.012,
  peak_threshold: 0.035,
    silence_chunks: 20,
  min_speech_chunks: 7,
  pre_speech_chunks: 12,
  noise_gate_threshold: 0.003,
  max_recording_duration_secs: 180,
};

// Fallback defaults — overridden at runtime by getDualRecordingSettings()
const DEFAULT_DEBOUNCE_MS = 150;
const DEFAULT_FLUSH_THRESHOLD = 1;

export type UseDualRecordingReturn = ReturnType<typeof useDualRecording>;

export function useDualRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<DiarizedSegment[]>([]);
  const [isMicProcessing, setIsMicProcessing] = useState(false);
  const [isSysAudioProcessing, setIsSysAudioProcessing] = useState(false);
  const [error, setError] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const isRecordingRef = useRef(false);
  // Stable ref so the debounce callback always reads the latest transcript
  const transcriptRef = useRef<DiarizedSegment[]>([]);
  // Cursor: index of the last segment sent to AI
  const lastSentIndexRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { selectedSttProvider, allSttProviders, selectedAudioDevices } =
    useApp();

  // Keep refs in sync
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const sttRef = useRef({ selectedSttProvider, allSttProviders });
  useEffect(() => {
    sttRef.current = { selectedSttProvider, allSttProviders };
  }, [selectedSttProvider, allSttProviders]);

  const addSegment = useCallback(
    (speaker: "Advisor" | "Client", text: string) => {
      setTranscript((prev) => [
        ...prev,
        {
          id: `${speaker}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          speaker,
          text,
          timestamp: Date.now(),
        },
      ]);
    },
    []
  );

  const addSegmentRef = useRef(addSegment);
  useEffect(() => {
    addSegmentRef.current = addSegment;
  }, [addSegment]);

  const runSTT = useCallback(async (audioBlob: Blob): Promise<string> => {
    const { selectedSttProvider: sp, allSttProviders: all } = sttRef.current;
    if (!sp.provider) throw new Error("No STT provider selected");
    const cfg = all.find((p) => p.id === sp.provider);
    if (!cfg) throw new Error("STT provider config not found");
    return fetchSTT({ provider: cfg, selectedProvider: sp, audio: audioBlob });
  }, []);

  // ── Debounced dispatch: send new segments to AI shortly after speech ends ───
  useEffect(() => {
    if (!isRecording) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }

    const newCount = transcript.length - lastSentIndexRef.current;
    if (newCount <= 0) return;

    const dispatch = () => {
      const segs = transcriptRef.current;
      if (segs.length <= lastSentIndexRef.current) return;
      const newSegs = segs.slice(lastSentIndexRef.current);
      lastSentIndexRef.current = segs.length;
      const text = newSegs.map((s) => `${s.speaker}: ${s.text}`).join("\n");
      window.dispatchEvent(
        new CustomEvent("meetingTranscript", { detail: { text } })
      );
    };

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const { debounceMs, flushThreshold } = getDualRecordingSettings();
    const resolvedDebounce = debounceMs ?? DEFAULT_DEBOUNCE_MS;
    const resolvedThreshold = flushThreshold ?? DEFAULT_FLUSH_THRESHOLD;

    if (newCount >= resolvedThreshold) {
      // Enough context — send immediately without waiting
      dispatch();
    } else {
      // Wait for a pause in speech before sending
      debounceTimerRef.current = setTimeout(dispatch, resolvedDebounce);
    }

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [transcript, isRecording]);

  // ── Mic VAD (Advisor) ──────────────────────────────────────────────────────
  const audioConstraints: MediaTrackConstraints =
    selectedAudioDevices.input.id &&
    selectedAudioDevices.input.id !== "default"
      ? { deviceId: { exact: selectedAudioDevices.input.id } }
      : {};

  const vad = useMicVAD({
    startOnLoad: false,
    additionalAudioConstraints: audioConstraints,
    onSpeechEnd: async (audio) => {
      if (!isRecordingRef.current) return;
      try {
        setIsMicProcessing(true);
        const blob = floatArrayToWav(audio, 16000, "wav");
        const text = await runSTT(blob);
        if (text.trim()) addSegmentRef.current("Advisor", text.trim());
      } catch (err) {
        console.error("[DualRecording] Mic STT:", err);
      } finally {
        setIsMicProcessing(false);
      }
    },
  });

  // ── System audio (Client) ──────────────────────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen("speech-detected", async (event) => {
      if (!isRecordingRef.current) return;
      try {
        setIsSysAudioProcessing(true);
        const b64 = event.payload as string;
        const raw = atob(b64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const rawBlob = new Blob([bytes], { type: "audio/wav" });
        const blob = await resampleAudioTo16k(rawBlob);
        const text = await runSTT(blob);
        if (text.trim()) addSegmentRef.current("Client", text.trim());
      } catch (err) {
        console.error("[DualRecording] System audio STT:", err);
      } finally {
        setIsSysAudioProcessing(false);
      }
    }).then((u) => {
      unlisten = u;
    });

    return () => {
      unlisten?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls ───────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      setError("");

      const hasAccess = await invoke<boolean>("check_system_audio_access");
      if (!hasAccess) {
        setSetupRequired(true);
        setIsPopoverOpen(true);
        return;
      }

      vad.start();

      await invoke("start_system_audio_capture", {
        vadConfig: VAD_CONFIG,
        deviceId:
          selectedAudioDevices.output.id &&
          selectedAudioDevices.output.id !== "default"
            ? selectedAudioDevices.output.id
            : null,
      });

      // Reset poll cursor so we don't re-send old segments
      lastSentIndexRef.current = transcriptRef.current.length;

      isRecordingRef.current = true;
      setIsRecording(true);
      setIsPopoverOpen(true);

      // Notify useCompletion to bind this session to the client's meeting conversation
      const clientId = localStorage.getItem("salesly_meeting_client_id");
      if (clientId) {
        const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const conversationId = `meeting_${clientId}_${date}`;
        window.dispatchEvent(
          new CustomEvent("meetingStarted", { detail: { clientId, conversationId } })
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsPopoverOpen(true);
    }
  }, [vad, selectedAudioDevices]);

  const stopRecording = useCallback(async () => {
    try {
      vad.pause();
      await invoke("stop_system_audio_capture");
    } catch (err) {
      console.error("[DualRecording] Stop:", err);
    } finally {
      isRecordingRef.current = false;
      setIsRecording(false);
      window.dispatchEvent(new CustomEvent("meetingStopped"));
    }
  }, [vad]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) await stopRecording();
    else await startRecording();
  }, [isRecording, startRecording, stopRecording]);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    lastSentIndexRef.current = 0;
  }, []);

  const handleSetup = useCallback(async () => {
    try {
      await invoke("request_system_audio_access");
      await new Promise((r) => setTimeout(r, 3000));
      const ok = await invoke<boolean>("check_system_audio_access");
      if (ok) {
        setSetupRequired(false);
        await startRecording();
      } else {
        setError("Permission not granted. Please try the manual steps.");
      }
    } catch {
      setError("Failed to request access.");
    }
  }, [startRecording]);

  // Close popover when not recording/erroring
  useEffect(() => {
    const shouldOpen = isRecording || setupRequired || !!error;
    setIsPopoverOpen(shouldOpen);
  }, [isRecording, setupRequired, error]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      invoke("stop_system_audio_capture").catch(() => {});
    };
  }, []);

  return {
    isRecording,
    transcript,
    isMicProcessing,
    isSysAudioProcessing,
    error,
    setupRequired,
    isPopoverOpen,
    setIsPopoverOpen,
    isMicListening: vad.listening,
    isMicSpeaking: vad.userSpeaking,
    startRecording,
    stopRecording,
    toggleRecording,
    clearTranscript,
    handleSetup,
  };
}
