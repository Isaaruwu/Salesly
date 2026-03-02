-- Migration 3: Create clients table
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    segment TEXT, -- mass_market | emerging_affluent | affluent | hni
    kyc_score INTEGER DEFAULT 0,
    aml_status TEXT DEFAULT 'pending', -- clear | pending | flagged
    client_since TEXT,
    last_meeting_date TEXT,
    next_meeting_scheduled TEXT,
    advisor_id TEXT,
    tags TEXT NOT NULL DEFAULT '[]', -- JSON array
    data TEXT NOT NULL DEFAULT '{}', -- Full client JSON blob
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_clients_advisor ON clients(advisor_id);
CREATE INDEX IF NOT EXISTS idx_clients_segment ON clients(segment);

CREATE TRIGGER IF NOT EXISTS clients_updated_at
    AFTER UPDATE ON clients
BEGIN
    UPDATE clients SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
END;

-- Seed: Sarah Chen
INSERT OR IGNORE INTO clients (id, first_name, last_name, email, phone, segment, kyc_score, aml_status, client_since, last_meeting_date, next_meeting_scheduled, advisor_id, tags, data) VALUES (
    'client_001',
    'Sarah',
    'Chen',
    'sarah.chen@email.com',
    '+1-416-555-0182',
    'affluent',
    87,
    'clear',
    '2018-06-01',
    '2024-08-14',
    NULL,
    'advisor_001',
    '["education_planning","esg","dual_income","real_estate"]',
    '{"id":"client_001","personal":{"firstName":"Sarah","lastName":"Chen","dateOfBirth":"1982-07-14","sin":"XXX-XXX-142","phone":"+1-416-555-0182","email":"sarah.chen@email.com","preferredContactMethod":"email","address":{"street":"84 Rosedale Valley Rd","city":"Toronto","province":"ON","postalCode":"M4W 1P8","country":"Canada"},"citizenship":"Canadian","residencyStatus":"citizen","language":"EN"},"employment":{"status":"employed","employer":"Shopify Inc.","occupation":"Senior Software Engineer","industry":"Technology","annualIncome":165000,"incomeLastVerified":"2022-03-15","sourceOfWealth":"Employment income","otherIncomeSources":["rental income"]},"family":{"maritalStatus":"married","spouseName":"David Chen","spouseIncome":95000,"dependants":2,"dependantAges":[8,11]},"financialSituation":{"netWorth":1240000,"liquidAssets":380000,"realEstateValue":1100000,"totalLiabilities":620000,"monthlyExpenses":7200,"emergencyFundMonths":4,"hasWill":true,"willLastUpdated":"2019-11-01","hasPOA":false,"lifeInsuranceCoverage":500000,"disabilityInsurance":true},"investmentProfile":{"riskTolerance":"moderate","riskToleranceLastReviewed":"2021-09-10","investmentHorizon":20,"investmentObjective":"growth","esgPreference":true,"preferredAssetClasses":["equities","ETFs"],"restrictedSectors":["tobacco","weapons"],"knowledgeLevel":"good"},"accounts":[{"accountNumber":"TFSA-00182","type":"TFSA","balance":94500,"lastUpdated":"2025-01-15","currency":"CAD","beneficiary":"David Chen","beneficiaryLastUpdated":"2021-03-01"},{"accountNumber":"RRSP-00182","type":"RRSP","balance":212000,"lastUpdated":"2025-01-15","currency":"CAD","beneficiary":"David Chen","beneficiaryLastUpdated":"2021-03-01"},{"accountNumber":"RESP-00182","type":"RESP","balance":48300,"lastUpdated":"2025-01-15","currency":"CAD","beneficiary":null,"beneficiaryLastUpdated":null},{"accountNumber":"NR-00182","type":"Non-Registered","balance":25200,"lastUpdated":"2025-01-15","currency":"CAD","beneficiary":null,"beneficiaryLastUpdated":null}],"kyc":{"kycCompletedDate":"2018-06-01","kycLastReviewedDate":"2021-09-10","kycNextReviewDue":"2024-09-10","amlScreeningStatus":"clear","pepStatus":false,"thirdPartyDetermination":false,"consentToMarket":true,"documentationOnFile":["passport","proof_of_address"]},"relationship":{"advisorId":"advisor_001","clientSince":"2018-06-01","segment":"affluent","nps":9,"lastMeetingDate":"2024-08-14","lastMeetingNotes":"Discussed increasing RESP contributions. Interested in ESG. Mentioned possible promotion.","nextMeetingScheduled":null,"referralSource":"colleague","tags":["education_planning","esg","dual_income","real_estate"]},"meetingHistory":[{"date":"2024-08-14","summary":"Annual review. Portfolio on track. Discussed RESP gap for two kids approaching post-secondary.","kycUpdates":[],"actionItems":["Increase RESP to $500/month","Send ESG fund options"],"advisorNotes":"Income not updated since 2022. KYC review overdue Sep 2024. Will from 2019 predates second child. No POA on file."}]}'
);

