import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileTextIcon, XIcon, Loader2 } from "lucide-react";
import { Button, ScrollArea, Markdown } from "@/components";

const KEYS = {
  content:    "salesly_summary_content",
  streaming:  "salesly_summary_streaming",
  client:     "salesly_summary_client",
};

function readFromStorage() {
  return {
    content:    localStorage.getItem(KEYS.content) ?? "",
    streaming:  localStorage.getItem(KEYS.streaming) === "true",
    clientName: localStorage.getItem(KEYS.client) ?? "",
  };
}

export default function PostMeetingSummaryWindow() {
  const [data, setData] = useState(readFromStorage);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key && Object.values(KEYS).includes(e.key)) {
        setData(readFromStorage());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Auto-scroll to bottom while summary is streaming
  useEffect(() => {
    if (!data.streaming) return;
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement | null;
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [data.content, data.streaming]);

  const { content, streaming, clientName } = data;

  return (
    <div className="w-screen h-screen flex flex-col bg-background border border-border/50 rounded-lg overflow-hidden select-none">
      {/* Draggable header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 shrink-0 cursor-grab active:cursor-grabbing"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <FileTextIcon
            className="h-3.5 w-3.5 text-muted-foreground shrink-0"
            data-tauri-drag-region
          />
          <h3 className="font-semibold text-xs" data-tauri-drag-region>
            Meeting Summary
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
          onClick={() => invoke("close_post_meeting_summary")}
          className="cursor-pointer h-6 w-6"
          title="Close"
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0">
        <div className="p-4 select-text">
          {streaming && !content && (
            <div className="flex items-center gap-2 text-muted-foreground animate-pulse select-none">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Generating summary...</span>
            </div>
          )}
          {content && (
            <Markdown isStreaming={streaming}>{content}</Markdown>
          )}
          {!content && !streaming && (
            <p className="text-sm text-muted-foreground">
              No summary available yet.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
