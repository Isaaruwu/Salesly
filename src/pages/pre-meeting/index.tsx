import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CalendarIcon, XIcon, CheckIcon, Loader2 } from "lucide-react";
import { Button, ScrollArea, Markdown } from "@/components";

const KEYS = {
  content: "salesly_pre_meeting_content",
  streaming: "salesly_pre_meeting_streaming",
  client: "salesly_pre_meeting_client",
  kyc: "salesly_pre_meeting_kyc",
};

function readFromStorage() {
  return {
    content: localStorage.getItem(KEYS.content) ?? "",
    streaming: localStorage.getItem(KEYS.streaming) === "true",
    clientName: localStorage.getItem(KEYS.client) ?? "",
    kycFields: (() => {
      try {
        return JSON.parse(localStorage.getItem(KEYS.kyc) ?? "[]");
      } catch {
        return [];
      }
    })(),
  };
}

function KYCTab({
  fields,
  score,
  filled,
  total,
}: {
  fields: any[];
  score: number;
  filled: number;
  total: number;
}) {
  if (total === 0)
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        No KYC data available.
      </p>
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Completeness</span>
          <span
            className={`font-semibold ${
              score >= 80
                ? "text-green-400"
                : score >= 50
                ? "text-amber-400"
                : "text-red-400"
            }`}
          >
            {score}% ({filled}/{total} fields)
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              score >= 80
                ? "bg-green-500"
                : score >= 50
                ? "bg-amber-500"
                : "bg-red-500"
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {fields.map((f: any) => (
          <div
            key={f.path}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 bg-muted/30"
          >
            <div className="flex items-center gap-2 min-w-0">
              {f.filled ? (
                <CheckIcon className="h-3.5 w-3.5 text-green-400 shrink-0" />
              ) : (
                <XIcon className="h-3.5 w-3.5 text-red-400/60 shrink-0" />
              )}
              <span className="text-xs truncate">{f.label}</span>
            </div>
            {f.filled && (
              <span className="text-[10px] text-muted-foreground font-mono shrink-0 max-w-[110px] truncate">
                {String(f.value)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PreMeetingWindow() {
  const [data, setData] = useState(readFromStorage);
  const [activeTab, setActiveTab] = useState<"brief" | "kyc">("brief");
  const prevClientRef = useRef(data.clientName);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Listen for localStorage changes from the main window
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key && Object.values(KEYS).includes(e.key)) {
        setData(readFromStorage());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Auto-scroll to bottom while brief is streaming
  useEffect(() => {
    if (!data.streaming || activeTab !== "brief") return;
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement | null;
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [data.content, data.streaming, activeTab]);

  // Reset to brief tab when client changes
  useEffect(() => {
    if (data.clientName !== prevClientRef.current) {
      setActiveTab("brief");
      prevClientRef.current = data.clientName;
    }
  }, [data.clientName]);

  const { content, streaming, clientName, kycFields } = data;
  const filledCount = kycFields.filter((f: any) => f.filled).length;
  const totalCount = kycFields.length;
  const kycScore =
    totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

  return (
    <div className="w-screen h-screen flex flex-col bg-background border border-border/50 rounded-lg overflow-hidden select-none">
      {/* Draggable header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 shrink-0 cursor-grab active:cursor-grabbing"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <CalendarIcon
            className="h-3.5 w-3.5 text-muted-foreground shrink-0"
            data-tauri-drag-region
          />
          <h3 className="font-semibold text-xs" data-tauri-drag-region>
            Pre-Meeting
            {clientName && (
              <span
                className="font-normal text-muted-foreground ml-1"
                data-tauri-drag-region
              >
                — {clientName}
              </span>
            )}
          </h3>
          {streaming && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => invoke("close_pre_meeting")}
          className="cursor-pointer h-6 w-6"
          title="Close"
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/50 bg-muted/10 shrink-0">
        {(["brief", "kyc"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "brief"
              ? "AI Brief"
              : `KYC${totalCount > 0 ? ` · ${kycScore}%` : ""}`}
          </button>
        ))}
      </div>

      <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0">
        <div className="p-4 select-text">
          {activeTab === "brief" && (
            <>
              {streaming && !content && (
                <div className="flex items-center gap-2 text-muted-foreground animate-pulse select-none">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Preparing brief...</span>
                </div>
              )}
              {!content && !streaming && (
                <p className="text-sm text-muted-foreground">
                  Select a client to generate a pre-meeting brief.
                </p>
              )}
              {content && (
                <Markdown isStreaming={streaming}>{content}</Markdown>
              )}
            </>
          )}
          {activeTab === "kyc" && (
            <KYCTab
              fields={kycFields}
              score={kycScore}
              filled={filledCount}
              total={totalCount}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