-- Seed: Marcus Webb
INSERT OR IGNORE INTO clients (id, first_name, last_name, email, phone, segment, kyc_score, aml_status, client_since, last_meeting_date, next_meeting_scheduled, advisor_id, tags, data) VALUES (
    'client_002',
    'Marcus',
    'Webb',
    'm.webb@webb-consulting.ca',
    '+1-604-555-0341',
    'hni',
    91,
    'clear',
    '2015-09-01',
    '2024-11-20',
    '2025-02-23',
    'advisor_001',
    '["retirement_imminent","business_owner","estate_planning","rrsp_to_rrif"]',
    '{"id":"client_002","personal":{"firstName":"Marcus","lastName":"Webb","dateOfBirth":"1966-03-22","sin":"XXX-XXX-089","phone":"+1-604-555-0341","email":"m.webb@webb-consulting.ca","preferredContactMethod":"phone","address":{"street":"2210 Point Grey Rd","city":"Vancouver","province":"BC","postalCode":"V6K 1A1","country":"Canada"},"citizenship":"Canadian","residencyStatus":"citizen","language":"EN"},"employment":{"status":"self_employed","employer":"Webb Consulting Group Inc.","occupation":"Management Consultant","industry":"Professional Services","annualIncome":310000,"incomeLastVerified":"2024-04-01","sourceOfWealth":"Business income + investment portfolio","otherIncomeSources":["rental income","dividends"]},"family":{"maritalStatus":"divorced","spouseName":null,"spouseIncome":null,"dependants":1,"dependantAges":[19]},"financialSituation":{"netWorth":3850000,"liquidAssets":1200000,"realEstateValue":2800000,"totalLiabilities":410000,"monthlyExpenses":14000,"emergencyFundMonths":12,"hasWill":true,"willLastUpdated":"2023-02-15","hasPOA":true,"lifeInsuranceCoverage":1000000,"disabilityInsurance":false},"investmentProfile":{"riskTolerance":"moderate_conservative","riskToleranceLastReviewed":"2024-04-01","investmentHorizon":25,"investmentObjective":"balanced","esgPreference":false,"preferredAssetClasses":["bonds","dividend_equities","real_estate"],"restrictedSectors":[],"knowledgeLevel":"sophisticated"},"accounts":[{"accountNumber":"RRSP-00089","type":"RRSP","balance":875000,"lastUpdated":"2025-01-15","currency":"CAD","beneficiary":"Estate","beneficiaryLastUpdated":"2023-02-15"},{"accountNumber":"TFSA-00089","type":"TFSA","balance":95000,"lastUpdated":"2025-01-15","currency":"CAD","beneficiary":"Lucas Webb","beneficiaryLastUpdated":"2020-01-10"},{"accountNumber":"NR-00089","type":"Non-Registered","balance":245000,"lastUpdated":"2025-01-15","currency":"CAD","beneficiary":null,"beneficiaryLastUpdated":null},{"accountNumber":"CORP-00089","type":"Corporate","balance":510000,"lastUpdated":"2025-01-15","currency":"CAD","beneficiary":null,"beneficiaryLastUpdated":null}],"kyc":{"kycCompletedDate":"2015-09-01","kycLastReviewedDate":"2024-04-01","kycNextReviewDue":"2025-04-01","amlScreeningStatus":"clear","pepStatus":false,"thirdPartyDetermination":false,"consentToMarket":false,"documentationOnFile":["passport","proof_of_address","corporate_docs","divorce_decree"]},"relationship":{"advisorId":"advisor_001","clientSince":"2015-09-01","segment":"hni","nps":8,"lastMeetingDate":"2024-11-20","lastMeetingNotes":"Considering selling business in 2 years. Wants RRSP-to-RRIF conversion timeline and estate optimization.","nextMeetingScheduled":"2025-02-23","referralSource":"accountant","tags":["retirement_imminent","business_owner","estate_planning","rrsp_to_rrif"]},"meetingHistory":[{"date":"2024-11-20","summary":"Marcus confirmed retirement target 2027. De-risking strategy discussed. Business sale proceeds est. $1.2-1.8M.","kycUpdates":["investmentHorizon -> 25","riskTolerance confirmed moderate_conservative"],"actionItems":["Model RRIF conversion scenarios","Introduce estate lawyer","Review disability insurance gap"],"advisorNotes":"High prob large cash injection from business sale. Corporate holdco strategy worth exploring. Disability insurance lapsed - he knows."}]}'
);

