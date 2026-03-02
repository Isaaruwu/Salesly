import { useEffect, useRef, useCallback } from "react";
import {
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components";
import {
  AlertCircleIcon,
  LoaderIcon,
  RadioIcon,
  XIcon,
} from "lucide-react";
import { PermissionFlow } from "../speech/PermissionFlow";
import {
  UseDualRecordingReturn,
  DiarizedSegment,
} from "@/hooks/useDualRecording";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts";
import { fetchAIResponse } from "@/lib/functions/ai-response.function";
import { getConversationById, saveConversation } from "@/lib";
import { invoke } from "@tauri-apps/api/core";

// ── Post-meeting summary prompt ────────────────────────────────────────────────
const POST_MEETING_SYSTEM_PROMPT = `You are a post-meeting debrief assistant for a wealth management advisor.
The advisor just finished a live client meeting. Produce a concise post-meeting summary in markdown.
Be brief and actionable — the advisor needs to act on this immediately.

Include exactly these sections (use ## headings):

## Meeting Summary
2–3 sentences: what was discussed, key themes, client sentiment.

## KYC Updates
Bullet list of any client information mentioned or updated. For each: field name, what was said, old → new value if clear.
If nothing was mentioned, write "None detected."

## Action Items
Numbered list of specific follow-ups the advisor must complete.
If none, write "None."

## Sales Opportunities
Any product discussions that came up. Note client interest level (mentioned / interested / wants to proceed).
If none, write "None raised."

## Compliance Notes
Any compliance or KYC items that need urgent attention.
If none, write "None."

## Follow-up Email Draft
A brief, professional email to send to the client. Natural tone. 3–5 sentences.
Include: thank them for their time, key action items the client should expect, next steps.

Be direct. No fluff. No disclaimers. No JSON.`;

function buildSummaryUserPrompt(
  transcript: DiarizedSegment[],
  clientName: string | null,
  conversationMessages: { role: string; content: string }[]
): string {
  const transcriptText = transcript
    .map((s) => `${s.speaker}: ${s.text}`)
    .join("\n");

  const aiAnalyses = conversationMessages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .join("\n\n---\n\n");

  return `CLIENT: ${clientName ?? "Unknown"}

FULL MEETING TRANSCRIPT:
${transcriptText || "(No transcript recorded)"}
${
  aiAnalyses
    ? `\nAI MEETING ANALYSES (processed during meeting):\n${aiAnalyses}`
    : ""
}

Generate the post-meeting debrief now.`;
}

// ── Component ──────────────────────────────────────────────────────────────────
export const DualRecording = (props: UseDualRecordingReturn) => {
  const {
    isRecording,
    transcript,
    isMicProcessing,
    isSysAudioProcessing,
    error,
    setupRequired,
    isPopoverOpen,
    setIsPopoverOpen,
    toggleRecording,
    handleSetup,
  } = props;

  const isProcessing = isMicProcessing || isSysAudioProcessing;

  // ── AI provider access ───────────────────────────────────────────────────
  const { allAiProviders, selectedAIProvider } = useApp();

  const aiRef = useRef({ allAiProviders, selectedAIProvider });
  useEffect(() => {
    aiRef.current = { allAiProviders, selectedAIProvider };
  }, [allAiProviders, selectedAIProvider]);

  // ── Summary state ────────────────────────────────────────────────────────
  const summaryAbortRef = useRef<AbortController | null>(null);

  const setSummaryStorage = (patch: {
    content?: string;
    streaming?: boolean;
    client?: string | null;
  }) => {
    if (patch.content !== undefined)
      localStorage.setItem("salesly_summary_content", patch.content);
    if (patch.streaming !== undefined)
      localStorage.setItem("salesly_summary_streaming", String(patch.streaming));
    if (patch.client !== undefined)
      localStorage.setItem("salesly_summary_client", patch.client ?? "");
  };

  // Stable transcript ref so generateMeetingSummary captures the latest value
  const transcriptRef = useRef<DiarizedSegment[]>([]);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // ── Persist summary to conversation DB ──────────────────────────────────
  const saveSummaryToHistory = async (
    clientId: string,
    summaryText: string,
    clientName: string | null
  ) => {
    const date = new Date().toISOString().slice(0, 10);
    const conversationId = `meeting_${clientId}_${date}`;
    const now = Date.now();

    const summaryMessage = {
      id: `summary-${now}`,
      role: "assistant" as const,
      content: summaryText,
      timestamp: now,
    };

    try {
      const existing = await getConversationById(conversationId);
      if (existing) {
        await saveConversation({
          ...existing,
          messages: [...existing.messages, summaryMessage],
          updatedAt: now,
        });
      } else {
        await saveConversation({
          id: conversationId,
          title: clientName ?? "Meeting",
          messages: [summaryMessage],
          createdAt: now,
          updatedAt: now,
        });
      }
      // Signal chats page to refresh
      localStorage.setItem("salesly_last_conversation_saved", String(now));
      window.dispatchEvent(new CustomEvent("conversationSaved"));
    } catch (err) {
      console.error("[DualRecording] Failed to save summary:", err);
    }
  };

  // ── Generate meeting summary ─────────────────────────────────────────────
  const generateMeetingSummary = useCallback(async () => {
    const { allAiProviders: providers, selectedAIProvider: selected } =
      aiRef.current;
    const provider = providers.find((p) => p.id === selected.provider);
    if (!provider || !selected.provider) return;

    const currentTranscript = transcriptRef.current;
    if (currentTranscript.length === 0) return;

    const clientName = localStorage.getItem("salesly_meeting_client_name");
    const clientId = localStorage.getItem("salesly_meeting_client_id");

    setSummaryStorage({ content: "", streaming: true, client: clientName });
    invoke("open_post_meeting_summary").catch(console.error);

    let conversationMessages: { role: string; content: string }[] = [];
    if (clientId) {
      try {
        const date = new Date().toISOString().slice(0, 10);
        const conversationId = `meeting_${clientId}_${date}`;
        const conv = await getConversationById(conversationId);
        conversationMessages = conv?.messages ?? [];
      } catch {
        // Non-fatal — proceed without prior analyses
      }
    }

    const controller = new AbortController();
    summaryAbortRef.current = controller;

    try {
      const userMessage = buildSummaryUserPrompt(
        currentTranscript,
        clientName,
        conversationMessages
      );

      let fullSummary = "";
      for await (const chunk of fetchAIResponse({
        provider,
        selectedProvider: selected,
        systemPrompt: POST_MEETING_SYSTEM_PROMPT,
        history: [],
        userMessage,
        imagesBase64: [],
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) break;
        fullSummary += chunk;
        setSummaryStorage({ content: fullSummary });
      }

      // Persist to DB after streaming completes (not aborted)
      if (fullSummary && !controller.signal.aborted && clientId) {
        await saveSummaryToHistory(clientId, fullSummary, clientName);
      }
    } catch {
      if (!controller.signal.aborted) {
        setSummaryStorage({
          content: "Failed to generate meeting summary. Check your AI provider settings.",
        });
      }
    } finally {
      if (summaryAbortRef.current === controller) {
        summaryAbortRef.current = null;
        setSummaryStorage({ streaming: false });
      }
    }
  }, []);

  // Trigger summary when recording stops (isRecording: true → false)
  const prevIsRecordingRef = useRef(false);
  useEffect(() => {
    if (prevIsRecordingRef.current && !isRecording) {
      generateMeetingSummary();
    }
    prevIsRecordingRef.current = isRecording;
  }, [isRecording, generateMeetingSummary]);

  // ── Button helpers ───────────────────────────────────────────────────────
  const getButtonIcon = () => {
    if (setupRequired) return <AlertCircleIcon className="text-orange-500" />;
    if (error) return <AlertCircleIcon className="text-red-500" />;
    if (isProcessing) return <LoaderIcon className="animate-spin" />;
    if (isRecording) return <RadioIcon className="text-red-500 animate-pulse" />;
    return <RadioIcon />;
  };

  const getButtonTitle = () => {
    if (setupRequired) return "Setup required — click for instructions";
    if (error) return `Error: ${error}`;
    if (isRecording) return "Stop meeting recording";
    return "Start meeting recording (mic + system audio)";
  };

  return (
    <div className="relative">
      {/* Recording status popover */}
      <Popover
        open={isPopoverOpen}
        onOpenChange={(open) => {
          if (isRecording && !open) return;
          setIsPopoverOpen(open);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            size="icon"
            title={getButtonTitle()}
            onClick={toggleRecording}
            className={cn(
              isRecording && "bg-red-50 hover:bg-red-100",
              error && "bg-red-100 hover:bg-red-200"
            )}
          >
            {getButtonIcon()}
          </Button>
        </PopoverTrigger>

        {(isRecording || setupRequired || !!error) && (
          <PopoverContent
            align="end"
            side="bottom"
            className="w-72 p-0 border shadow-lg overflow-hidden border-input/50"
            sideOffset={8}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
              {isRecording ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-semibold">Recording</span>
                </div>
              ) : setupRequired ? (
                <span className="text-xs font-semibold">Setup Required</span>
              ) : (
                <span className="text-xs font-semibold text-red-600">Error</span>
              )}

              {!isRecording && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => setIsPopoverOpen(false)}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="p-3 space-y-3">
              {error && !setupRequired && (
                <p className="text-[11px] text-red-600">{error}</p>
              )}

              {setupRequired && (
                <PermissionFlow
                  onPermissionGranted={handleSetup}
                  onPermissionDenied={() => {}}
                />
              )}
            </div>
          </PopoverContent>
        )}
      </Popover>

    </div>
  );
};
