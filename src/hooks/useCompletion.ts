import { useState, useCallback, useRef, useEffect } from "react";
import { useWindowResize } from "./useWindow";
import { useGlobalShortcuts } from "@/hooks";
import { MAX_FILES } from "@/config";
import { useApp } from "@/contexts";
import {
  fetchAIResponse,
  saveConversation,
  getConversationById,
  generateConversationTitle,
  MESSAGE_ID_OFFSET,
  generateConversationId,
  generateMessageId,
  generateRequestId,
  getResponseSettings,
} from "@/lib";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  PendingKYCUpdate,
  ComplianceFlag,
  SalesPrompt,
} from "@/pages/app/components/completion/KYCDiffPanel";

// Formats extracted meeting JSON into human-readable markdown for DB storage.
function formatMeetingAnalysisForHistory(parsed: any): string {
  const parts: string[] = [];

  const updates: any[] = parsed.kyc_updates ?? [];
  const flags: any[] = parsed.compliance_flags ?? [];
  const sales: any[] = parsed.sales_prompts ?? [];

  if (updates.length > 0) {
    parts.push(`## KYC Updates (${updates.length})`);
    for (const u of updates) {
      const label = u.label ?? u.field ?? "Unknown field";
      const oldVal = u.old_value != null ? JSON.stringify(u.old_value) : "—";
      const newVal = u.new_value != null ? JSON.stringify(u.new_value) : "—";
      const pct = u.confidence != null ? `${Math.round(u.confidence * 100)}%` : null;
      parts.push(
        `\n**${label}** (\`${u.field}\`)` +
        `\n${oldVal} → ${newVal}` +
        (pct ? `\nConfidence: ${pct}` : "") +
        (u.transcript_quote ? `\n> "${u.transcript_quote}"` : "")
      );
    }
  }

  if (flags.length > 0) {
    parts.push(`\n## Compliance Flags (${flags.length})`);
    for (const f of flags) {
      const sev = (f.severity ?? "info").toUpperCase();
      parts.push(
        `\n**[${sev}]** ${f.issue}` +
        (f.action ? `\nAction: ${f.action}` : "")
      );
    }
  }

  if (sales.length > 0) {
    parts.push(`\n## Sales Opportunities (${sales.length})`);
    for (const s of sales) {
      const name = s.product_name ?? s.product_id ?? "Unknown product";
      parts.push(
        `\n**${name}** (${s.urgency ?? "unknown"})` +
        (s.trigger_reason ? `\n${s.trigger_reason}` : "") +
        (s.suggested_pivot ? `\n> "${s.suggested_pivot}"` : "")
      );
    }
  }

  return parts.length > 0 ? parts.join("\n") : "No updates detected.";
}

// Tries to extract a structured meeting analysis JSON from a raw AI response.
// Handles direct JSON, markdown-fenced JSON, and JSON embedded in prose.
function extractMeetingJSON(raw: string): any | null {
  const strategies = [
    () => JSON.parse(raw.trim()),
    () => {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) return JSON.parse(m[1].trim());
      throw new Error("no fence");
    },
    () => {
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s === -1 || e <= s) throw new Error("no braces");
      return JSON.parse(raw.slice(s, e + 1));
    },
  ];
  for (const fn of strategies) {
    try {
      const obj = fn();
      if (
        obj &&
        typeof obj === "object" &&
        !Array.isArray(obj) &&
        (Array.isArray(obj.kyc_updates) ||
          Array.isArray(obj.compliance_flags) ||
          Array.isArray(obj.sales_prompts))
      ) {
        return obj;
      }
    } catch {
      // try next strategy
    }
  }
  return null;
}

export type { PendingKYCUpdate, ComplianceFlag, SalesPrompt };

const RECORDING_KEYS = {
  kycUpdates: "salesly_recording_kyc_updates",
  complianceFlags: "salesly_recording_compliance_flags",
  salesPrompts: "salesly_recording_sales_prompts",
  isLoading: "salesly_recording_is_loading",
  isAnalysing: "salesly_recording_is_analysing",
  isActive: "salesly_recording_is_active",
  response: "salesly_recording_response",
  error: "salesly_recording_error",
  action: "salesly_recording_action",
} as const;

