import { useEffect, useState } from "react";
import { Loader2, XIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  ScrollArea,
  Markdown,
} from "@/components";
import { UseCompletionReturn } from "@/types";
import { KYCDiffPanel, SalesPromptPanel } from "./KYCDiffPanel";

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

export const Input = ({
  isPopoverOpen,
  isLoading,
  isMeetingAnalysing,
  isMeetingActive,
  reset,
  error,
  response,
  cancel,
  scrollAreaRef,
  pendingKYCUpdates,
  pendingComplianceFlags,
  clearPendingKYC,
  pendingSalesPrompts,
  clearPendingSalesPrompts,
}: UseCompletionReturn & { isHidden: boolean }) => {
  const hasPendingKYC =
    (pendingKYCUpdates?.length ?? 0) > 0 ||
    (pendingComplianceFlags?.length ?? 0) > 0;

  const activeSalesCount = (pendingSalesPrompts ?? []).filter(
    // SalesPromptPanel tracks dismissed state internally; we just show total pending from hook
    () => true
  ).length;
  const hasPendingSales = activeSalesCount > 0;

  const hasAnalysisContent =
    hasPendingKYC || isMeetingAnalysing || isLoading || !!response || !!error;

  const [activeTab, setActiveTab] = useState<"analysis" | "sales">("analysis");

  // Auto-switch: if only sales arrive with nothing in analysis, jump to sales tab.
  // If analysis content arrives, pull back to analysis.
  useEffect(() => {
    if (hasAnalysisContent) {
      setActiveTab("analysis");
    } else if (hasPendingSales) {
      setActiveTab("sales");
    }
  }, [hasAnalysisContent, hasPendingSales]);

  // Reset tab when popover closes
  useEffect(() => {
    if (!isPopoverOpen) setActiveTab("analysis");
  }, [isPopoverOpen]);

  const analysingMessage = useRotatingMessage(
    isMeetingAnalysing && !hasPendingKYC
  );

  const showTabs = hasPendingSales;

  const handleClose = () => {
    if (isLoading) {
      cancel();
    } else {
      clearPendingKYC();
      clearPendingSalesPrompts();
      reset();
    }
  };

  return (
    <Popover
      open={isPopoverOpen}
      onOpenChange={(open) => {
        if (!open && !isLoading && !isMeetingAnalysing && !isMeetingActive) {
          clearPendingKYC();
          clearPendingSalesPrompts();
          reset();
        }
      }}
    >
      {/* Invisible anchor */}
      <PopoverTrigger asChild>
        <div className="w-0 h-0 overflow-hidden absolute" aria-hidden="true" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        className="w-screen p-0 border shadow-lg overflow-hidden"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <h3 className="font-semibold text-xs select-none">
            {hasPendingKYC || hasPendingSales || isMeetingAnalysing
              ? "Meeting Analysis"
              : "AI Response"}
          </h3>
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
          <div className="flex border-b border-border/50 bg-muted/10">
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
                  : `Sales${activeSalesCount > 0 ? ` (${activeSalesCount})` : ""}`}
              </button>
            ))}
          </div>
        )}

        <ScrollArea ref={scrollAreaRef} className="h-[calc(100vh-6rem)]">
          <div className="p-4">
            {/* ── Analysis tab ─────────────────────────────────── */}
            {(!showTabs || activeTab === "analysis") && (
              <>
                {error && (
                  <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                    <strong>Error:</strong> {error}
                  </div>
                )}

                {hasPendingKYC && (
                  <KYCDiffPanel
                    pendingUpdates={pendingKYCUpdates ?? []}
                    complianceFlags={pendingComplianceFlags ?? []}
                    onAllResolved={clearPendingKYC}
                  />
                )}

                {isMeetingAnalysing && !hasPendingKYC && (
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

                {response && <Markdown>{response}</Markdown>}

                {isMeetingActive && !isMeetingAnalysing && !hasPendingKYC && !isLoading && !response && !error && (
                  <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground select-none">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm">Listening...</span>
                  </div>
                )}
              </>
            )}

            {/* ── Sales tab ─────────────────────────────────────── */}
            {showTabs && activeTab === "sales" && (
              <SalesPromptPanel
                salesPrompts={pendingSalesPrompts ?? []}
                onAllDismissed={clearPendingSalesPrompts}
              />
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
