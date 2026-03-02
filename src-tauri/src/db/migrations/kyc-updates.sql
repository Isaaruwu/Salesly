-- Migration 4: Create KYC updates history table
CREATE TABLE IF NOT EXISTS kyc_updates (
    id TEXT PRIMARY KEY NOT NULL,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    field TEXT NOT NULL,             -- dot-path: "employment.annualIncome"
    label TEXT NOT NULL,             -- human-readable: "Annual Income"
    old_value TEXT,                  -- JSON-encoded prior value
    new_value TEXT,                  -- JSON-encoded AI-suggested value
    final_value TEXT,                -- JSON-encoded committed value (may differ if advisor edited)
    source TEXT NOT NULL DEFAULT 'ai_approved',  -- ai_approved | advisor_edited | rejected | deferred
    confidence REAL DEFAULT 1.0,
    transcript_quote TEXT,
    status TEXT NOT NULL DEFAULT 'approved',     -- approved | rejected | deferred
    meeting_date TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_kyc_updates_client ON kyc_updates(client_id);
CREATE INDEX IF NOT EXISTS idx_kyc_updates_status ON kyc_updates(status);
CREATE INDEX IF NOT EXISTS idx_kyc_updates_created ON kyc_updates(created_at DESC);

-- Seed historical KYC updates for Sarah Chen
INSERT OR IGNORE INTO kyc_updates (id, client_id, field, label, old_value, new_value, final_value, source, confidence, transcript_quote, status, meeting_date, created_at) VALUES
    ('kyc_sarah_001', 'client_001', 'employment.annualIncome', 'Annual Income', '140000', '165000', '165000', 'advisor_edited', 0.95, 'I received a raise, I am now at 165 thousand', 'approved', '2021-09-10', 1631232000000),
    ('kyc_sarah_002', 'client_001', 'investmentProfile.riskTolerance', 'Risk Tolerance', 'moderate_conservative', 'moderate', 'moderate', 'ai_approved', 0.88, 'I am comfortable with a bit more risk these days', 'approved', '2021-09-10', 1631232100000),
    ('kyc_sarah_003', 'client_001', 'family.dependants', 'Number of Dependants', '1', '2', '2', 'ai_approved', 0.99, 'We had our second child last year', 'approved', '2021-09-10', 1631232200000),
    ('kyc_sarah_004', 'client_001', 'kyc.kycLastReviewedDate', 'KYC Last Reviewed', '"2019-06-01"', '"2021-09-10"', '"2021-09-10"', 'advisor_edited', 1.0, null, 'approved', '2021-09-10', 1631232300000),
    ('kyc_sarah_005', 'client_001', 'financialSituation.hasPOA', 'Power of Attorney', 'null', 'false', 'false', 'ai_approved', 0.72, 'We have not set that up yet', 'approved', '2024-08-14', 1723593600000);

-- Seed historical KYC updates for Marcus Webb
INSERT OR IGNORE INTO kyc_updates (id, client_id, field, label, old_value, new_value, final_value, source, confidence, transcript_quote, status, meeting_date, created_at) VALUES
    ('kyc_marcus_001', 'client_002', 'investmentProfile.investmentHorizon', 'Investment Horizon (years)', '20', '25', '25', 'ai_approved', 0.91, 'I am thinking longer term now, maybe 25 years', 'approved', '2024-04-01', 1711929600000),
    ('kyc_marcus_002', 'client_002', 'investmentProfile.riskTolerance', 'Risk Tolerance', 'moderate', 'moderate_conservative', 'moderate_conservative', 'ai_approved', 0.87, 'I want to be a bit more conservative as I get closer to retirement', 'approved', '2024-04-01', 1711929700000),
    ('kyc_marcus_003', 'client_002', 'financialSituation.disabilityInsurance', 'Disability Insurance', 'true', 'false', 'false', 'advisor_edited', 1.0, 'My policy lapsed last year and I have not renewed', 'approved', '2024-04-01', 1711929800000),
    ('kyc_marcus_004', 'client_002', 'employment.annualIncome', 'Annual Income', '280000', '310000', '310000', 'ai_approved', 0.93, 'Revenue was up this year, closer to 310', 'approved', '2024-04-01', 1711929900000),
    ('kyc_marcus_005', 'client_002', 'kyc.kycNextReviewDue', 'KYC Next Review Due', '"2024-04-01"', '"2025-04-01"', '"2025-04-01"', 'advisor_edited', 1.0, null, 'approved', '2024-04-01', 1711930000000);
