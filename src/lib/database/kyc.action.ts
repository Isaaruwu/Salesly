import { getDatabase } from "./config";
import { getClientById } from "./client.action";

// Fields that map to dedicated columns in the clients table (in addition to the JSON blob)
const DEDICATED_COLUMN_FIELDS: Record<string, string> = {
  "personal.firstName": "first_name",
  "personal.lastName": "last_name",
  "personal.email": "email",
  "personal.phone": "phone",
};

// ── Types ──────────────────────────────────────────────────────────────────

export type KYCUpdateSource = "ai_approved" | "advisor_edited" | "rejected" | "deferred";
export type KYCUpdateStatus = "approved" | "rejected" | "deferred";

export interface KYCUpdate {
  id: string;
  clientId: string;
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
  finalValue: any;
  source: KYCUpdateSource;
  confidence: number;
  transcriptQuote: string | null;
  status: KYCUpdateStatus;
  meetingDate: string | null;
  createdAt: number;
}

// ── Field registry ─────────────────────────────────────────────────────────

export const REQUIRED_KYC_FIELDS: { path: string; label: string; type: "text" | "number" | "date" | "boolean" | "enum" }[] = [
  { path: "personal.firstName",                       label: "First Name",               type: "text" },
  { path: "personal.lastName",                        label: "Last Name",                type: "text" },
  { path: "personal.dateOfBirth",                     label: "Date of Birth",            type: "date" },
  { path: "personal.sin",                             label: "SIN",                      type: "text" },
  { path: "personal.phone",                           label: "Phone",                    type: "text" },
  { path: "personal.email",                           label: "Email",                    type: "text" },
  { path: "personal.address.street",                  label: "Street Address",           type: "text" },
  { path: "personal.citizenship",                     label: "Citizenship",              type: "text" },
  { path: "personal.residencyStatus",                 label: "Residency Status",         type: "enum" },
  { path: "employment.status",                        label: "Employment Status",        type: "enum" },
  { path: "employment.annualIncome",                  label: "Annual Income",            type: "number" },
  { path: "employment.incomeLastVerified",            label: "Income Last Verified",     type: "date" },
  { path: "employment.sourceOfWealth",                label: "Source of Wealth",         type: "text" },
  { path: "family.maritalStatus",                     label: "Marital Status",           type: "enum" },
  { path: "family.dependants",                        label: "Number of Dependants",     type: "number" },
  { path: "financialSituation.netWorth",              label: "Net Worth",                type: "number" },
  { path: "financialSituation.hasWill",               label: "Has Will",                 type: "boolean" },
  { path: "financialSituation.hasPOA",                label: "Has Power of Attorney",    type: "boolean" },
  { path: "investmentProfile.riskTolerance",          label: "Risk Tolerance",           type: "enum" },
  { path: "investmentProfile.riskToleranceLastReviewed", label: "Risk Tolerance Reviewed", type: "date" },
  { path: "investmentProfile.investmentObjective",    label: "Investment Objective",     type: "enum" },
  { path: "investmentProfile.knowledgeLevel",         label: "Knowledge Level",          type: "enum" },
  { path: "kyc.kycCompletedDate",                     label: "KYC Completed Date",       type: "date" },
  { path: "kyc.amlScreeningStatus",                   label: "AML Screening Status",     type: "enum" },
  { path: "kyc.pepStatus",                            label: "PEP Status",               type: "boolean" },
];

// ── Score computation ──────────────────────────────────────────────────────

function getByPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

function setByPath(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] == null) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

export function computeKYCScore(clientData: any): number {
  const filled = REQUIRED_KYC_FIELDS.filter(({ path }) => {
    const val = getByPath(clientData, path);
    return val !== null && val !== undefined;
  }).length;
  return Math.round((filled / REQUIRED_KYC_FIELDS.length) * 100);
}

export function getKYCFieldStatus(clientData: any): { path: string; label: string; filled: boolean; value: any }[] {
  return REQUIRED_KYC_FIELDS.map(({ path, label }) => {
    const value = getByPath(clientData, path);
    return { path, label, filled: value !== null && value !== undefined, value };
  });
}

// ── DB operations ──────────────────────────────────────────────────────────

interface DbKYCUpdate {
  id: string;
  client_id: string;
  field: string;
  label: string;
  old_value: string | null;
  new_value: string | null;
  final_value: string | null;
  source: string;
  confidence: number;
  transcript_quote: string | null;
  status: string;
  meeting_date: string | null;
  created_at: number;
}

function rowToKYCUpdate(r: DbKYCUpdate): KYCUpdate {
  return {
    id: r.id,
    clientId: r.client_id,
    field: r.field,
    label: r.label,
    oldValue: r.old_value !== null ? JSON.parse(r.old_value) : null,
    newValue: r.new_value !== null ? JSON.parse(r.new_value) : null,
    finalValue: r.final_value !== null ? JSON.parse(r.final_value) : null,
    source: r.source as KYCUpdateSource,
    confidence: r.confidence,
    transcriptQuote: r.transcript_quote,
    status: r.status as KYCUpdateStatus,
    meetingDate: r.meeting_date,
    createdAt: r.created_at,
  };
}

