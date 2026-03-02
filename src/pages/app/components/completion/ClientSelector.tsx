import { useState, useEffect, useRef } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Input as InputComponent,
} from "@/components";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { UserIcon, PlusIcon, CheckIcon, XIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  getAllClients,
  addClient,
  getClientById,
  ClientSummary,
  DbClient,
} from "@/lib/database/client.action";
import { getKYCHistoryGrouped, getKYCFieldStatus } from "@/lib/database/kyc.action";
import { getActiveProducts } from "@/lib/database/product.action";
import {
  safeLocalStorage,
  buildMeetingSystemPrompt,
  BASE_ADVISOR_PROMPT,
} from "@/lib";
import { getAdvisorSystemPrompt } from "@/lib/database/system-prompt.action";
import { useWindowResize } from "@/hooks";
import { useApp } from "@/contexts";
import { fetchAIResponse } from "@/lib/functions/ai-response.function";

export const MEETING_CLIENT_KEY = "salesly_meeting_client_id";
export const MEETING_CLIENT_NAME_KEY = "salesly_meeting_client_name";

export function useSelectedMeetingClient() {
  return safeLocalStorage.getItem(MEETING_CLIENT_KEY);
}

function kycColor(score: number) {
  if (score >= 80) return "text-green-500";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

const PRE_MEETING_SYSTEM_PROMPT = `You are a pre-meeting intelligence assistant for a wealth management advisor.
Produce a concise pre-meeting brief in markdown. Be brief and scannable — **IMPORTANT**: the advisor has ~30 seconds before the meeting starts.

Include exactly these four sections (use ## headings):
## Client Snapshot
2–3 lines: who they are, net worth/income, segment, key relationship context, last meeting takeaway.

## KYC Priorities
**Bullet list** of the most critical missing or stale fields to address today. Be specific about what to ask.

## Revenue Opportunities
Top 2–3 products or discussions worth raising. For each: one line of rationale + a suggested opening line the advisor can say naturally.

## Watch For
2–3 specific signals or topics likely to come up in this conversation based on the client's profile and history. What should the advisor listen for?

Be direct and advisor-focused. No fluff. No disclaimers. No JSON.`;

function buildPreMeetingUserPrompt(clientRow: DbClient): string {
  let d: any = {};
  try {
    d = JSON.parse(clientRow.data);
  } catch {}

  const p = d.personal ?? {};
  const emp = d.employment ?? {};
  const fam = d.family ?? {};
  const fin = d.financialSituation ?? {};
  const inv = d.investmentProfile ?? {};
  const kyc = d.kyc ?? {};
  const rel = d.relationship ?? {};
  const accounts: any[] = d.accounts ?? [];

  const gaps: string[] = [];
  if (!p.dateOfBirth) gaps.push("Date of Birth");
  if (!p.sin) gaps.push("SIN");
  if (!emp.annualIncome) gaps.push("Annual Income");
  if (!emp.incomeLastVerified) gaps.push("Income Last Verified");
  if (!emp.sourceOfWealth) gaps.push("Source of Wealth");
  if (fam.maritalStatus == null) gaps.push("Marital Status");
  if (fam.dependants == null) gaps.push("Dependants");
  if (!fin.netWorth) gaps.push("Net Worth");
  if (fin.hasWill == null) gaps.push("Has Will");
  if (fin.hasPOA == null) gaps.push("Power of Attorney");
  if (!inv.riskTolerance) gaps.push("Risk Tolerance");
  if (!inv.investmentObjective) gaps.push("Investment Objective");
  if (!kyc.amlScreeningStatus) gaps.push("AML Screening Status");

  const stale: string[] = [];
  const now = new Date();
  if (emp.incomeLastVerified) {
    const yrs =
      (now.getTime() - new Date(emp.incomeLastVerified).getTime()) /
      (365.25 * 24 * 3600 * 1000);
    if (yrs > 2)
      stale.push(
        `Income verified ${emp.incomeLastVerified} (${Math.floor(yrs)}y ago)`
      );
  }
  if (kyc.kycNextReviewDue && new Date(kyc.kycNextReviewDue) < now) {
    stale.push(`KYC review overdue since ${kyc.kycNextReviewDue}`);
  }
  if (inv.riskToleranceLastReviewed) {
    const yrs =
      (now.getTime() - new Date(inv.riskToleranceLastReviewed).getTime()) /
      (365.25 * 24 * 3600 * 1000);
    if (yrs > 2)
      stale.push(
        `Risk tolerance reviewed ${inv.riskToleranceLastReviewed} (${Math.floor(yrs)}y ago)`
      );
  }

  const accountsSummary = accounts.length
    ? accounts
        .map((a) => `${a.type}: $${(a.balance ?? 0).toLocaleString()} CAD`)
        .join(" | ")
    : "None on file";

  return `CLIENT: ${p.firstName ?? "—"} ${p.lastName ?? "—"}
KYC Score: ${clientRow.kyc_score}% | Segment: ${rel.segment ?? "—"} | Client Since: ${rel.clientSince ?? "—"}

EMPLOYMENT: ${emp.status ?? "—"} at ${emp.employer ?? "—"} (${emp.occupation ?? "—"})
Income: $${(emp.annualIncome ?? 0).toLocaleString()} CAD | Last Verified: ${emp.incomeLastVerified ?? "never"}
Source of Wealth: ${emp.sourceOfWealth ?? "—"}

FAMILY: ${fam.maritalStatus ?? "—"} | ${fam.dependants ?? 0} dependant(s) (ages: ${fam.dependantAges?.join(", ") || "none"})

FINANCES:
Net Worth: $${(fin.netWorth ?? 0).toLocaleString()} | Liquid: $${(fin.liquidAssets ?? 0).toLocaleString()} | Real Estate: $${(fin.realEstateValue ?? 0).toLocaleString()}
Liabilities: $${(fin.totalLiabilities ?? 0).toLocaleString()} | Monthly Expenses: $${(fin.monthlyExpenses ?? 0).toLocaleString()}
Life Insurance: ${fin.lifeInsuranceCoverage ? `$${fin.lifeInsuranceCoverage.toLocaleString()}` : "None"} | Disability: ${fin.disabilityInsurance == null ? "—" : fin.disabilityInsurance ? "Yes" : "No"}
Will: ${fin.hasWill == null ? "—" : fin.hasWill ? `Yes (updated ${fin.willLastUpdated ?? "unknown"})` : "No"} | POA: ${fin.hasPOA == null ? "—" : fin.hasPOA ? "Yes" : "No"}

INVESTMENT PROFILE:
Risk: ${inv.riskTolerance ?? "—"} (reviewed ${inv.riskToleranceLastReviewed ?? "never"}) | Objective: ${inv.investmentObjective ?? "—"} | Horizon: ${inv.investmentHorizon ?? "—"} years
ESG Preference: ${inv.esgPreference == null ? "—" : inv.esgPreference ? "Yes" : "No"} | Knowledge: ${inv.knowledgeLevel ?? "—"}

ACCOUNTS: ${accountsSummary}

LAST MEETING: ${rel.lastMeetingDate ?? "Never"}
Notes: ${rel.lastMeetingNotes ?? "No notes on file"}

KYC GAPS: ${gaps.length ? gaps.join(", ") : "None"}
STALE DATA: ${stale.length ? stale.join("; ") : "None"}
TAGS: ${rel.tags?.join(", ") || "None"}

FULL PROFILE JSON:
${JSON.stringify(d, null, 2)}

Generate the pre-meeting brief now.`;
}

export const ClientSelector = ({ isHidden }: { isHidden: boolean }) => {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [selected, setSelected] = useState<ClientSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [saving, setSaving] = useState(false);

  // Abort ref for in-progress pre-meeting stream
  const preMeetingAbortRef = useRef<AbortController | null>(null);

  const { resizeWindow } = useWindowResize();
  const { setSystemPrompt, allAiProviders, selectedAIProvider } = useApp();

  const loadClients = async () => {
    const all = await getAllClients();
    setClients(all);
    const savedId = safeLocalStorage.getItem(MEETING_CLIENT_KEY);
    if (savedId) {
      const found = all.find((c) => c.id === savedId) ?? null;
      setSelected(found);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    resizeWindow(newOpen);
    if (newOpen) loadClients();
    if (!newOpen) setCreating(false);
  };

  const streamPreMeetingBrief = async (
    client: ClientSummary,
    clientRow: DbClient
  ) => {
    const provider = allAiProviders.find(
      (p) => p.id === selectedAIProvider.provider
    );
    if (!provider || !selectedAIProvider.provider) return;

    const clientName = `${client.firstName} ${client.lastName}`;
    localStorage.setItem("salesly_pre_meeting_client", clientName);
    localStorage.setItem("salesly_pre_meeting_content", "");
    localStorage.setItem("salesly_pre_meeting_streaming", "true");

    try {
      await invoke("open_pre_meeting");
    } catch (err) {
      console.error("Failed to open pre-meeting window:", err);
    }

    const controller = new AbortController();
    preMeetingAbortRef.current = controller;

    let accumulated = "";
    try {
      const userMessage = buildPreMeetingUserPrompt(clientRow);
      for await (const chunk of fetchAIResponse({
        provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: PRE_MEETING_SYSTEM_PROMPT,
        history: [],
        userMessage,
        imagesBase64: [],
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) break;
        accumulated += chunk;
        localStorage.setItem("salesly_pre_meeting_content", accumulated);
      }
    } catch {
      if (!controller.signal.aborted) {
        localStorage.setItem(
          "salesly_pre_meeting_content",
          "Failed to generate pre-meeting brief. Check your AI provider settings."
        );
      }
    } finally {
      if (preMeetingAbortRef.current === controller) {
        preMeetingAbortRef.current = null;
        localStorage.setItem("salesly_pre_meeting_streaming", "false");
      }
    }
  };

  const selectClient = async (client: ClientSummary) => {
    setSelected(client);
    safeLocalStorage.setItem(MEETING_CLIENT_KEY, client.id);
    safeLocalStorage.setItem(MEETING_CLIENT_NAME_KEY, `${client.firstName} ${client.lastName}`);
    handleOpenChange(false);

    try {
      const [clientRow, kycHistory, products] = await Promise.all([
        getClientById(client.id),
        getKYCHistoryGrouped(client.id),
        getActiveProducts(),
      ]);
      if (!clientRow) return;
      const prompt = buildMeetingSystemPrompt(clientRow, kycHistory, products);
      setSystemPrompt(prompt);
      safeLocalStorage.setItem("system_prompt", prompt);

      // Write KYC field status to localStorage for the pre-meeting window
      let clientData: any = {};
      try { clientData = JSON.parse(clientRow.data); } catch {}
      localStorage.setItem(
        "salesly_pre_meeting_kyc",
        JSON.stringify(getKYCFieldStatus(clientData))
      );

      // Abort any in-progress stream from a previous client
      preMeetingAbortRef.current?.abort();

      streamPreMeetingBrief(client, clientRow);
    } catch (err) {
      console.error("Failed during client selection:", err);
    }
  };

  const clearSelection = async () => {
    setSelected(null);
    safeLocalStorage.removeItem(MEETING_CLIENT_KEY);
    safeLocalStorage.removeItem(MEETING_CLIENT_NAME_KEY);
    handleOpenChange(false);
    try {
      const advisorPrompt =
        (await getAdvisorSystemPrompt()) ?? BASE_ADVISOR_PROMPT;
      setSystemPrompt(advisorPrompt);
      safeLocalStorage.setItem("system_prompt", advisorPrompt);
    } catch {
      setSystemPrompt(BASE_ADVISOR_PROMPT);
      safeLocalStorage.setItem("system_prompt", BASE_ADVISOR_PROMPT);
    }
  };

  const handleCreate = async () => {
    if (!newFirst.trim() || !newLast.trim() || saving) return;
    setSaving(true);
    try {
      const id = await addClient({
        first_name: newFirst.trim(),
        last_name: newLast.trim(),
        email: null,
        phone: null,
        advisor_id: null,
      });
      const all = await getAllClients();
      setClients(all);
      const found = all.find((c) => c.id === id) ?? null;
      if (found) await selectClient(found);
    } finally {
      setSaving(false);
      setNewFirst("");
      setNewLast("");
      setCreating(false);
    }
  };

  return (
    <div className="relative flex-1">
      {/* Client search popover */}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={isHidden}
            className="w-full justify-start gap-2 px-3 h-9 font-normal bg-transparent"
          >
            <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {selected ? (
              <span className="flex-1 truncate text-left font-medium text-sm">
                {selected.firstName} {selected.lastName}
              </span>
            ) : (
              <span className="flex-1 text-left text-sm text-muted-foreground">
                Select client for meeting...
              </span>
            )}
            {selected && (
              <span
                className={`text-xs font-mono shrink-0 ${kycColor(selected.kycScore)}`}
              >
                KYC {selected.kycScore}%
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          className="w-screen p-0 border shadow-lg overflow-hidden"
        >
          <Command>
            <CommandInput placeholder="Search clients..." />
            <div className="max-h-[calc(100vh-10rem)] overflow-y-auto">
              <CommandList className="max-h-none">
                <CommandEmpty>No clients found.</CommandEmpty>
                <CommandGroup heading="Clients">
                  {clients.map((client) => (
                    <CommandItem
                      key={client.id}
                      value={`${client.firstName} ${client.lastName}`}
                      onSelect={() => selectClient(client)}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          {selected?.id === client.id ? (
                            <CheckIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                          ) : (
                            <div className="w-3.5 shrink-0" />
                          )}
                          <div>
                            <span className="font-medium">
                              {client.firstName} {client.lastName}
                            </span>
                            {client.lastMeetingDate && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                Last seen {client.lastMeetingDate}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`text-xs font-mono ml-2 shrink-0 ${kycColor(client.kycScore)}`}
                        >
                          {client.kycScore}%
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>

                <CommandSeparator />

                {!creating && (
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => setCreating(true)}
                      className="text-muted-foreground"
                    >
                      <PlusIcon className="h-3.5 w-3.5 mr-1 shrink-0" />
                      New client
                    </CommandItem>
                    {selected && (
                      <CommandItem
                        onSelect={clearSelection}
                        className="text-muted-foreground"
                      >
                        <XIcon className="h-3.5 w-3.5 mr-1 shrink-0" />
                        Clear selection
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}
              </CommandList>
            </div>

            {creating && (
              <div className="border-t p-3 space-y-2">
                <p className="text-xs text-muted-foreground">New client</p>
                <InputComponent
                  placeholder="First name"
                  value={newFirst}
                  onChange={(e) => setNewFirst(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
                <InputComponent
                  placeholder="Last name"
                  value={newLast}
                  onChange={(e) => setNewLast(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={handleCreate}
                    disabled={!newFirst.trim() || !newLast.trim() || saving}
                  >
                    {saving ? "Creating..." : "Create & select"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCreating(false);
                      setNewFirst("");
                      setNewLast("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>

    </div>
  );
};