// Types for completion
interface AttachedFile {
  id: string;
  name: string;
  type: string;
  base64: string;
  size: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface CompletionState {
  input: string;
  response: string;
  isLoading: boolean;
  error: string | null;
  attachedFiles: AttachedFile[];
  currentConversationId: string | null;
  conversationHistory: ChatMessage[];
}

export const useCompletion = () => {
  const {
    selectedAIProvider,
    allAiProviders,
    systemPrompt,
    screenshotConfiguration,
    setScreenshotConfiguration,
  } = useApp();
  const globalShortcuts = useGlobalShortcuts();

  const [state, setState] = useState<CompletionState>({
    input: "",
    response: "",
    isLoading: false,
    error: null,
    attachedFiles: [],
    currentConversationId: null,
    conversationHistory: [],
  });
  const [micOpen, setMicOpen] = useState(false);
  const [enableVAD, setEnableVAD] = useState(false);
  const [messageHistoryOpen, setMessageHistoryOpen] = useState(false);
  const [isFilesPopoverOpen, setIsFilesPopoverOpen] = useState(false);
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false);
  const [keepEngaged, setKeepEngaged] = useState(false);
  const [pendingKYCUpdates, setPendingKYCUpdates] = useState<PendingKYCUpdate[]>([]);
  const [pendingComplianceFlags, setPendingComplianceFlags] = useState<ComplianceFlag[]>([]);
  const [pendingSalesPrompts, setPendingSalesPrompts] = useState<SalesPrompt[]>([]);
  const [isMeetingAnalysing, setIsMeetingAnalysing] = useState(false);
  const [isMeetingActive, setIsMeetingActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isProcessingScreenshotRef = useRef(false);
  const screenshotConfigRef = useRef(screenshotConfiguration);
  const hasCheckedPermissionRef = useRef(false);
  const screenshotInitiatedByThisContext = useRef(false);
  const { resizeWindow } = useWindowResize();

  useEffect(() => {
    screenshotConfigRef.current = screenshotConfiguration;
  }, [screenshotConfiguration]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const meetingAbortControllerRef = useRef<AbortController | null>(null);
  const meetingTranscriptQueueRef = useRef<string[]>([]);
  const isMeetingQueueProcessingRef = useRef(false);

  const setInput = useCallback((value: string) => {
    setState((prev) => ({ ...prev, input: value }));
  }, []);

  const setResponse = useCallback((value: string) => {
    setState((prev) => ({ ...prev, response: value }));
  }, []);

  const addFile = useCallback(async (file: File) => {
    try {
      const base64 = await fileToBase64(file);
      const attachedFile: AttachedFile = {
        id: Date.now().toString(),
        name: file.name,
        type: file.type,
        base64,
        size: file.size,
      };

      setState((prev) => ({
        ...prev,
        attachedFiles: [...prev.attachedFiles, attachedFile],
      }));
    } catch (error) {
      console.error("Failed to process file:", error);
    }
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setState((prev) => ({
      ...prev,
      attachedFiles: prev.attachedFiles.filter((f) => f.id !== fileId),
    }));
  }, []);

  const clearFiles = useCallback(() => {
    setState((prev) => ({ ...prev, attachedFiles: [] }));
  }, []);

  const clearPendingKYC = useCallback(() => {
    setPendingKYCUpdates([]);
    setPendingComplianceFlags([]);
  }, []);

  const clearPendingSalesPrompts = useCallback(() => {
    setPendingSalesPrompts([]);
  }, []);

  const submit = useCallback(
    async (speechText?: string) => {
      const input = speechText || state.input;

      if (!input.trim()) {
        return;
      }

      if (speechText) {
        setState((prev) => ({
          ...prev,
          input: speechText,
        }));
      }

      // Generate unique request ID
      const requestId = generateRequestId();
      currentRequestIdRef.current = requestId;

      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        // Prepare message history for the AI
        const messageHistory = state.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        // Handle image attachments
        const imagesBase64: string[] = [];
        if (state.attachedFiles.length > 0) {
          state.attachedFiles.forEach((file) => {
            if (file.type.startsWith("image/")) {
              imagesBase64.push(file.base64);
            }
          });
        }

        let fullResponse = "";

        // Check if AI provider is configured
        if (!selectedAIProvider.provider) {
          setState((prev) => ({
            ...prev,
            error: "Please select an AI provider in settings",
          }));
          return;
        }

        const provider = allAiProviders.find(
          (p) => p.id === selectedAIProvider.provider
        );
        if (!provider) {
          setState((prev) => ({
            ...prev,
            error: "Invalid provider selected",
          }));
          return;
        }

        // Clear previous response and set loading state
        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
          response: "",
        }));

        try {
          // Use the fetchAIResponse function with signal
          for await (const chunk of fetchAIResponse({
            provider,
            selectedProvider: selectedAIProvider,
            systemPrompt: systemPrompt || undefined,
            history: messageHistory,
            userMessage: input,
            imagesBase64,
            signal,
          })) {
            // Only update if this is still the current request
            if (currentRequestIdRef.current !== requestId) {
              return; // Request was superseded, stop processing
            }

            // Check if request was aborted
            if (signal.aborted) {
              return; // Request was cancelled, stop processing
            }

            fullResponse += chunk;
            setState((prev) => ({
              ...prev,
              response: prev.response + chunk,
            }));
          }
        } catch (e: any) {
          // Only show error if this is still the current request and not aborted
          if (currentRequestIdRef.current === requestId && !signal.aborted) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: e.message || "An error occurred",
            }));
          }
          return;
        }

        // Only proceed if this is still the current request
        if (currentRequestIdRef.current !== requestId || signal.aborted) {
          return;
        }

        let displayResponse = fullResponse;
        const parsed = extractMeetingJSON(fullResponse);
        if (parsed) {
            const updates: PendingKYCUpdate[] = (
              parsed.kyc_updates || []
            ).map((u: any, i: number) => ({
              id: `pending_${Date.now()}_${i}`,
              field: u.field ?? "",
              label: u.label ?? u.field ?? "Unknown field",
              oldValue: u.old_value ?? null,
              newValue: u.new_value ?? null,
              confidence: u.confidence ?? 1.0,
              transcriptQuote: u.transcript_quote ?? "",
            }));
            const flags: ComplianceFlag[] = (
              parsed.compliance_flags || []
            ).map((f: any) => ({
              issue: f.issue ?? "",
              severity: (f.severity ?? "info") as ComplianceFlag["severity"],
              action: f.action ?? "",
            }));
            const sales: SalesPrompt[] = (parsed.sales_prompts || []).map(
              (s: any, i: number) => ({
                id: `sales_${Date.now()}_${i}`,
                productId: s.product_id ?? "",
                productName: s.product_name ?? s.product_id ?? "Unknown product",
                triggerReason: s.trigger_reason ?? "",
                urgency: (s.urgency ?? "medium") as SalesPrompt["urgency"],
                suggestedPivot: s.suggested_pivot ?? "",
              })
            );
            if (updates.length > 0) {
              setPendingKYCUpdates((prev) => [...prev, ...updates]);
            }
            if (flags.length > 0) {
              setPendingComplianceFlags(flags);
            }
            if (sales.length > 0) {
              setPendingSalesPrompts((prev) => [...prev, ...sales]);
            }
            // Build a readable summary for DB history; keep UI response empty
            displayResponse = formatMeetingAnalysisForHistory(parsed);
            setState((prev) => ({ ...prev, response: "" }));
        }

        setState((prev) => ({ ...prev, isLoading: false }));

        // Focus input after AI response is complete
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);

        if (fullResponse && displayResponse) {
          await saveCurrentConversation(
            input,
            displayResponse,
            state.attachedFiles
          );
          // Clear input and attached files after saving
          setState((prev) => ({
            ...prev,
            input: "",
            attachedFiles: [],
          }));
        }
      } catch (error) {
        // Only show error if not aborted
        if (!signal?.aborted && currentRequestIdRef.current === requestId) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "An error occurred",
            isLoading: false,
          }));
        }
      }
    },
    [
      state.input,
      state.attachedFiles,
      selectedAIProvider,
      allAiProviders,
      systemPrompt,
      state.conversationHistory,
    ]
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    currentRequestIdRef.current = null;
    setState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  const reset = useCallback(() => {
    // Don't reset if keep engaged mode is active
    if (keepEngaged) {
      return;
    }
    cancel();
    setPendingKYCUpdates([]);
    setPendingComplianceFlags([]);
    setPendingSalesPrompts([]);
    setState((prev) => ({
      ...prev,
      input: "",
      response: "",
      error: null,
      attachedFiles: [],
    }));
  }, [cancel, keepEngaged]);

  // Helper function to convert file to base64
  const fileToBase64 = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string)?.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
    });
  }, []);

  // Note: saveConversation, getConversationById, and generateConversationTitle
  // are now imported from lib/database/chat-history.action.ts

  const loadConversation = useCallback((conversation: ChatConversation) => {
    setState((prev) => ({
      ...prev,
      currentConversationId: conversation.id,
      conversationHistory: conversation.messages,
      input: "",
      response: "",
      error: null,
      isLoading: false,
    }));
  }, []);

  const startNewConversation = useCallback(() => {
    setPendingKYCUpdates([]);
    setPendingComplianceFlags([]);
    setPendingSalesPrompts([]);
    setState((prev) => ({
      ...prev,
      currentConversationId: null,
      conversationHistory: [],
      input: "",
      response: "",
      error: null,
      isLoading: false,
      attachedFiles: [],
    }));
  }, []);

  const saveCurrentConversation = useCallback(
    async (
      userMessage: string,
      assistantResponse: string,
      _attachedFiles: AttachedFile[]
    ) => {
      // Validate inputs
      if (!userMessage || !assistantResponse) {
        console.error("Cannot save conversation: missing message content");
        return;
      }

      const conversationId =
        state.currentConversationId || generateConversationId("chat");
      const timestamp = Date.now();

      const userMsg: ChatMessage = {
        id: generateMessageId("user", timestamp),
        role: "user",
        content: userMessage,
        timestamp,
      };

      const assistantMsg: ChatMessage = {
        id: generateMessageId("assistant", timestamp + MESSAGE_ID_OFFSET),
        role: "assistant",
        content: assistantResponse,
        timestamp: timestamp + MESSAGE_ID_OFFSET,
      };

      const newMessages = [...state.conversationHistory, userMsg, assistantMsg];

      // Get existing conversation if updating
      let existingConversation = null;
      if (state.currentConversationId) {
        try {
          existingConversation = await getConversationById(
            state.currentConversationId
          );
        } catch (error) {
          console.error("Failed to get existing conversation:", error);
        }
      }

      const meetingClientName = localStorage.getItem("salesly_meeting_client_name");
      const title =
        existingConversation?.title ||
        (state.conversationHistory.length === 0 && meetingClientName
          ? meetingClientName
          : generateConversationTitle(userMessage));

      const conversation: ChatConversation = {
        id: conversationId,
        title,
        messages: newMessages,
        createdAt: existingConversation?.createdAt || timestamp,
        updatedAt: timestamp,
      };

      try {
        await saveConversation(conversation);

        setState((prev) => ({
          ...prev,
          currentConversationId: conversationId,
          conversationHistory: newMessages,
        }));

        // Notify the chats page to refresh — works both same-window and cross-window
        localStorage.setItem("salesly_last_conversation_saved", String(Date.now()));
        window.dispatchEvent(new CustomEvent("conversationSaved"));
      } catch (error) {
        console.error("Failed to save conversation:", error);
        // Show error to user
        setState((prev) => ({
          ...prev,
          error: "Failed to save conversation. Please try again.",
        }));
      }
    },
    [state.currentConversationId, state.conversationHistory]
  );

  // Listen for conversation events from the main ChatHistory component
  useEffect(() => {
    const handleConversationSelected = async (event: any) => {
      console.log(event, "event");
      // Only the conversation ID is passed through the event
      const { id } = event.detail;
      console.log(id, "id");
      if (!id || typeof id !== "string") {
        console.error("No conversation ID provided");
        setState((prev) => ({
          ...prev,
          error: "Invalid conversation selected",
        }));
        return;
      }
      console.log(id, "id");
      try {
        // Fetch the full conversation from SQLite
        const conversation = await getConversationById(id);

        if (conversation) {
          loadConversation(conversation);
        } else {
          console.error(`Conversation ${id} not found in database`);
          setState((prev) => ({
            ...prev,
            error: "Conversation not found. It may have been deleted.",
          }));
        }
      } catch (error) {
        console.error("Failed to load conversation:", error);
        setState((prev) => ({
          ...prev,
          error: "Failed to load conversation. Please try again.",
        }));
      }
    };

    const handleNewConversation = () => {
      startNewConversation();
    };

    const handleConversationDeleted = (event: any) => {
      const deletedId = event.detail;
      // If the currently active conversation was deleted, start a new one
      if (state.currentConversationId === deletedId) {
        startNewConversation();
      }
    };

    const handleMeetingStarted = async (event: any) => {
      const { conversationId } = event.detail ?? {};
      if (!conversationId) return;
      setIsMeetingActive(true);
      try {
        const existing = await getConversationById(conversationId);
        setState((prev) => ({
          ...prev,
          currentConversationId: conversationId,
          conversationHistory: existing?.messages ?? [],
        }));
      } catch {
        setState((prev) => ({
          ...prev,
          currentConversationId: conversationId,
          conversationHistory: [],
        }));
      }
    };

    const handleMeetingStopped = () => {
      setIsMeetingActive(false);
    };

    const handleStorageChange = async (e: StorageEvent) => {
      if (e.key === "salesly-conversation-selected" && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          const { id } = data;
          if (id && typeof id === "string") {
            const conversation = await getConversationById(id);
            if (conversation) {
              loadConversation(conversation);
            }
          }
        } catch (error) {
          console.error("Failed to parse conversation selection:", error);
        }
      }
    };

    window.addEventListener("conversationSelected", handleConversationSelected);
    window.addEventListener("newConversation", handleNewConversation);
    window.addEventListener("conversationDeleted", handleConversationDeleted);
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("meetingStarted", handleMeetingStarted);
    window.addEventListener("meetingStopped", handleMeetingStopped);

    return () => {
      window.removeEventListener(
        "conversationSelected",
        handleConversationSelected
      );
      window.removeEventListener("newConversation", handleNewConversation);
      window.removeEventListener(
        "conversationDeleted",
        handleConversationDeleted
      );
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("meetingStarted", handleMeetingStarted);
      window.removeEventListener("meetingStopped", handleMeetingStopped);
    };
  }, [loadConversation, startNewConversation, state.currentConversationId]);

  // Background meeting transcript processor — runs silently, never touches UI state.
  const submitMeetingTranscript = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const provider = allAiProviders.find(
      (p) => p.id === selectedAIProvider.provider
    );
    if (!selectedAIProvider.provider || !provider) return;

    const controller = new AbortController();
    meetingAbortControllerRef.current = controller;
    const signal = controller.signal;

    setIsMeetingAnalysing(true);
    try {
      let fullResponse = "";
      for await (const chunk of fetchAIResponse({
        provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: systemPrompt || undefined,
        history: [],
        userMessage: text,
        imagesBase64: [],
        signal,
      })) {
        if (signal.aborted) return;
        fullResponse += chunk;
      }

      if (signal.aborted) return;

      const parsed = extractMeetingJSON(fullResponse);
      if (parsed) {
        const updates: PendingKYCUpdate[] = (parsed.kyc_updates || []).map(
          (u: any, i: number) => ({
            id: `pending_${Date.now()}_${i}`,
            field: u.field ?? "",
            label: u.label ?? u.field ?? "Unknown field",
            oldValue: u.old_value ?? null,
            newValue: u.new_value ?? null,
            confidence: u.confidence ?? 1.0,
            transcriptQuote: u.transcript_quote ?? "",
          })
        );
        const flags: ComplianceFlag[] = (parsed.compliance_flags || []).map(
          (f: any) => ({
            issue: f.issue ?? "",
            severity: (f.severity ?? "info") as ComplianceFlag["severity"],
            action: f.action ?? "",
          })
        );
        const sales: SalesPrompt[] = (parsed.sales_prompts || []).map(
          (s: any, i: number) => ({
            id: `sales_${Date.now()}_${i}`,
            productId: s.product_id ?? "",
            productName: s.product_name ?? s.product_id ?? "Unknown product",
            triggerReason: s.trigger_reason ?? "",
            urgency: (s.urgency ?? "medium") as SalesPrompt["urgency"],
            suggestedPivot: s.suggested_pivot ?? "",
          })
        );
        if (updates.length > 0) {
          setPendingKYCUpdates((prev) => [...prev, ...updates]);
        }
        if (flags.length > 0) {
          setPendingComplianceFlags(flags);
        }
        if (sales.length > 0) {
          setPendingSalesPrompts((prev) => [...prev, ...sales]);
        }

        // Save a readable record of proposed changes to conversation history
        const historyEntry = formatMeetingAnalysisForHistory(parsed);
        await saveCurrentConversation(text, historyEntry, []).catch(() => {});
      } else if (fullResponse.trim()) {
        // AI returned something but it wasn't parseable meeting JSON — save raw
        await saveCurrentConversation(text, fullResponse, []).catch(() => {});
      }
    } catch (e) {
      if (!signal.aborted) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error("[Meeting transcript] AI error:", errMsg);
        // Save the error so it appears in history rather than silently disappearing
        await saveCurrentConversation(
          text,
          `⚠ Meeting analysis failed: ${errMsg}`,
          []
        ).catch(() => {});
      }
    } finally {
      if (meetingAbortControllerRef.current === controller) {
        meetingAbortControllerRef.current = null;
      }
      setIsMeetingAnalysing(false);
    }
  }, [selectedAIProvider, allAiProviders, systemPrompt, saveCurrentConversation]);

  const submitMeetingTranscriptRef = useRef(submitMeetingTranscript);
  useEffect(() => {
    submitMeetingTranscriptRef.current = submitMeetingTranscript;
  }, [submitMeetingTranscript]);

  const processMeetingTranscriptQueue = useCallback(async () => {
    if (isMeetingQueueProcessingRef.current) return;
    isMeetingQueueProcessingRef.current = true;

    try {
      while (meetingTranscriptQueueRef.current.length > 0) {
        const nextChunk = meetingTranscriptQueueRef.current.shift();
        if (!nextChunk?.trim()) continue;
        await submitMeetingTranscriptRef.current(nextChunk);
      }
    } finally {
      isMeetingQueueProcessingRef.current = false;
    }
  }, []);

  const enqueueMeetingTranscript = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      meetingTranscriptQueueRef.current.push(text);
      void processMeetingTranscriptQueue();
    },
    [processMeetingTranscriptQueue]
  );

  useEffect(() => {
    const handleMeetingTranscript = (event: Event) => {
      const text = (event as CustomEvent<{ text: string }>).detail?.text;
      if (text?.trim()) {
        enqueueMeetingTranscript(text);
      }
    };
    window.addEventListener("meetingTranscript", handleMeetingTranscript);
    return () =>
      window.removeEventListener("meetingTranscript", handleMeetingTranscript);
  }, [enqueueMeetingTranscript]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX_FILES = 6;

    files.forEach((file) => {
      if (
        file.type.startsWith("image/") &&
        state.attachedFiles.length < MAX_FILES
      ) {
        addFile(file);
      }
    });

    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleScreenshotSubmit = useCallback(
    async (base64: string, prompt?: string) => {
      if (state.attachedFiles.length >= MAX_FILES) {
        setState((prev) => ({
          ...prev,
          error: `You can only upload ${MAX_FILES} files`,
        }));
        return;
      }

      try {
        if (prompt) {
          // Auto mode: Submit directly to AI with screenshot
          const attachedFile: AttachedFile = {
            id: Date.now().toString(),
            name: `screenshot_${Date.now()}.png`,
            type: "image/png",
            base64: base64,
            size: base64.length,
          };

          // Generate unique request ID
          const requestId = generateRequestId();
          currentRequestIdRef.current = requestId;

          // Cancel any existing request
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }

          abortControllerRef.current = new AbortController();
          const signal = abortControllerRef.current.signal;

          try {
            // Prepare message history for the AI
            const messageHistory = state.conversationHistory.map((msg) => ({
              role: msg.role,
              content: msg.content,
            }));

            let fullResponse = "";

            // Check if AI provider is configured
            if (!selectedAIProvider.provider) {
              setState((prev) => ({
                ...prev,
                error: "Please select an AI provider in settings",
              }));
              return;
            }

            const provider = allAiProviders.find(
              (p) => p.id === selectedAIProvider.provider
            );
            if (!provider) {
              setState((prev) => ({
                ...prev,
                error: "Invalid provider selected",
              }));
              return;
            }

            // Clear previous response and set loading state
            setState((prev) => ({
              ...prev,
              input: prompt,
              isLoading: true,
              error: null,
              response: "",
            }));

            // Use the fetchAIResponse function with image and signal
            for await (const chunk of fetchAIResponse({
              provider,
              selectedProvider: selectedAIProvider,
              systemPrompt: systemPrompt || undefined,
              history: messageHistory,
              userMessage: prompt,
              imagesBase64: [base64],
              signal,
            })) {
              // Only update if this is still the current request
              if (currentRequestIdRef.current !== requestId || signal.aborted) {
                return; // Request was superseded or cancelled
              }

              fullResponse += chunk;
              setState((prev) => ({
                ...prev,
                response: prev.response + chunk,
              }));
            }

            // Only proceed if this is still the current request
            if (currentRequestIdRef.current !== requestId || signal.aborted) {
              return;
            }

            setState((prev) => ({ ...prev, isLoading: false }));

            // Focus input after screenshot AI response is complete
            setTimeout(() => {
              inputRef.current?.focus();
            }, 100);

            // Save the conversation after successful completion
            if (fullResponse) {
              await saveCurrentConversation(prompt, fullResponse, [
                attachedFile,
              ]);
              // Clear input after saving
              setState((prev) => ({
                ...prev,
                input: "",
              }));
            }
          } catch (e: any) {
            // Only show error if this is still the current request and not aborted
            if (currentRequestIdRef.current === requestId && !signal.aborted) {
              setState((prev) => ({
                ...prev,
                error: e.message || "An error occurred",
              }));
            }
          } finally {
            // Only update loading state if this is still the current request
            if (currentRequestIdRef.current === requestId && !signal.aborted) {
              setState((prev) => ({ ...prev, isLoading: false }));
            }
          }
        } else {
          // Manual mode: Add to attached files
          const attachedFile: AttachedFile = {
            id: Date.now().toString(),
            name: `screenshot_${Date.now()}.png`,
            type: "image/png",
            base64: base64,
            size: base64.length,
          };

          setState((prev) => ({
            ...prev,
            attachedFiles: [...prev.attachedFiles, attachedFile],
          }));
        }
      } catch (error) {
        console.error("Failed to process screenshot:", error);
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "An error occurred processing screenshot",
          isLoading: false,
        }));
      }
    },
    [
      state.attachedFiles.length,
      state.conversationHistory,
      selectedAIProvider,
      allAiProviders,
      systemPrompt,
      saveCurrentConversation,
      inputRef,
    ]
  );

  const onRemoveAllFiles = () => {
    clearFiles();
    setIsFilesPopoverOpen(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!state.isLoading && state.input.trim()) {
        submit();
      }
    }
  };

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      // Check if clipboard contains images
      const items = e.clipboardData?.items;
      if (!items) return;

      const hasImages = Array.from(items).some((item) =>
        item.type.startsWith("image/")
      );

      // If we have images, prevent default text pasting and process images
      if (hasImages) {
        e.preventDefault();

        const processedFiles: File[] = [];

        Array.from(items).forEach((item) => {
          if (
            item.type.startsWith("image/") &&
            state.attachedFiles.length + processedFiles.length < MAX_FILES
          ) {
            const file = item.getAsFile();
            if (file) {
              processedFiles.push(file);
            }
          }
        });

        // Process all files
        await Promise.all(processedFiles.map((file) => addFile(file)));
      }
    },
    [state.attachedFiles.length, addFile]
  );

  const isPopoverOpen =
    state.isLoading ||
    state.response !== "" ||
    state.error !== null ||
    keepEngaged ||
    isMeetingAnalysing ||
    isMeetingActive ||
    pendingKYCUpdates.length > 0 ||
    pendingComplianceFlags.length > 0 ||
    pendingSalesPrompts.length > 0;

  // ── Sync recording state to localStorage for the recording window ──────────
  useEffect(() => {
    localStorage.setItem(RECORDING_KEYS.kycUpdates, JSON.stringify(pendingKYCUpdates));
  }, [pendingKYCUpdates]);

  useEffect(() => {
    localStorage.setItem(RECORDING_KEYS.complianceFlags, JSON.stringify(pendingComplianceFlags));
  }, [pendingComplianceFlags]);

  useEffect(() => {
    localStorage.setItem(RECORDING_KEYS.salesPrompts, JSON.stringify(pendingSalesPrompts));
  }, [pendingSalesPrompts]);

  useEffect(() => {
    localStorage.setItem(RECORDING_KEYS.isLoading, String(state.isLoading));
  }, [state.isLoading]);

  useEffect(() => {
    localStorage.setItem(RECORDING_KEYS.isAnalysing, String(isMeetingAnalysing));
  }, [isMeetingAnalysing]);

  useEffect(() => {
    localStorage.setItem(RECORDING_KEYS.isActive, String(isMeetingActive));
  }, [isMeetingActive]);

  useEffect(() => {
    localStorage.setItem(RECORDING_KEYS.response, state.response);
  }, [state.response]);

  useEffect(() => {
    localStorage.setItem(RECORDING_KEYS.error, state.error ?? "");
  }, [state.error]);

  // Open recording window when popover becomes active
  const prevIsPopoverOpenRef = useRef(false);
  useEffect(() => {
    if (isPopoverOpen && !prevIsPopoverOpenRef.current) {
      invoke("open_recording").catch(console.error);
    }
    prevIsPopoverOpenRef.current = isPopoverOpen;
  }, [isPopoverOpen]);

  // Listen for actions from the recording window
  useEffect(() => {
    const handleRecordingAction = (e: StorageEvent) => {
      if (e.key !== RECORDING_KEYS.action || !e.newValue) return;
      const action = e.newValue.split(":")[0];
      if (action === "clear_kyc") {
        clearPendingKYC();
      } else if (action === "clear_sales") {
        clearPendingSalesPrompts();
      } else if (action === "reset") {
        clearPendingKYC();
        clearPendingSalesPrompts();
        reset();
      } else if (action === "cancel") {
        cancel();
      }
    };
    window.addEventListener("storage", handleRecordingAction);
    return () => window.removeEventListener("storage", handleRecordingAction);
  }, [clearPendingKYC, clearPendingSalesPrompts, reset, cancel]);

  useEffect(() => {
    resizeWindow(micOpen || messageHistoryOpen || isFilesPopoverOpen);
  }, [
    micOpen,
    messageHistoryOpen,
    resizeWindow,
    isFilesPopoverOpen,
  ]);

  // Auto scroll to bottom when response updates
  useEffect(() => {
    const responseSettings = getResponseSettings();
    if (
      !keepEngaged &&
      state.response &&
      scrollAreaRef.current &&
      responseSettings.autoScroll
    ) {
      const scrollElement = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollElement) {
        scrollElement.scrollTo({
          top: scrollElement.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [state.response, keepEngaged]);

  // Keyboard arrow key support for scrolling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPopoverOpen) return;

      const activeScrollRef = scrollAreaRef.current || scrollAreaRef.current;
      const scrollElement = activeScrollRef?.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement;

      if (!scrollElement) return;

      const scrollAmount = 100; // pixels to scroll

      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollElement.scrollBy({ top: scrollAmount, behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollElement.scrollBy({ top: -scrollAmount, behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPopoverOpen, scrollAreaRef]);

  // Keyboard shortcut for toggling keep engaged mode (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleToggleShortcut = (e: KeyboardEvent) => {
      // Only trigger when popover is open
      if (!isPopoverOpen) return;

      // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setKeepEngaged((prev) => !prev);
        // Focus the input after toggle (with delay to ensure DOM is ready)
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    };

    window.addEventListener("keydown", handleToggleShortcut);
    return () => window.removeEventListener("keydown", handleToggleShortcut);
  }, [isPopoverOpen]);

  const captureScreenshot = useCallback(async () => {
    if (!handleScreenshotSubmit) return;

    const config = screenshotConfigRef.current;
    screenshotInitiatedByThisContext.current = true;
    setIsScreenshotLoading(true);

    try {
      // Check screen recording permission on macOS
      const platform = navigator.platform.toLowerCase();
      if (platform.includes("mac") && !hasCheckedPermissionRef.current) {
        const {
          checkScreenRecordingPermission,
          requestScreenRecordingPermission,
        } = await import("tauri-plugin-macos-permissions-api");

        const hasPermission = await checkScreenRecordingPermission();

        if (!hasPermission) {
          // Request permission
          await requestScreenRecordingPermission();

          // Wait a moment and check again
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const hasPermissionNow = await checkScreenRecordingPermission();

          if (!hasPermissionNow) {
            setState((prev) => ({
              ...prev,
              error:
                "Screen Recording permission required. Please enable it by going to System Settings > Privacy & Security > Screen & System Audio Recording. If you don't see Salesly in the list, click the '+' button to add it. If it's already listed, make sure it's enabled. Then restart the app.",
            }));
            setIsScreenshotLoading(false);
            screenshotInitiatedByThisContext.current = false;
            return;
          }
        }
        hasCheckedPermissionRef.current = true;
      }

      if (config.enabled) {
        const base64 = await invoke("capture_to_base64");

        if (config.mode === "auto") {
          // Auto mode: Submit directly to AI with the configured prompt
          await handleScreenshotSubmit(base64 as string, config.autoPrompt);
        } else if (config.mode === "manual") {
          // Manual mode: Add to attached files without prompt
          await handleScreenshotSubmit(base64 as string);
        }
        screenshotInitiatedByThisContext.current = false;
      } else {
        // Selection Mode: Open overlay to select an area
        isProcessingScreenshotRef.current = false;
        await invoke("start_screen_capture");
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: "Failed to capture screenshot. Please try again.",
      }));
      isProcessingScreenshotRef.current = false;
      screenshotInitiatedByThisContext.current = false;
    } finally {
      if (config.enabled) {
        setIsScreenshotLoading(false);
      }
    }
  }, [handleScreenshotSubmit]);

  useEffect(() => {
    let unlisten: any;

    const setupListener = async () => {
      unlisten = await listen("captured-selection", async (event: any) => {
        if (!screenshotInitiatedByThisContext.current) {
          return;
        }

        if (isProcessingScreenshotRef.current) {
          return;
        }

        isProcessingScreenshotRef.current = true;
        const base64 = event.payload;
        const config = screenshotConfigRef.current;

        try {
          if (config.mode === "auto") {
            // Auto mode: Submit directly to AI with the configured prompt
            await handleScreenshotSubmit(base64 as string, config.autoPrompt);
          } else if (config.mode === "manual") {
            // Manual mode: Add to attached files without prompt
            await handleScreenshotSubmit(base64 as string);
          }
        } catch (error) {
          console.error("Error processing selection:", error);
        } finally {
          setIsScreenshotLoading(false);
          screenshotInitiatedByThisContext.current = false;
          setTimeout(() => {
            isProcessingScreenshotRef.current = false;
          }, 100);
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleScreenshotSubmit]);

  useEffect(() => {
    const unlisten = listen("capture-closed", () => {
      setIsScreenshotLoading(false);
      isProcessingScreenshotRef.current = false;
      screenshotInitiatedByThisContext.current = false;
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const toggleRecording = useCallback(() => {
    setEnableVAD(!enableVAD);
    setMicOpen(!micOpen);
  }, [enableVAD, micOpen]);

  // Cleanup abort controllers on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (meetingAbortControllerRef.current) {
        meetingAbortControllerRef.current.abort();
        meetingAbortControllerRef.current = null;
      }
      meetingTranscriptQueueRef.current = [];
      isMeetingQueueProcessingRef.current = false;
      currentRequestIdRef.current = null;
    };
  }, []);

  // register callbacks for global shortcuts
  useEffect(() => {
    globalShortcuts.registerAudioCallback(toggleRecording);
    globalShortcuts.registerInputRef(inputRef.current);
    globalShortcuts.registerScreenshotCallback(captureScreenshot);
  }, [
    globalShortcuts.registerAudioCallback,
    globalShortcuts.registerInputRef,
    globalShortcuts.registerScreenshotCallback,
    toggleRecording,
    captureScreenshot,
    inputRef,
  ]);

  return {
    input: state.input,
    setInput,
    response: state.response,
    setResponse,
    isLoading: state.isLoading,
    error: state.error,
    attachedFiles: state.attachedFiles,
    addFile,
    removeFile,
    clearFiles,
    submit,
    cancel,
    reset,
    setState,
    enableVAD,
    setEnableVAD,
    micOpen,
    setMicOpen,
    currentConversationId: state.currentConversationId,
    conversationHistory: state.conversationHistory,
    loadConversation,
    startNewConversation,
    messageHistoryOpen,
    setMessageHistoryOpen,
    screenshotConfiguration,
    setScreenshotConfiguration,
    handleScreenshotSubmit,
    handleFileSelect,
    handleKeyPress,
    handlePaste,
    isPopoverOpen,
    scrollAreaRef,
    resizeWindow,
    isFilesPopoverOpen,
    setIsFilesPopoverOpen,
    onRemoveAllFiles,
    inputRef,
    captureScreenshot,
    isScreenshotLoading,
    keepEngaged,
    setKeepEngaged,
    pendingKYCUpdates,
    pendingComplianceFlags,
    clearPendingKYC,
    pendingSalesPrompts,
    clearPendingSalesPrompts,
    isMeetingAnalysing,
    isMeetingActive,
  };
};