-- Seed: Jordan Osei
INSERT OR IGNORE INTO clients (id, first_name, last_name, email, phone, segment, kyc_score, aml_status, client_since, last_meeting_date, next_meeting_scheduled, advisor_id, tags, data) VALUES (
    'client_003',
    'Jordan',
    'Osei',
    NULL,
    '+1-514-555-0796',
    NULL,
    8,
    'pending',
    '2025-02-10',
    NULL,
    '2025-02-23',
    'advisor_001',
    '["new_client","onboarding","kyc_incomplete"]',
    '{"id":"client_003","personal":{"firstName":"Jordan","lastName":"Osei","dateOfBirth":null,"sin":null,"phone":"+1-514-555-0796","email":null,"preferredContactMethod":null,"address":{"street":null,"city":null,"province":null,"postalCode":null,"country":"Canada"},"citizenship":null,"residencyStatus":null,"language":null},"employment":{"status":null,"employer":null,"occupation":null,"industry":null,"annualIncome":null,"incomeLastVerified":null,"sourceOfWealth":null,"otherIncomeSources":[]},"family":{"maritalStatus":null,"spouseName":null,"spouseIncome":null,"dependants":null,"dependantAges":[]},"financialSituation":{"netWorth":null,"liquidAssets":null,"realEstateValue":null,"totalLiabilities":null,"monthlyExpenses":null,"emergencyFundMonths":null,"hasWill":null,"willLastUpdated":null,"hasPOA":null,"lifeInsuranceCoverage":null,"disabilityInsurance":null},"investmentProfile":{"riskTolerance":null,"riskToleranceLastReviewed":null,"investmentHorizon":null,"investmentObjective":null,"esgPreference":null,"preferredAssetClasses":[],"restrictedSectors":[],"knowledgeLevel":null},"accounts":[],"kyc":{"kycCompletedDate":null,"kycLastReviewedDate":null,"kycNextReviewDue":null,"amlScreeningStatus":"pending","pepStatus":null,"thirdPartyDetermination":null,"consentToMarket":null,"documentationOnFile":[]},"relationship":{"advisorId":"advisor_001","clientSince":"2025-02-10","segment":null,"nps":null,"lastMeetingDate":null,"lastMeetingNotes":"First contact by phone. Referred by Marcus Webb. Young professional, just started first full-time job.","nextMeetingScheduled":"2025-02-23","referralSource":"Marcus Webb (client_002)","tags":["new_client","onboarding","kyc_incomplete"]},"meetingHistory":[]}'
);