export async function getKYCHistoryGrouped(
  clientId: string
): Promise<{ meetingDate: string; updates: KYCUpdate[] }[]> {
  const all = await getKYCHistory(clientId);
  const map = new Map<string, KYCUpdate[]>();
  for (const u of all) {
    const key = u.meetingDate ?? new Date(u.createdAt).toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(u);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([meetingDate, updates]) => ({ meetingDate, updates }));
}

/**
 * Edits the final_value and source of an existing KYC update record (advisor correction),
 * then re-applies the new value to the client data blob and recomputes the score.
 */
export async function editKYCUpdateFinalValue(
  updateId: string,
  clientId: string,
  field: string,
  newFinalValue: any
): Promise<number> {
  const db = await getDatabase();
  await db.execute(
    "UPDATE kyc_updates SET final_value = ?, source = 'advisor_edited' WHERE id = ?",
    [JSON.stringify(newFinalValue), updateId]
  );

  const clientRow = await getClientById(clientId);
  if (!clientRow) throw new Error("Client not found");

  let data: any = {};
  try { data = JSON.parse(clientRow.data); } catch {}
  setByPath(data, field, newFinalValue);

  const newScore = computeKYCScore(data);
  await db.execute(
    "UPDATE clients SET data = ?, kyc_score = ? WHERE id = ?",
    [JSON.stringify(data), newScore, clientId]
  );

  // Also sync dedicated columns if applicable
  const dedicatedColumn = DEDICATED_COLUMN_FIELDS[field];
  if (dedicatedColumn) {
    await db.execute(
      `UPDATE clients SET ${dedicatedColumn} = ?, updated_at = ? WHERE id = ?`,
      [newFinalValue !== null && newFinalValue !== undefined ? String(newFinalValue) : null, Date.now(), clientId]
    );
  }

  return newScore;
}

export async function getKYCHistory(clientId: string): Promise<KYCUpdate[]> {
  const db = await getDatabase();
  const rows = await db.select<DbKYCUpdate[]>(
    "SELECT * FROM kyc_updates WHERE client_id = ? ORDER BY created_at DESC",
    [clientId]
  );
  return rows.map(rowToKYCUpdate);
}

export async function addKYCUpdate(
  clientId: string,
  update: Omit<KYCUpdate, "id" | "clientId" | "createdAt">
): Promise<void> {
  const db = await getDatabase();
  const id = `kyc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await db.execute(
    `INSERT INTO kyc_updates
      (id, client_id, field, label, old_value, new_value, final_value, source, confidence, transcript_quote, status, meeting_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, clientId,
      update.field, update.label,
      JSON.stringify(update.oldValue ?? null),
      JSON.stringify(update.newValue ?? null),
      JSON.stringify(update.finalValue ?? null),
      update.source,
      update.confidence ?? 1.0,
      update.transcriptQuote ?? null,
      update.status,
      update.meetingDate ?? null,
      Date.now(),
    ]
  );
}

/**
 * Applies an approved KYC field change to the client's data blob,
 * recomputes the KYC score, persists both, and records the update in history.
 */
export async function applyKYCUpdate(
  clientId: string,
  field: string,
  label: string,
  newValue: any,
  opts: {
    source?: KYCUpdateSource;
    transcriptQuote?: string | null;
    meetingDate?: string | null;
  } = {}
): Promise<number> {
  const db = await getDatabase();
  const clientRow = await getClientById(clientId);
  if (!clientRow) throw new Error("Client not found");

  let data: any = {};
  try { data = JSON.parse(clientRow.data); } catch {}

  const oldValue = getByPath(data, field) ?? null;
  setByPath(data, field, newValue);

  const newScore = computeKYCScore(data);

  // Update the JSON blob and KYC score
  await db.execute(
    "UPDATE clients SET data = ?, kyc_score = ? WHERE id = ?",
    [JSON.stringify(data), newScore, clientId]
  );

  // Also sync dedicated columns (first_name, last_name, email, phone) if applicable
  const dedicatedColumn = DEDICATED_COLUMN_FIELDS[field];
  if (dedicatedColumn) {
    await db.execute(
      `UPDATE clients SET ${dedicatedColumn} = ?, updated_at = ? WHERE id = ?`,
      [newValue !== null && newValue !== undefined ? String(newValue) : null, Date.now(), clientId]
    );
  }

  await addKYCUpdate(clientId, {
    field,
    label,
    oldValue,
    newValue,
    finalValue: newValue,
    source: opts.source ?? "advisor_edited",
    confidence: 1.0,
    transcriptQuote: opts.transcriptQuote ?? null,
    status: "approved",
    meetingDate: opts.meetingDate ?? new Date().toISOString().slice(0, 10),
  });

  return newScore;
}
