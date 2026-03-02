import { useState, useEffect } from "react";
import { Loader2, XIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button, ScrollArea } from "@/components";
import { KYCDiffPanel, SalesPromptPanel } from "@/pages/app/components/completion/KYCDiffPanel";
import type {
  PendingKYCUpdate,
  ComplianceFlag,
  SalesPrompt,
} from "@/pages/app/components/completion/KYCDiffPanel";

const RKEYS = {
  kycUpdates:      "salesly_recording_kyc_updates",
  complianceFlags: "salesly_recording_compliance_flags",
  salesPrompts:    "salesly_recording_sales_prompts",
  isLoading:       "salesly_recording_is_loading",
  isAnalysing:     "salesly_recording_is_analysing",
  isActive:        "salesly_recording_is_active",
  response:        "salesly_recording_response",
  error:           "salesly_recording_error",
  action:          "salesly_recording_action",
} as const;

const ANALYSING_MESSAGES = [
  "Analysing conversation...",
  "Reviewing client profile...",
  "Detecting KYC updates...",
  "Checking for opportunities...",
  "Generating changes...",
  "Cross-referencing data...",
];

const MESSAGE_INTERVAL_MS = 2_200;

function useRotatingMessage(active: boolean): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const id = setInterval(
      () => setIndex((i) => (i + 1) % ANALYSING_MESSAGES.length),
      MESSAGE_INTERVAL_MS
    );
    return () => clearInterval(id);
  }, [active]);
  return ANALYSING_MESSAGES[index];
}

function parseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readState() {
  return {
    kycUpdates: parseJSON<PendingKYCUpdate[]>(
      localStorage.getItem(RKEYS.kycUpdates),
      []
    ),
    complianceFlags: parseJSON<ComplianceFlag[]>(
      localStorage.getItem(RKEYS.complianceFlags),
      []
    ),
    salesPrompts: parseJSON<SalesPrompt[]>(
      localStorage.getItem(RKEYS.salesPrompts),
      []
    ),
    isLoading: localStorage.getItem(RKEYS.isLoading) === "true",
    isAnalysing: localStorage.getItem(RKEYS.isAnalysing) === "true",
    isActive: localStorage.getItem(RKEYS.isActive) === "true",
    response: localStorage.getItem(RKEYS.response) ?? "",
    error: localStorage.getItem(RKEYS.error) ?? "",
  };
}

function sendAction(action: "clear_kyc" | "clear_sales" | "reset" | "cancel") {
  // Write a timestamped action so the storage event fires even if same value
  localStorage.setItem(RKEYS.action, `${action}:${Date.now()}`);
}

export default function RecordingWindow() {
  const [data, setData] = useState(readState);
  const [activeTab, setActiveTab] = useState<"analysis" | "sales">("analysis");

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key && (Object.values(RKEYS) as string[]).includes(e.key) && e.key !== RKEYS.action) {
        setData(readState());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const {
    kycUpdates,
    complianceFlags,
    salesPrompts,
    isLoading,
    isAnalysing,
    isActive,
    response,
    error,
  } = data;

  const hasPendingKYC = kycUpdates.length > 0 || complianceFlags.length > 0;
  const hasPendingSales = salesPrompts.length > 0;
  const hasAnalysisContent =
    hasPendingKYC || isAnalysing || isLoading || !!response || !!error;

  // Auto-switch tabs
  useEffect(() => {
    if (hasAnalysisContent) {
      setActiveTab("analysis");
    } else if (hasPendingSales) {
      setActiveTab("sales");
    }
  }, [hasAnalysisContent, hasPendingSales]);

  const analysingMessage = useRotatingMessage(isAnalysing && !hasPendingKYC);
  const showTabs = hasPendingSales;

  const handleClose = () => {
    if (isLoading) {
      sendAction("cancel");
    } else {
      sendAction("reset");
    }
    invoke("close_recording").catch(console.error);
  };

  const isTitle =
    hasPendingKYC || hasPendingSales || isAnalysing
      ? "Meeting Analysis"
      : "AI Response";

  return (
    <div className="w-screen h-screen flex flex-col bg-background border border-border/50 rounded-lg overflow-hidden select-none">
      {/* Draggable header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 shrink-0 cursor-grab active:cursor-grabbing"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          {(isLoading || isAnalysing) && (
            <Loader2
              className="h-3 w-3 animate-spin text-muted-foreground shrink-0"
              data-tauri-drag-region
            />
          )}
          {isActive && !isLoading && !isAnalysing && (
            <span
              className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0"
              data-tauri-drag-region
            />
          )}
          <h3 className="font-semibold text-xs" data-tauri-drag-region>
            {isTitle}
          </h3>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleClose}
          className="cursor-pointer h-6 w-6"
          title={isLoading ? "Cancel" : "Close"}
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Tabs — only shown when there are sales prompts */}
      {showTabs && (
        <div className="flex border-b border-border/50 bg-muted/10 shrink-0">
          {(["analysis", "sales"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "analysis"
                ? "Analysis"
                : `Sales${salesPrompts.length > 0 ? ` (${salesPrompts.length})` : ""}`}
            </button>
          ))}
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 select-text">
          {/* ── Analysis tab ──────────────────────────────────── */}
          {(!showTabs || activeTab === "analysis") && (
            <>
              {error && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                  <strong>Error:</strong> {error}
                </div>
              )}

              {hasPendingKYC && (
                <KYCDiffPanel
                  pendingUpdates={kycUpdates}
                  complianceFlags={complianceFlags}
                  onAllResolved={() => sendAction("clear_kyc")}
                />
              )}

              {isAnalysing && !hasPendingKYC && (
                <div className="flex flex-col items-center justify-center gap-3 py-8 select-none">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <p
                    key={analysingMessage}
                    className="text-sm text-muted-foreground animate-pulse transition-all duration-300"
                  >
                    {analysingMessage}
                  </p>
                </div>
              )}

              {isLoading && (
                <div className="flex items-center gap-2 my-4 text-muted-foreground animate-pulse select-none">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Analysing meeting...</span>
                </div>
              )}

              {response && (
                <p className="text-sm text-foreground whitespace-pre-wrap">{response}</p>
              )}

              {isActive && !isAnalysing && !hasPendingKYC && !isLoading && !response && !error && (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground select-none">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm">Listening...</span>
                </div>
              )}

              {!isActive && !isAnalysing && !hasPendingKYC && !isLoading && !response && !error && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Start recording to see meeting analysis here.
                </p>
              )}
            </>
          )}

          {/* ── Sales tab ──────────────────────────────────────── */}
          {showTabs && activeTab === "sales" && (
            <SalesPromptPanel
              salesPrompts={salesPrompts}
              onAllDismissed={() => sendAction("clear_sales")}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
