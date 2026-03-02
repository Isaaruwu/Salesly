import { DbClient } from "./database/client.action";
import { KYCUpdate } from "./database/kyc.action";
import { Product } from "./database/product.action";

export const BASE_ADVISOR_PROMPT = `You are an AI co-pilot for a wealth management advisor during a live client meeting.

You have two simultaneous jobs:
1. Extract KYC updates — listen for any facts the client states that belong in their regulatory profile (income, marital status, address, dependants, risk tolerance, etc.)
2. Identify sales opportunities — listen for life events and financial signals, cross-reference the client profile for gaps, and surface the right product at the right moment with a ready-to-use talking point.

You are NOT speaking to the client. You are surfacing intelligence to the advisor in real time.

When answering questions or receiving transcript snippets, return ONLY valid JSON in this exact shape:

{
  "kyc_updates": [{
    "field": "dot.path.in.schema",
    "label": "Human-readable field name",
    "old_value": <current value from profile or null>,
    "new_value": <detected new value>,
    "confidence": 0.0–1.0,
    "transcript_quote": "exact triggering words"
  }],
  "sales_prompts": [{
    "product_id": "exact product id",
    "product_name": "display name",
    "trigger_reason": "one sentence — what the client said that triggered this",
    "urgency": "high | medium | low",
    "suggested_pivot": "natural transition sentence the advisor can say right now"
  }],
  "compliance_flags": [{
    "issue": "description",
    "severity": "urgent | warning | info",
    "action": "suggested advisor action"
  }]
}

Rules:
- Only trigger sales prompts when the transcript provides a genuine signal
- Limit to 2 sales prompts per response — quality over quantity
- Suggested pivots must sound natural and conversational, never salesy
- If nothing is detected, return empty arrays — do not fabricate updates
- The advisor is the fiduciary under IIROC/OSC. AI proposes; advisor decides.`;

