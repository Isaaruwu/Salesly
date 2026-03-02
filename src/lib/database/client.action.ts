import { getDatabase } from "./config";

export interface DbClient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  kyc_score: number;
  client_since: string | null;
  last_meeting_date: string | null;
  next_meeting_scheduled: string | null;
  advisor_id: string | null;
  tags: string; // JSON array
  data: string; // Full client JSON blob
  created_at: number;
  updated_at: number;
}

export interface ClientSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  kycScore: number;
  clientSince: string | null;
  lastMeetingDate: string | null;
  nextMeetingScheduled: string | null;
  tags: string[];
}

function toSummary(row: DbClient): ClientSummary {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    kycScore: row.kyc_score,
    clientSince: row.client_since,
    lastMeetingDate: row.last_meeting_date,
    nextMeetingScheduled: row.next_meeting_scheduled,
    tags: JSON.parse(row.tags || "[]"),
  };
}

export async function getAllClients(): Promise<ClientSummary[]> {
  const db = await getDatabase();
  const rows = await db.select<DbClient[]>(
    "SELECT * FROM clients ORDER BY last_meeting_date DESC"
  );
  return rows.map(toSummary);
}

export async function getClientById(id: string): Promise<DbClient | null> {
  const db = await getDatabase();
  const rows = await db.select<DbClient[]>(
    "SELECT * FROM clients WHERE id = ?",
    [id]
  );
  return rows[0] ?? null;
}

export async function addClient(
  client: Pick<DbClient, "first_name" | "last_name" | "email" | "phone" | "advisor_id">
): Promise<string> {
  const db = await getDatabase();
  const id = `client_${Date.now()}`;
  const now = Date.now();

  const data = {
    id,
    personal: {
      firstName: client.first_name,
      lastName: client.last_name,
      email: client.email ?? null,
      phone: client.phone ?? null,
      dateOfBirth: null,
      sin: null,
      preferredContactMethod: null,
      address: { street: null, city: null, province: null, postalCode: null, country: "Canada" },
      citizenship: null,
      residencyStatus: null,
      language: null,
    },
    employment: { status: null, employer: null, occupation: null, industry: null, annualIncome: null, incomeLastVerified: null, sourceOfWealth: null, otherIncomeSources: [] },
    family: { maritalStatus: null, spouseName: null, spouseIncome: null, dependants: null, dependantAges: [] },
    financialSituation: { netWorth: null, liquidAssets: null, realEstateValue: null, totalLiabilities: null, monthlyExpenses: null, emergencyFundMonths: null, hasWill: null, willLastUpdated: null, hasPOA: null, lifeInsuranceCoverage: null, disabilityInsurance: null },
    investmentProfile: { riskTolerance: null, riskToleranceLastReviewed: null, investmentHorizon: null, investmentObjective: null, esgPreference: null, preferredAssetClasses: [], restrictedSectors: [], knowledgeLevel: null },
    accounts: [],
    kyc: { kycCompletedDate: null, kycLastReviewedDate: null, kycNextReviewDue: null, amlScreeningStatus: "pending", pepStatus: null, thirdPartyDetermination: null, consentToMarket: null, documentationOnFile: [] },
    relationship: { advisorId: client.advisor_id ?? "advisor_001", clientSince: new Date().toISOString().slice(0, 10), nps: null, lastMeetingDate: null, lastMeetingNotes: null, nextMeetingScheduled: null, referralSource: null, tags: [] },
    meetingHistory: [],
  };

  await db.execute(
    `INSERT INTO clients (id, first_name, last_name, email, phone, kyc_score, client_since, advisor_id, tags, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      client.first_name,
      client.last_name,
      client.email ?? null,
      client.phone ?? null,
      new Date().toISOString().slice(0, 10),
      client.advisor_id ?? "advisor_001",
      JSON.stringify([]),
      JSON.stringify(data),
      now,
      now,
    ]
  );
  return id;
}

export async function editClientFields(
  id: string,
  fields: Pick<DbClient, "first_name" | "last_name" | "email" | "phone">
): Promise<void> {
  const db = await getDatabase();

  // Update indexed columns and keep data JSON blob in sync
  const rows = await db.select<DbClient[]>("SELECT data FROM clients WHERE id = ?", [id]);
  const current = rows[0];
  let data: any = {};
  if (current) {
    try { data = JSON.parse(current.data); } catch {}
  }
  if (data.personal) {
    data.personal.firstName = fields.first_name;
    data.personal.lastName = fields.last_name;
    data.personal.email = fields.email ?? null;
    data.personal.phone = fields.phone ?? null;
  }

  await db.execute(
    `UPDATE clients SET
      first_name = ?,
      last_name = ?,
      email = ?,
      phone = ?,
      data = ?
    WHERE id = ?`,
    [
      fields.first_name,
      fields.last_name,
      fields.email ?? null,
      fields.phone ?? null,
      JSON.stringify(data),
      id,
    ]
  );
}

export async function deleteClient(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM clients WHERE id = ?", [id]);
}

export async function updateClientData(
  id: string,
  data: object,
  updates?: Partial<
    Pick<
      DbClient,
      | "first_name"
      | "last_name"
      | "email"
      | "phone"
      | "kyc_score"
      | "last_meeting_date"
      | "next_meeting_scheduled"
      | "tags"
    >
  >
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE clients SET
      data = ?,
      first_name = COALESCE(?, first_name),
      last_name = COALESCE(?, last_name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      kyc_score = COALESCE(?, kyc_score),
      last_meeting_date = COALESCE(?, last_meeting_date),
      next_meeting_scheduled = COALESCE(?, next_meeting_scheduled),
      tags = COALESCE(?, tags)
    WHERE id = ?`,
    [
      JSON.stringify(data),
      updates?.first_name ?? null,
      updates?.last_name ?? null,
      updates?.email ?? null,
      updates?.phone ?? null,
      updates?.kyc_score ?? null,
      updates?.last_meeting_date ?? null,
      updates?.next_meeting_scheduled ?? null,
      updates?.tags ? JSON.stringify(updates.tags) : null,
      id,
    ]
  );
}
