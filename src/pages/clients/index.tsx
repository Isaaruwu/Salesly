import { useCallback, useEffect, useState } from "react";
import { PageLayout } from "@/layouts";
import {
  getAllClients,
  addClient,
  editClientFields,
  deleteClient,
  ClientSummary,
  getKYCHistoryGrouped,
  editKYCUpdateFinalValue,
  applyKYCUpdate,
  REQUIRED_KYC_FIELDS,
  KYCUpdate,
  getKYCFieldStatus,
  getClientById,
} from "@/lib/database";
import {
  CalendarIcon,
  AlertCircleIcon,
  PlusIcon,
  PencilIcon,
  ClockIcon,
  CheckIcon,
  XIcon,
  Trash2Icon,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
} from "@/components";


const SOURCE_LABEL: Record<string, string> = {
  ai_approved: "AI Approved",
  advisor_edited: "Advisor Edited",
  rejected: "Rejected",
  deferred: "Deferred",
};

const SOURCE_COLOR: Record<string, string> = {
  ai_approved: "bg-blue-500/10 text-blue-400",
  advisor_edited: "bg-purple-500/10 text-purple-400",
  rejected: "bg-red-500/10 text-red-400",
  deferred: "bg-amber-500/10 text-amber-400",
};

function KycScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-500/10 text-green-400 border-green-500/20"
      : score >= 50
      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
      : "bg-red-500/10 text-red-400 border-red-500/20";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${color}`}
    >
      {score}%
    </span>
  );
}

function ClientCard({
  client,
  onEdit,
  onHistory,
  onDelete,
}: {
  client: ClientSummary;
  onEdit: (client: ClientSummary) => void;
  onHistory: (client: ClientSummary) => void;
  onDelete: (client: ClientSummary) => void;
}) {
  return (
    <div className="group rounded-xl border border-border/50 border-l-4 border-l-muted bg-card p-4 flex flex-col gap-3 hover:bg-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {client.firstName} {client.lastName} <KycScoreBadge score={client.kycScore} />
            </p>
            <p className="text-xs text-muted-foreground">
              {client.email ?? client.phone ?? "No contact info"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <Button
            size="icon"
            variant="ghost"
            className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
            title="KYC History"
            onClick={(e) => {
              e.stopPropagation();
              onHistory(client);
            }}
          >
            <ClockIcon className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit client"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(client);
            }}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-400 hover:bg-red-500/10"
            title="Remove client"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(client);
            }}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground">
        {client.lastMeetingDate && (
          <span className="flex items-center gap-1">
            <CalendarIcon className="size-3" />
            Last: {client.lastMeetingDate}
          </span>
        )}
        {client.nextMeetingScheduled && (
          <span className="flex items-center gap-1 text-primary">
            <CalendarIcon className="size-3" />
            Next: {client.nextMeetingScheduled}
          </span>
        )}
        {client.clientSince && (
          <span className="ml-auto">
            Client since {client.clientSince.slice(0, 4)}
          </span>
        )}
      </div>

      {client.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {client.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {tag.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── KYC History Dialog ──────────────────────────────────────────────────────

// ── KYC History Dialog ──────────────────────────────────────────────────────

function KYCHistoryDialog({
  client,
  onClose,
  onScoreUpdated,
}: {
  client: ClientSummary | null;
  onClose: () => void;
  onScoreUpdated: (clientId: string, newScore: number) => void;
}) {
  const [groups, setGroups] = useState<{ meetingDate: string; updates: KYCUpdate[] }[]>([]);
  const [fieldStatus, setFieldStatus] = useState<
    { path: string; label: string; filled: boolean; value: any }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"fields" | "history">("fields");

  // Inline edit state (most recent meeting only)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Add new entry form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDate, setAddDate] = useState(new Date().toISOString().slice(0, 10));
  const [addField, setAddField] = useState("");
  const [addValue, setAddValue] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const refresh = async () => {
    if (!client) return;
    const [grouped, row] = await Promise.all([
      getKYCHistoryGrouped(client.id),
      getClientById(client.id),
    ]);
    setGroups(grouped);
    if (row) {
      let data: any = {};
      try { data = JSON.parse(row.data); } catch {}
      setFieldStatus(getKYCFieldStatus(data));
    }
  };

  useEffect(() => {
    if (!client) return;
    setLoading(true);
    setGroups([]);
    setFieldStatus([]);
    setEditingId(null);
    setShowAddForm(false);
    refresh().finally(() => setLoading(false));
  }, [client]);

  const startEdit = (update: KYCUpdate) => {
    setEditingId(update.id);
    const current = update.finalValue ?? update.newValue;
    setEditValue(current !== null && current !== undefined ? String(current) : "");
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
    setEditError(null);
  };

  const handleSaveEdit = async (update: KYCUpdate) => {
    if (!client || !editValue.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const fieldDef = REQUIRED_KYC_FIELDS.find((f) => f.path === update.field);
      let parsed: any = editValue.trim();
      if (fieldDef?.type === "number") parsed = Number(parsed);
      else if (fieldDef?.type === "boolean") parsed = parsed === "true";
      const newScore = await editKYCUpdateFinalValue(update.id, client.id, update.field, parsed);
      onScoreUpdated(client.id, newScore);
      await refresh();
      setEditingId(null);
    } catch (e) {
      setEditError(String(e));
    } finally {
      setEditSaving(false);
    }
  };

  const handleAddEntry = async () => {
    if (!client || !addField || !addValue.trim()) {
      setAddError("Select a field and enter a value.");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      const fieldDef = REQUIRED_KYC_FIELDS.find((f) => f.path === addField);
      if (!fieldDef) throw new Error("Unknown field");
      let parsed: any = addValue.trim();
      if (fieldDef.type === "number") parsed = Number(parsed);
      else if (fieldDef.type === "boolean") parsed = parsed === "true";
      const newScore = await applyKYCUpdate(client.id, addField, fieldDef.label, parsed, {
        source: "advisor_edited",
        meetingDate: addDate,
      });
      onScoreUpdated(client.id, newScore);
      await refresh();
      setAddField("");
      setAddValue("");
    } catch (e) {
      setAddError(String(e));
    } finally {
      setAddSaving(false);
    }
  };

  const filledCount = fieldStatus.filter((f) => f.filled).length;
  const totalCount = fieldStatus.length;
  const scorePercent = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;
  const addFieldDef = REQUIRED_KYC_FIELDS.find((f) => f.path === addField);

  const formatMeetingDate = (d: string) => {
    try {
      return new Date(d + "T12:00:00").toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            KYC — {client?.firstName} {client?.lastName}
          </DialogTitle>
        </DialogHeader>

        {/* Score bar */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Completeness</span>
            <span
              className={
                scorePercent >= 80
                  ? "text-green-400 font-semibold"
                  : scorePercent >= 50
                  ? "text-amber-400 font-semibold"
                  : "text-red-400 font-semibold"
              }
            >
              {scorePercent}% ({filledCount}/{totalCount} fields)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                scorePercent >= 80 ? "bg-green-500" : scorePercent >= 50 ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${scorePercent}%` }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border/50">
          {(["fields", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "fields"
                ? "Fields"
                : `History${groups.length > 0 ? ` (${groups.length} meetings)` : ""}`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {/* Fields tab */}
          {activeTab === "fields" && (
            <ScrollArea className="h-[360px] pr-2">
              {loading ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {fieldStatus.map((f) => (
                    <div
                      key={f.path}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 bg-card/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {f.filled ? (
                          <CheckIcon className="size-3.5 text-green-400 shrink-0" />
                        ) : (
                          <XIcon className="size-3.5 text-red-400/60 shrink-0" />
                        )}
                        <span className="text-xs text-foreground truncate">{f.label}</span>
                      </div>
                      {f.filled && (
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0 max-w-[120px] truncate">
                          {String(f.value)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          )}

          {/* History tab */}
          {activeTab === "history" && (
            <ScrollArea className="h-[360px] pr-2">
              {loading ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {groups.length === 0 && !showAddForm && (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No KYC history yet.
                    </p>
                  )}

                  {groups.map((group, idx) => {
                    const isRecent = idx === 0;
                    return (
                      <div key={group.meetingDate} className="flex flex-col gap-1.5">
                        {/* Meeting header */}
                        <div className="flex items-center gap-2 px-0.5">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            {formatMeetingDate(group.meetingDate)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            · {group.updates.length}{" "}
                            {group.updates.length === 1 ? "change" : "changes"}
                          </span>
                          {isRecent && (
                            <span className="ml-auto text-[10px] font-medium text-primary">
                              Most Recent
                            </span>
                          )}
                        </div>

                        {/* Update rows */}
                        <div className="rounded-lg border border-border/50 divide-y divide-border/30 overflow-hidden">
                          {group.updates.map((update) => {
                            const isEditing = editingId === update.id;
                            const fieldDef = REQUIRED_KYC_FIELDS.find(
                              (f) => f.path === update.field
                            );
                            const oldStr =
                              update.oldValue !== null && update.oldValue !== undefined
                                ? String(update.oldValue)
                                : "—";
                            const finalStr =
                              update.finalValue !== null && update.finalValue !== undefined
                                ? String(update.finalValue)
                                : "—";

                            return (
                              <div
                                key={update.id}
                                className="px-3 py-2 bg-card/50 flex flex-col gap-1.5"
                              >
                                {/* Label + actions row */}
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-foreground">
                                    {update.label}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {!isEditing && (
                                      <span
                                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                                          SOURCE_COLOR[update.source] ?? ""
                                        }`}
                                      >
                                        {SOURCE_LABEL[update.source] ?? update.source}
                                      </span>
                                    )}
                                    {isRecent && !isEditing && (
                                      <button
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                        onClick={() => startEdit(update)}
                                      >
                                        <PencilIcon className="size-3" />
                                      </button>
                                    )}
                                    {isEditing && (
                                      <>
                                        <button
                                          className="text-green-400 hover:text-green-300 transition-colors disabled:opacity-40"
                                          onClick={() => handleSaveEdit(update)}
                                          disabled={editSaving || !editValue.trim()}
                                        >
                                          <CheckIcon className="size-3.5" />
                                        </button>
                                        <button
                                          className="text-muted-foreground hover:text-foreground transition-colors"
                                          onClick={cancelEdit}
                                          disabled={editSaving}
                                        >
                                          <XIcon className="size-3.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Value row */}
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground font-mono line-through">
                                    {oldStr}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">→</span>
                                  {isEditing ? (
                                    <div className="flex-1 flex flex-col gap-1">
                                      {fieldDef?.type === "boolean" ? (
                                        <Select value={editValue} onValueChange={setEditValue}>
                                          <SelectTrigger className="h-6 text-[11px]">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="true">Yes / True</SelectItem>
                                            <SelectItem value="false">No / False</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <Input
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          type={
                                            fieldDef?.type === "number"
                                              ? "number"
                                              : fieldDef?.type === "date"
                                              ? "date"
                                              : "text"
                                          }
                                          className="h-6 text-[11px]"
                                          autoFocus
                                        />
                                      )}
                                      {editError && editingId === update.id && (
                                        <p className="text-[10px] text-red-400">{editError}</p>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-green-400 font-mono font-semibold">
                                      {finalStr}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Add new entry form */}
                  {showAddForm ? (
                    <div className="rounded-lg border border-border/50 bg-card/30 p-3 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">
                          Log Field Change
                        </span>
                        <button
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => {
                            setShowAddForm(false);
                            setAddField("");
                            setAddValue("");
                            setAddError(null);
                          }}
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[10px]">Meeting Date</Label>
                        <Input
                          type="date"
                          value={addDate}
                          onChange={(e) => setAddDate(e.target.value)}
                          className="h-7 text-xs"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[10px]">Field</Label>
                        <Select
                          value={addField}
                          onValueChange={(v) => {
                            setAddField(v);
                            setAddValue("");
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Select a KYC field" />
                          </SelectTrigger>
                          <SelectContent>
                            {REQUIRED_KYC_FIELDS.map((f) => (
                              <SelectItem key={f.path} value={f.path}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {addField && (
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-[10px]">New Value</Label>
                          {addFieldDef?.type === "boolean" ? (
                            <Select value={addValue} onValueChange={setAddValue}>
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Select value" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">Yes / True</SelectItem>
                                <SelectItem value="false">No / False</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={addValue}
                              onChange={(e) => setAddValue(e.target.value)}
                              type={
                                addFieldDef?.type === "number"
                                  ? "number"
                                  : addFieldDef?.type === "date"
                                  ? "date"
                                  : "text"
                              }
                              className="h-7 text-xs"
                              placeholder={
                                addFieldDef?.type === "number"
                                  ? "Enter number"
                                  : addFieldDef?.type === "date"
                                  ? "YYYY-MM-DD"
                                  : "Enter value"
                              }
                            />
                          )}
                        </div>
                      )}

                      {addError && (
                        <p className="text-[10px] text-red-400 flex items-center gap-1">
                          <AlertCircleIcon className="size-3" />
                          {addError}
                        </p>
                      )}

                      {addField && addValue.trim() && (
                        <Button
                          size="sm"
                          onClick={handleAddEntry}
                          disabled={addSaving}
                          className="h-7 text-xs"
                        >
                          {addSaving ? "Adding..." : "Add Entry"}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <button
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                      onClick={() => setShowAddForm(true)}
                    >
                      <PlusIcon className="size-3" />
                      Log field change for a meeting
                    </button>
                  )}
                </div>
              )}
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ── Delete confirmation dialog ──────────────────────────────────────────────

function DeleteClientDialog({
  client,
  onClose,
  onDeleted,
}: {
  client: ClientSummary | null;
  onClose: () => void;
  onDeleted: (clientId: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!client) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteClient(client.id);
      onDeleted(client.id);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove client?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will permanently delete{" "}
          <span className="font-semibold text-foreground">
            {client?.firstName} {client?.lastName}
          </span>{" "}
          and all their KYC history. This cannot be undone.
        </p>
        {error && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertCircleIcon className="size-3" />
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Removing..." : "Remove client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Client form ─────────────────────────────────────────────────────────────

type ClientForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

const EMPTY_FORM: ClientForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
};

function ClientFormFields({
  form,
  set,
  error,
}: {
  form: ClientForm;
  set: (field: keyof ClientForm, value: string) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf_first_name">First name *</Label>
          <Input
            id="cf_first_name"
            value={form.first_name}
            onChange={(e) => set("first_name", e.target.value)}
            placeholder="Sarah"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf_last_name">Last name *</Label>
          <Input
            id="cf_last_name"
            value={form.last_name}
            onChange={(e) => set("last_name", e.target.value)}
            placeholder="Chen"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cf_email">Email</Label>
        <Input
          id="cf_email"
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="client@email.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cf_phone">Phone</Label>
        <Input
          id="cf_phone"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="+1-416-555-0000"
        />
      </div>

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircleIcon className="size-3" />
          {error}
        </p>
      )}
    </div>
  );
}

function NewClientDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (client: ClientSummary) => void;
}) {
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof ClientForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("First and last name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addClient({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        advisor_id: "advisor_001",
      });
      const all = await getAllClients();
      const created = all.find(
        (c) =>
          c.firstName === form.first_name.trim() &&
          c.lastName === form.last_name.trim()
      );
      if (created) onCreated(created);
      setForm(EMPTY_FORM);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Client</DialogTitle>
        </DialogHeader>
        <ClientFormFields form={form} set={set} error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating..." : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditClientDialog({
  client,
  onClose,
  onSaved,
}: {
  client: ClientSummary | null;
  onClose: () => void;
  onSaved: (updated: ClientSummary) => void;
}) {
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client) {
      setForm({
        first_name: client.firstName,
        last_name: client.lastName,
        email: client.email ?? "",
        phone: client.phone ?? "",
      });
      setError(null);
    }
  }, [client]);

  const set = (field: keyof ClientForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!client) return;
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("First and last name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await editClientFields(client.id, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
      });
      onSaved({
        ...client,
        firstName: form.first_name.trim(),
        lastName: form.last_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit — {client?.firstName} {client?.lastName}
          </DialogTitle>
        </DialogHeader>
        <ClientFormFields form={form} set={set} error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

const Clients = () => {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientSummary | null>(null);
  const [historyClient, setHistoryClient] = useState<ClientSummary | null>(null);
  const [deletingClient, setDeletingClient] = useState<ClientSummary | null>(null);

  const loadClients = useCallback(async () => {
    try {
      const all = await getAllClients();
      setClients(all);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();

    const onFocus = () => {
      loadClients();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadClients();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadClients]);

  const handleSaved = (updated: ClientSummary) => {
    setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleScoreUpdated = (clientId: string, newScore: number) => {
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, kycScore: newScore } : c))
    );
    // Keep historyClient in sync so the score bar updates
    setHistoryClient((prev) =>
      prev?.id === clientId ? { ...prev, kycScore: newScore } : prev
    );
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-background">
      {/* Draggable title-bar region */}
      <div
        className="absolute left-0 right-0 top-0 z-50 h-10 select-none"
        data-tauri-drag-region={true}
      />
      <main className="flex flex-1 flex-col overflow-hidden px-8">
        <PageLayout
          title="Clients"
          description="Manage your client profiles and KYC status."
          rightSlot={
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setNewDialogOpen(true)}
            >
              <PlusIcon className="size-3.5" />
            </Button>
          }
        >
          {loading && (
            <p className="text-sm text-muted-foreground">Loading clients...</p>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircleIcon className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && clients.length === 0 && (
            <p className="text-sm text-muted-foreground">No clients found.</p>
          )}

          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onEdit={setEditingClient}
              onHistory={setHistoryClient}
              onDelete={setDeletingClient}
            />
          ))}
        </PageLayout>
      </main>

      <NewClientDialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        onCreated={(c) => setClients((prev) => [c, ...prev])}
      />

      <EditClientDialog
        client={editingClient}
        onClose={() => setEditingClient(null)}
        onSaved={handleSaved}
      />

      <KYCHistoryDialog
        client={historyClient}
        onClose={() => setHistoryClient(null)}
        onScoreUpdated={handleScoreUpdated}
      />

      <DeleteClientDialog
        client={deletingClient}
        onClose={() => setDeletingClient(null)}
        onDeleted={(id) => setClients((prev) => prev.filter((c) => c.id !== id))}
      />
    </div>
  );
};

export default Clients;