export function buildMeetingSystemPrompt(
  clientRow: DbClient,
  kycHistory: { meetingDate: string; updates: KYCUpdate[] }[],
  products: Product[] = []
): string {
  let clientData: any = {};
  try {
    clientData = JSON.parse(clientRow.data);
  } catch {}

  const p = clientData.personal ?? {};
  const emp = clientData.employment ?? {};
  const fam = clientData.family ?? {};
  const fin = clientData.financialSituation ?? {};
  const inv = clientData.investmentProfile ?? {};
  const accounts: any[] = clientData.accounts ?? [];
  const kyc = clientData.kyc ?? {};
  const rel = clientData.relationship ?? {};

  // ── Identify KYC gaps ──────────────────────────────────────────────────────
  const gaps: string[] = [];
  if (!p.dateOfBirth) gaps.push("Date of Birth");
  if (!p.sin) gaps.push("SIN");
  if (!p.email) gaps.push("Email");
  if (!p.address?.street) gaps.push("Street Address");
  if (!p.citizenship) gaps.push("Citizenship");
  if (!p.residencyStatus) gaps.push("Residency Status");
  if (!emp.status) gaps.push("Employment Status");
  if (!emp.annualIncome) gaps.push("Annual Income");
  if (!emp.incomeLastVerified) gaps.push("Income Last Verified");
  if (!emp.sourceOfWealth) gaps.push("Source of Wealth");
  if (fam.maritalStatus == null) gaps.push("Marital Status");
  if (fam.dependants == null) gaps.push("Number of Dependants");
  if (!fin.netWorth) gaps.push("Net Worth");
  if (fin.hasWill == null) gaps.push("Has Will");
  if (fin.hasPOA == null) gaps.push("Has Power of Attorney");
  if (!inv.riskTolerance) gaps.push("Risk Tolerance");
  if (!inv.riskToleranceLastReviewed) gaps.push("Risk Tolerance Last Reviewed");
  if (!inv.investmentObjective) gaps.push("Investment Objective");
  if (!inv.knowledgeLevel) gaps.push("Knowledge Level");
  if (!kyc.kycCompletedDate) gaps.push("KYC Completed Date");
  if (!kyc.amlScreeningStatus) gaps.push("AML Screening Status");
  if (kyc.pepStatus == null) gaps.push("PEP Status");

  // ── Stale data flags ───────────────────────────────────────────────────────
  const stale: string[] = [];
  const now = new Date();
  if (emp.incomeLastVerified) {
    const verified = new Date(emp.incomeLastVerified);
    const yearsAgo = (now.getTime() - verified.getTime()) / (1000 * 60 * 60 * 24 * 365);
    if (yearsAgo > 2) stale.push(`Annual income last verified ${emp.incomeLastVerified} (${Math.floor(yearsAgo)} years ago)`);
  }
  if (kyc.kycNextReviewDue) {
    const due = new Date(kyc.kycNextReviewDue);
    if (due < now) stale.push(`KYC review overdue since ${kyc.kycNextReviewDue}`);
  }
  if (inv.riskToleranceLastReviewed) {
    const reviewed = new Date(inv.riskToleranceLastReviewed);
    const yearsAgo = (now.getTime() - reviewed.getTime()) / (1000 * 60 * 60 * 24 * 365);
    if (yearsAgo > 2) stale.push(`Risk tolerance last reviewed ${inv.riskToleranceLastReviewed} (${Math.floor(yearsAgo)} years ago)`);
  }

  // ── Format accounts ────────────────────────────────────────────────────────
  const accountsSummary = accounts.length > 0
    ? accounts.map(a => `  - ${a.type} (${a.accountNumber}): $${(a.balance ?? 0).toLocaleString()} CAD`).join("\n")
    : "  None on file";

  // ── Format KYC history ─────────────────────────────────────────────────────
  let kycHistorySection = "No previous KYC update history.";
  if (kycHistory.length > 0) {
    kycHistorySection = kycHistory.map(group => {
      const lines = group.updates.map(u => {
        const finalVal = u.finalValue !== null && u.finalValue !== undefined ? JSON.stringify(u.finalValue) : "n/a";
        return `    • ${u.label}: ${JSON.stringify(u.oldValue)} → ${finalVal} [${u.source}, ${u.status}]`;
      }).join("\n");
      return `  Meeting ${group.meetingDate}:\n${lines}`;
    }).join("\n\n");
  }

  // ── Format product catalog ─────────────────────────────────────────────────
  let productCatalogSection = "No product catalog available.";
  if (products.length > 0) {
    const byCategory = products.reduce<Record<string, Product[]>>((acc, p) => {
      if (!acc[p.category]) acc[p.category] = [];
      acc[p.category].push(p);
      return acc;
    }, {});
    productCatalogSection = Object.entries(byCategory).map(([cat, prods]) => {
      const header = cat.toUpperCase();
      const items = prods.map(p =>
        `  [${p.id}] ${p.name} (urgency: ${p.urgencyLevel})\n` +
        `    When to trigger: ${p.eligibilityHints.join(" | ")}\n` +
        `    Talking point: "${p.talkingPoint}"\n` +
        `    Canadian context: ${p.canadianContext}`
      ).join("\n\n");
      return `${header}\n${items}`;
    }).join("\n\n");
  }

  // ── Assemble prompt ────────────────────────────────────────────────────────
  return `${BASE_ADVISOR_PROMPT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLIENT PROFILE — ${p.firstName ?? ""} ${p.lastName ?? ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IDENTITY
  Name:             ${p.firstName ?? "—"} ${p.lastName ?? "—"}
  DOB:              ${p.dateOfBirth ?? "—"}
  SIN:              ${p.sin ?? "—"}
  Phone:            ${p.phone ?? "—"}
  Email:            ${p.email ?? "—"}
  Address:          ${[p.address?.street, p.address?.city, p.address?.province, p.address?.postalCode].filter(Boolean).join(", ") || "—"}
  Citizenship:      ${p.citizenship ?? "—"}
  Residency:        ${p.residencyStatus ?? "—"}
  Language:         ${p.language ?? "—"}

EMPLOYMENT
  Status:           ${emp.status ?? "—"}
  Employer:         ${emp.employer ?? "—"}
  Occupation:       ${emp.occupation ?? "—"}
  Annual Income:    ${emp.annualIncome ? `$${emp.annualIncome.toLocaleString()} CAD` : "—"}
  Last Verified:    ${emp.incomeLastVerified ?? "—"}
  Source of Wealth: ${emp.sourceOfWealth ?? "—"}
  Other Income:     ${emp.otherIncomeSources?.join(", ") || "—"}

FAMILY
  Marital Status:   ${fam.maritalStatus ?? "—"}
  Spouse:           ${fam.spouseName ?? "—"}${fam.spouseIncome ? ` ($${fam.spouseIncome.toLocaleString()}/yr)` : ""}
  Dependants:       ${fam.dependants ?? "—"}${fam.dependantAges?.length ? ` (ages: ${fam.dependantAges.join(", ")})` : ""}

FINANCIAL SITUATION
  Net Worth:        ${fin.netWorth ? `$${fin.netWorth.toLocaleString()}` : "—"}
  Liquid Assets:    ${fin.liquidAssets ? `$${fin.liquidAssets.toLocaleString()}` : "—"}
  Real Estate:      ${fin.realEstateValue ? `$${fin.realEstateValue.toLocaleString()}` : "—"}
  Liabilities:      ${fin.totalLiabilities ? `$${fin.totalLiabilities.toLocaleString()}` : "—"}
  Monthly Expenses: ${fin.monthlyExpenses ? `$${fin.monthlyExpenses.toLocaleString()}` : "—"}
  Emergency Fund:   ${fin.emergencyFundMonths != null ? `${fin.emergencyFundMonths} months` : "—"}
  Has Will:         ${fin.hasWill != null ? (fin.hasWill ? `Yes (updated ${fin.willLastUpdated ?? "date unknown"})` : "No") : "—"}
  Has POA:          ${fin.hasPOA != null ? (fin.hasPOA ? "Yes" : "No") : "—"}
  Life Insurance:   ${fin.lifeInsuranceCoverage ? `$${fin.lifeInsuranceCoverage.toLocaleString()}` : "None on file"}
  Disability Ins.:  ${fin.disabilityInsurance != null ? (fin.disabilityInsurance ? "Yes" : "No") : "—"}

INVESTMENT PROFILE
  Risk Tolerance:   ${inv.riskTolerance ?? "—"} (reviewed ${inv.riskToleranceLastReviewed ?? "never"})
  Objective:        ${inv.investmentObjective ?? "—"}
  Horizon:          ${inv.investmentHorizon != null ? `${inv.investmentHorizon} years` : "—"}
  ESG Preference:   ${inv.esgPreference != null ? (inv.esgPreference ? "Yes" : "No") : "—"}
  Knowledge Level:  ${inv.knowledgeLevel ?? "—"}
  Asset Classes:    ${inv.preferredAssetClasses?.join(", ") || "—"}
  Restricted:       ${inv.restrictedSectors?.join(", ") || "None"}

ACCOUNTS
${accountsSummary}

COMPLIANCE / KYC
  KYC Score:        ${clientRow.kyc_score}%
  KYC Completed:    ${kyc.kycCompletedDate ?? "—"}
  KYC Reviewed:     ${kyc.kycLastReviewedDate ?? "—"}
  KYC Due:          ${kyc.kycNextReviewDue ?? "—"}
  AML Status:       ${kyc.amlScreeningStatus ?? "—"}
  PEP:              ${kyc.pepStatus != null ? (kyc.pepStatus ? "YES — flag required" : "No") : "—"}
  Consent to Mkt:   ${kyc.consentToMarket != null ? (kyc.consentToMarket ? "Yes" : "No") : "—"}
  Docs on File:     ${kyc.documentationOnFile?.join(", ") || "None"}

RELATIONSHIP
  Client Since:     ${rel.clientSince ?? "—"}
  Last Meeting:     ${rel.lastMeetingDate ?? "—"}
  Next Scheduled:   ${rel.nextMeetingScheduled ?? "—"}
  Tags:             ${rel.tags?.join(", ") || "—"}
  Last Notes:       ${rel.lastMeetingNotes ?? "—"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADVISOR INTELLIGENCE FOR THIS MEETING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KYC GAPS (missing required fields):
${gaps.length > 0 ? gaps.map(g => `  • ${g}`).join("\n") : "  None — profile complete"}

STALE DATA FLAGS:
${stale.length > 0 ? stale.map(s => `  ⚠ ${s}`).join("\n") : "  None"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREVIOUS KYC UPDATE HISTORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${kycHistorySection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVAILABLE PRODUCT CATALOG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use ONLY these product_ids when generating sales_prompts. Match the exact id string.

${productCatalogSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FULL CLIENT JSON (for precise field path extraction)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${JSON.stringify(clientData, null, 2)}`;
}
