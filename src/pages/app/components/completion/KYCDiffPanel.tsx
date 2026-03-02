import { useState, useEffect, useRef } from "react";
import {
  CheckIcon,
  XIcon,
  PencilIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  InfoIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Button, Input as InputComponent } from "@/components";
import { applyKYCUpdate, REQUIRED_KYC_FIELDS } from "@/lib/database/kyc.action";

const MEETING_CLIENT_KEY = "salesly_meeting_client_id";

const ENUM_OPTIONS: Record<string, string[]> = {
  "personal.residencyStatus": [
    "citizen",
    "permanent_resident",
    "work_permit",
    "other",
  ],
  "employment.status": [
    "employed",
    "self_employed",
    "retired",
    "unemployed",
    "student",
  ],
  "family.maritalStatus": [
    "single",
    "married",
    "common_law",
    "divorced",
    "widowed",
  ],
  "investmentProfile.riskTolerance": [
    "conservative",
    "moderate_conservative",
    "moderate",
    "moderate_aggressive",
    "aggressive",
  ],
  "investmentProfile.investmentObjective": [
    "capital_preservation",
    "income",
    "balanced",
    "growth",
    "aggressive_growth",
  ],
  "investmentProfile.knowledgeLevel": [
    "none",
    "limited",
    "good",
    "sophisticated",
  ],
  "kyc.amlScreeningStatus": ["clear", "pending", "flagged"],
};

export interface PendingKYCUpdate {
  id: string;
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
  confidence: number;
  transcriptQuote: string;
}

export interface ComplianceFlag {
  issue: string;
  severity: "urgent" | "warning" | "info";
  action: string;
}

export interface SalesPrompt {
  id: string;
  productId: string;
  productName: string;
  triggerReason: string;
  urgency: "high" | "medium" | "low";
  suggestedPivot: string;
}

// ── Sales Prompt Panel ────────────────────────────────────────────────────────

interface LocalSalesPrompt extends SalesPrompt {
  status: "active" | "discussed" | "dismissed";
  expanded: boolean;
}

const URGENCY_BORDER: Record<string, string> = {
  high: "border-l-amber-400",
  medium: "border-l-yellow-600/70",
  low: "border-l-muted-foreground/40",
};

const URGENCY_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const SalesPromptPanel = ({
  salesPrompts,
  onAllDismissed,
}: {
  salesPrompts: SalesPrompt[];
  onAllDismissed: () => void;
}) => {
  const [local, setLocal] = useState<LocalSalesPrompt[]>(() =>
    salesPrompts.map((s) => ({ ...s, status: "active" as const, expanded: false }))
  );

  const seenIdsRef = useRef(new Set(salesPrompts.map((s) => s.id)));
  useEffect(() => {
    const incoming = salesPrompts.filter((s) => !seenIdsRef.current.has(s.id));
    if (incoming.length === 0) return;
    incoming.forEach((s) => seenIdsRef.current.add(s.id));
    setLocal((prev) => [
      ...prev,
      ...incoming.map((s) => ({ ...s, status: "active" as const, expanded: false })),
    ]);
  }, [salesPrompts]);

  const resolve = (id: string, status: "discussed" | "dismissed") => {
    const next = local.map((s) => (s.id === id ? { ...s, status } : s));
    setLocal(next);
    if (next.every((s) => s.status !== "active")) setTimeout(onAllDismissed, 500);
  };

  const toggleExpanded = (id: string) => {
    setLocal((prev) =>
      prev.map((s) => (s.id === id ? { ...s, expanded: !s.expanded } : s))
    );
  };

  const activeCount = local.filter((s) => s.status === "active").length;

  return (
    <div className="space-y-2 mb-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground pb-0.5 border-b border-border/40">
        <span className="font-semibold flex items-center gap-1.5">
          <TrendingUpIcon className="h-3 w-3 text-amber-400" />
          Sales Opportunities
        </span>
        <span>{activeCount} active</span>
      </div>

      {local.map((s) => {
        const isResolved = s.status !== "active";
        return (
          <div
            key={s.id}
            className={`rounded border border-l-4 ${URGENCY_BORDER[s.urgency] ?? "border-l-muted-foreground/40"} p-3 space-y-1.5 text-sm transition-all duration-300 ${
              isResolved ? "opacity-40 pointer-events-none" : "border-border/60"
            }`}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-tight">{s.productName}</p>
                <span className="text-[10px] text-amber-400/80 font-mono">
                  {URGENCY_LABEL[s.urgency]} priority
                </span>
              </div>
              {isResolved && (
                <span className={`text-[10px] font-semibold shrink-0 ${s.status === "discussed" ? "text-green-400" : "text-muted-foreground"}`}>
                  {s.status === "discussed" ? "✓ Discussed" : "✗ Dismissed"}
                </span>
              )}
            </div>

            {/* Trigger reason */}
            {s.triggerReason && (
              <p className="text-xs text-muted-foreground leading-snug">{s.triggerReason}</p>
            )}

            {/* Suggested pivot — expandable */}
            {s.suggestedPivot && (
              <div>
                <button
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                  onClick={() => toggleExpanded(s.id)}
                >
                  {s.expanded ? (
                    <ChevronUpIcon className="h-3 w-3" />
                  ) : (
                    <ChevronDownIcon className="h-3 w-3" />
                  )}
                  Suggested pivot
                </button>
                {s.expanded && (
                  <p className="mt-1.5 text-[10px] italic text-muted-foreground/70 font-mono border-l-2 border-amber-400/30 pl-2 leading-snug">
                    "{s.suggestedPivot}"
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            {!isResolved && (
              <div className="flex gap-1.5 pt-0.5">
                <Button
                  size="sm"
                  className="h-7 text-xs flex-1 bg-green-700 hover:bg-green-600 text-white"
                  onClick={() => resolve(s.id, "discussed")}
                >
                  <CheckIcon className="h-3 w-3 mr-1" /> Discussed
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs flex-1 text-muted-foreground hover:text-foreground"
                  onClick={() => resolve(s.id, "dismissed")}
                >
                  <XIcon className="h-3 w-3 mr-1" /> Dismiss
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface LocalUpdate extends PendingKYCUpdate {
  status: "pending" | "accepted" | "rejected" | "edited";
  editedValue?: any;
}

function formatValue(value: any, label: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    const moneyLabels = [
      "Income",
      "Worth",
      "Coverage",
      "Assets",
      "Liabilities",
      "Expenses",
      "Balance",
      "Value",
    ];
    if (moneyLabels.some((m) => label.includes(m))) {
      return `$${value.toLocaleString()}`;
    }
    return String(value);
  }
  return String(value);
}

function getFieldType(
  fieldPath: string
): "text" | "number" | "date" | "boolean" | "enum" {
  return REQUIRED_KYC_FIELDS.find((f) => f.path === fieldPath)?.type ?? "text";
}

interface KYCDiffPanelProps {
  pendingUpdates: PendingKYCUpdate[];
  complianceFlags: ComplianceFlag[];
  onAllResolved: () => void;
}

export const KYCDiffPanel = ({
  pendingUpdates,
  complianceFlags,
  onAllResolved,
}: KYCDiffPanelProps) => {
  const [localUpdates, setLocalUpdates] = useState<LocalUpdate[]>(() =>
    pendingUpdates.map((u) => ({ ...u, status: "pending" as const }))
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  // Append newly arrived updates without disturbing ones already being reviewed
  const seenIdsRef = useRef<Set<string>>(
    new Set(pendingUpdates.map((u) => u.id))
  );
  useEffect(() => {
    const incoming = pendingUpdates.filter((u) => !seenIdsRef.current.has(u.id));
    if (incoming.length === 0) return;
    incoming.forEach((u) => seenIdsRef.current.add(u.id));
    setLocalUpdates((prev) => [
      ...prev,
      ...incoming.map((u) => ({ ...u, status: "pending" as const })),
    ]);
  }, [pendingUpdates]);

  const clientId = localStorage.getItem(MEETING_CLIENT_KEY);
  const today = new Date().toISOString().slice(0, 10);

  const checkAllResolved = (updates: LocalUpdate[]) => {
    if (updates.length > 0 && updates.every((u) => u.status !== "pending")) {
      setTimeout(onAllResolved, 500);
    }
  };

  const handleAccept = async (update: LocalUpdate) => {
    if (!clientId) return;
    try {
      await applyKYCUpdate(clientId, update.field, update.label, update.newValue, {
        source: "ai_approved",
        transcriptQuote: update.transcriptQuote,
        meetingDate: today,
      });
      const next = localUpdates.map((u) =>
        u.id === update.id ? { ...u, status: "accepted" as const } : u
      );
      setLocalUpdates(next);
      checkAllResolved(next);
    } catch (err) {
      console.error("Failed to apply KYC update:", err);
    }
  };

  const handleReject = (id: string) => {
    const next = localUpdates.map((u) =>
      u.id === id ? { ...u, status: "rejected" as const } : u
    );
    setLocalUpdates(next);
    checkAllResolved(next);
  };

  const startEdit = (update: LocalUpdate) => {
    setEditingId(update.id);
    setEditValue(String(update.newValue ?? ""));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const confirmEdit = async (update: LocalUpdate) => {
    if (!clientId) return;
    const fieldType = getFieldType(update.field);
    let parsed: any = editValue;
    if (fieldType === "number") parsed = Number(editValue);
    else if (fieldType === "boolean") parsed = editValue === "true";
    try {
      await applyKYCUpdate(clientId, update.field, update.label, parsed, {
        source: "advisor_edited",
        transcriptQuote: update.transcriptQuote,
        meetingDate: today,
      });
      const next = localUpdates.map((u) =>
        u.id === update.id
          ? { ...u, status: "edited" as const, editedValue: parsed }
          : u
      );
      setLocalUpdates(next);
      setEditingId(null);
      checkAllResolved(next);
    } catch (err) {
      console.error("Failed to apply edited KYC update:", err);
    }
  };

  const severityIcon = (sev: ComplianceFlag["severity"]) => {
    if (sev === "urgent")
      return <AlertCircleIcon className="h-3.5 w-3.5 text-red-400 shrink-0" />;
    if (sev === "warning")
      return (
        <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      );
    return <InfoIcon className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
  };

  const severityBorder = (sev: ComplianceFlag["severity"]) => {
    if (sev === "urgent") return "border-red-500/30 bg-red-500/5";
    if (sev === "warning") return "border-amber-500/30 bg-amber-500/5";
    return "border-blue-500/30 bg-blue-500/5";
  };

  const pendingCount = localUpdates.filter((u) => u.status === "pending").length;

  if (localUpdates.length === 0 && complianceFlags.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {/* Compliance flags */}
      {complianceFlags.length > 0 && (
        <div className="space-y-1.5">
          {complianceFlags.map((flag, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 p-2.5 rounded border text-xs ${severityBorder(flag.severity)}`}
            >
              {severityIcon(flag.severity)}
              <div>
                <p className="font-medium">{flag.issue}</p>
                <p className="mt-0.5 text-muted-foreground">{flag.action}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KYC updates section */}
      {localUpdates.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 pb-0.5 border-b border-border/40">
            <span className="font-semibold">KYC Changes Detected</span>
            <span>
              {pendingCount} pending · {localUpdates.length} total
            </span>
          </div>

          {localUpdates.map((update) => {
            const isResolved = update.status !== "pending";
            const isEditing = editingId === update.id;
            const fieldType = getFieldType(update.field);

            return (
              <div
                key={update.id}
                className={`rounded border p-3 space-y-1.5 text-sm transition-all duration-300 ${
                  isResolved
                    ? "opacity-40 pointer-events-none"
                    : "border-border/70"
                }`}
              >
                {/* Field path + status/confidence */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground/50">
                    {update.field}
                  </span>
                  {isResolved ? (
                    <span
                      className={`text-[10px] font-semibold ${
                        update.status === "accepted"
                          ? "text-green-400"
                          : update.status === "edited"
                          ? "text-blue-400"
                          : "text-red-400"
                      }`}
                    >
                      {update.status === "accepted"
                        ? "✓ Accepted"
                        : update.status === "edited"
                        ? "✓ Edited"
                        : "✗ Rejected"}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50 font-mono">
                      {Math.round((update.confidence ?? 0) * 100)}% confidence
                    </span>
                  )}
                </div>

                {/* Field label */}
                <p className="font-medium text-sm leading-none">{update.label}</p>

                {/* Diff: old → new (non-edit mode) */}
                {!isEditing && (
                  <div className="flex items-center gap-2 font-mono text-xs py-0.5">
                    <span className="line-through text-red-400/70">
                      {formatValue(update.oldValue, update.label)}
                    </span>
                    <span className="text-muted-foreground/40">→</span>
                    <span
                      className={`font-semibold ${
                        isResolved && update.status === "edited"
                          ? "text-blue-300"
                          : "text-green-400"
                      }`}
                    >
                      {formatValue(
                        update.status === "edited"
                          ? update.editedValue
                          : update.newValue,
                        update.label
                      )}
                    </span>
                  </div>
                )}

                {/* Transcript quote */}
                {update.transcriptQuote && !isEditing && (
                  <p className="text-[10px] italic text-muted-foreground/50 font-mono border-l-2 border-border/30 pl-2 leading-snug">
                    "{update.transcriptQuote}"
                  </p>
                )}

                {/* Edit mode */}
                {isEditing && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[10px] text-amber-400">
                      AI suggested: {formatValue(update.newValue, update.label)}
                    </p>
                    {fieldType === "boolean" ? (
                      <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full h-7 text-xs rounded border border-input bg-background px-2"
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : fieldType === "enum" && ENUM_OPTIONS[update.field] ? (
                      <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full h-7 text-xs rounded border border-input bg-background px-2"
                      >
                        {ENUM_OPTIONS[update.field].map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <InputComponent
                        type={
                          fieldType === "number"
                            ? "number"
                            : fieldType === "date"
                            ? "date"
                            : "text"
                        }
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-7 text-xs font-mono"
                        autoFocus
                      />
                    )}
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs bg-green-700 hover:bg-green-600"
                        onClick={() => confirmEdit(update)}
                      >
                        <CheckIcon className="h-3 w-3 mr-1" /> Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-3"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Action buttons — pending only */}
                {!isResolved && !isEditing && (
                  <div className="flex gap-1.5 pt-0.5">
                    <Button
                      size="sm"
                      className="h-7 text-xs flex-1 bg-green-700 hover:bg-green-600 text-white"
                      onClick={() => handleAccept(update)}
                    >
                      <CheckIcon className="h-3 w-3 mr-1" /> Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs flex-1"
                      onClick={() => startEdit(update)}
                    >
                      <PencilIcon className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs flex-1 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      onClick={() => handleReject(update.id)}
                    >
                      <XIcon className="h-3 w-3 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
