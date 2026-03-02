-- Migration 6: Create products table
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- lending|insurance|investment|estate|tax|retirement|protection
    short_description TEXT NOT NULL DEFAULT '',
    full_description TEXT NOT NULL DEFAULT '',
    talking_point TEXT NOT NULL DEFAULT '',
    eligibility_hints TEXT NOT NULL DEFAULT '[]', -- JSON array of plain-English conditions
    urgency_level TEXT NOT NULL DEFAULT 'medium', -- low|medium|high
    canadian_context TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TRIGGER IF NOT EXISTS products_updated_at
    AFTER UPDATE ON products
BEGIN
    UPDATE products SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
END;

-- ── Seed: Product Catalog ──────────────────────────────────────────────────

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'mortgage_new',
    'First Home Mortgage',
    'lending',
    'Competitive fixed/variable rates for first-time buyers',
    'First-time homebuyer mortgage with access to FHSA withdrawal, RRSP Home Buyers'' Plan, and CMHC insured options. Rates reviewed quarterly.',
    'Since you''re looking at getting into the market, we have some really competitive first-time buyer rates right now — and you''d be able to use your FHSA and potentially pull from your RRSP under the Home Buyers'' Plan. Worth running the numbers?',
    '["client mentions wanting to buy a home or first property","client has no real estate on file","client has FHSA account","client mentions saving for a down payment","client is renting and mentions housing costs"]',
    'high',
    'FHSA allows $8,000/year tax-free for first home. RRSP Home Buyers'' Plan allows $35,000 withdrawal.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'mortgage_refinance',
    'Mortgage Refinance / HELOC',
    'lending',
    'Refinance to unlock equity or consolidate debt',
    'Home equity line of credit or refinance for clients with existing property. Can consolidate high-interest debt, fund renovations, or release equity for investing.',
    'With the equity you''ve built up, a HELOC could give you a really flexible credit line — useful whether you''re thinking renovations, helping the kids, or even investing at better rates than a personal loan.',
    '["client owns a home with significant equity","client mentions home renovation or upgrade plans","client mentions helping children with down payment","client mentions consolidating debt","client received income increase and may want to leverage equity"]',
    'medium',
    'HELOC limit is 65% of home value in Canada. Interest is tax-deductible if proceeds used for investment purposes.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'mortgage_income_boost',
    'Mortgage Pre-Approval (Income Event)',
    'lending',
    'New or increased income — revisit borrowing capacity',
    'When a client''s income increases materially, their borrowing capacity changes. A quick pre-approval check may unlock options they thought were out of reach.',
    'With your new salary, your borrowing capacity has gone up meaningfully. If there''s ever been a home or property you had in mind, now''s actually a good time to see what you''d qualify for — even just to know the number.',
    '["client mentions salary increase, promotion, bonus, or new job","client income has not been updated recently","client does not own real estate or is renting","client mentions interest in property market"]',
    'high',
    'Stress test at contract rate + 2% applies. Income change may materially shift qualification.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'life_insurance_new',
    'Life Insurance',
    'insurance',
    'Term or permanent coverage for income replacement',
    'Term life for income replacement during working years; permanent life for estate planning and tax-efficient wealth transfer.',
    'I noticed you don''t have life insurance on file — with dependants in the picture, it''s one of those things that''s easy to put off but really important to have sorted. Even a simple term policy gives your family a real safety net.',
    '["client has dependants and no life insurance on file","client mentions getting married or having a child","client is the primary income earner with a spouse who earns less","client mentions concern about family financial security","lifeInsuranceCoverage is null or 0"]',
    'high',
    'Life insurance proceeds are tax-free to beneficiaries in Canada. Permanent policies offer tax-sheltered growth.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'disability_insurance',
    'Disability Insurance',
    'insurance',
    'Income replacement if unable to work',
    'Individual disability coverage to replace 60–85% of income if illness or injury prevents work. Especially critical for self-employed clients with no group coverage.',
    'Your income is really the engine behind everything — the portfolio, the mortgage, the lifestyle. Disability insurance is the thing that keeps all of that intact if something unexpected happens. A lot of people are surprised how affordable it is relative to the protection it gives.',
    '["client is self-employed or a business owner","disabilityInsurance is false or null","client recently received income increase","client mentions physical job or health concern","client relies solely on earned income"]',
    'high',
    'Self-employed individuals have no EI disability coverage. Individual DI premiums are not tax-deductible but benefits are tax-free.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'critical_illness',
    'Critical Illness Insurance',
    'insurance',
    'Lump-sum payout on diagnosis of serious illness',
    'Tax-free lump sum paid on diagnosis of covered conditions (cancer, heart attack, stroke, etc.). Can fund treatment, replace income, or pay off debt.',
    'Critical illness is a bit different from disability — it pays a lump sum the moment you''re diagnosed, regardless of whether you go back to work. A lot of clients use it to pay off the mortgage or cover treatment costs that aren''t covered by provincial health plans.',
    '["client mentions family history of illness","client has young children and is primary breadwinner","client expresses concern about health or medical costs","client has high debt load","client age is between 30 and 60"]',
    'medium',
    'CI benefit is received tax-free. Return of premium riders available if never claimed.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'life_insurance_estate',
    'Permanent Life / Estate Bond',
    'insurance',
    'Tax-efficient wealth transfer and estate equalization',
    'Whole life or universal life for HNI clients. Provides tax-sheltered growth, tax-free death benefit, and estate equalization where assets (like property or business) are illiquid.',
    'For someone in your situation, permanent life insurance can actually be a really efficient asset class — the growth inside is tax-sheltered, and the payout to your estate is tax-free. It''s often used as a way to maximize what passes to your kids without triggering a big tax event.',
    '["client net worth over $1M","client is a business owner approaching exit","client has illiquid assets and estate planning concerns","client mentions inheritance or leaving money to children","client is in a high tax bracket and looking for shelters"]',
    'medium',
    'Exempt life insurance policies grow tax-free inside the policy. Death benefit paid tax-free to named beneficiaries.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'tfsa_maximize',
    'TFSA Top-Up',
    'investment',
    'Use new income to maximize TFSA contribution room',
    'After an income event, clients may have cash flow to max their TFSA. Tax-free growth and withdrawal flexibility make it the first account to fill for most Canadians.',
    'Now that your income has gone up, one of the first things I''d suggest is topping up your TFSA if you haven''t maxed it out. The room accumulates every year, so we can figure out exactly how much you can put in and put it to work right away.',
    '["client mentions income increase, bonus, or windfall","TFSA balance is below cumulative contribution limit","client mentions wanting to invest more","client has excess cash in a chequing account"]',
    'medium',
    '2025 TFSA limit is $7,000/year. Cumulative room since 2009 for eligible Canadians can be $95,000+.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'rrsp_contribute',
    'RRSP Contribution (Income Event)',
    'investment',
    'Higher income = higher RRSP deduction opportunity',
    'RRSP contributions reduce taxable income dollar-for-dollar. A salary increase this year means higher contribution room next year and a bigger tax benefit now.',
    'With the salary jump, your RRSP contribution room for next year is going to be higher — and contributing now at your new marginal rate actually gives you a bigger refund than it did before. Worth putting a plan together before year-end.',
    '["client received salary increase or promotion","client income over $100k","RRSP is significantly below contribution limit","client mentions wanting to reduce taxes","client approaching year-end and mentions tax planning"]',
    'medium',
    'RRSP contribution limit is 18% of prior year earned income, max $31,560 in 2025. Contributions reduce taxable income.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'resp_education',
    'RESP — Education Savings',
    'investment',
    'Government grants boost education savings by 20%',
    'Registered Education Savings Plan with 20% Canada Education Savings Grant on first $2,500/year per child = $500 free per year. Lifetime grant limit $7,200 per child.',
    'The RESP is honestly one of the best deals the government offers — they give you 20% back on your contributions, up to $500 a year per child, completely free. For two kids, that''s $1,000 a year in grants. We should make sure you''re capturing all of it.',
    '["client has children under 17","client mentions education costs or university","RESP balance seems low for the age of the children","client mentions saving for children''s future","client does not have an RESP account"]',
    'high',
    'CESG is 20% on first $2,500/year per child. Low-income families eligible for additional Canada Learning Bond up to $2,000.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'fhsa',
    'First Home Savings Account (FHSA)',
    'investment',
    'Tax-free savings for first home purchase',
    'The FHSA combines RRSP and TFSA benefits: contributions are tax-deductible, growth is tax-free, and withdrawals for a qualifying home purchase are tax-free.',
    'If homeownership is on your radar — even a few years out — the FHSA is a no-brainer. You get the tax deduction like an RRSP, the money grows tax-free, and you can pull it out tax-free when you buy. It''s $8,000 a year and you don''t want to leave that room on the table.',
    '["client is a first-time homebuyer or has not owned a home in 4+ years","client mentions saving for a home or down payment","client is under 40","client does not have an FHSA account","client mentions renting and wanting to eventually own"]',
    'high',
    'FHSA: $8,000/year, $40,000 lifetime max. Available to Canadians 18–40. Contributions are tax-deductible. Withdrawals for first home are tax-free.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'esg_portfolio',
    'ESG / Responsible Investing Portfolio',
    'investment',
    'Values-aligned investing without sacrificing returns',
    'ESG-screened portfolios filtering for environmental, social, and governance criteria. Increasingly strong performance track record and available across equity and fixed income.',
    'You mentioned ESG earlier — we actually have some strong options there. The data on performance has gotten a lot better and you''re not giving up returns to invest in line with your values. Want me to walk you through what we''d swap out?',
    '["client mentions ESG, ethical investing, sustainable investing, or values","client expresses concern about climate change or social issues","client mentions avoiding certain sectors","esgPreference is true but current portfolio has no ESG exposure"]',
    'medium',
    'Canada has growing ESG ETF market. Some ESG funds carry slightly higher MERs — worth comparing.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'will_poa',
    'Will & Power of Attorney Review',
    'estate',
    'Essential estate documents — not just for the wealthy',
    'A current will ensures assets pass as intended. A Power of Attorney ensures someone can manage finances if the client is incapacitated. Both should be reviewed after any major life event.',
    'This isn''t something most people think about until it''s urgent, but having an up-to-date will and a power of attorney is genuinely one of the most important things you can do for your family. I can connect you with a lawyer we work with — it''s usually a straightforward process.',
    '["client will is outdated or predates a major life event","hasPOA is false or null","client mentions estate or inheritance","client has had a new child, married, or divorced since last will","client is over 50 and has not updated will in 5+ years"]',
    'high',
    'Without a will in Canada, assets distributed by provincial intestacy rules. POA required for financial decisions during incapacity.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'corporate_holdco',
    'Corporate Investment Account / Holdco',
    'tax',
    'Tax-deferred investing through a corporation',
    'Business owners can use a holding company to invest retained earnings at a lower corporate tax rate before paying personal dividends. Significantly accelerates wealth accumulation.',
    'For someone who owns a business, a holding company structure can be a real advantage — instead of pulling the money out personally and paying full income tax before investing, you invest through the corp at a much lower rate. Worth a conversation with your accountant to see if the structure makes sense for where you''re at.',
    '["client is self-employed or a business owner","client mentions retained earnings or profits in the business","client does not have a corporate investment account","client is approaching a business sale","client mentions high tax bill or wanting to reduce taxes"]',
    'medium',
    'Corporate tax rate on passive income is ~50% in Canada, but SBD rate on active income is ~12%. Holdco defers personal taxation.'
);

INSERT OR IGNORE INTO products (id, name, category, short_description, full_description, talking_point, eligibility_hints, urgency_level, canadian_context) VALUES (
    'retirement_income_plan',
    'Retirement Income Plan / RRIF Conversion',
    'retirement',
    'Convert RRSP to RRIF and optimize drawdown strategy',
    'At 71, Canadians must convert RRSP to RRIF. But optimal drawdown strategy — when to start withdrawals, RRSP meltdown pre-71, CPP deferral — can save significantly in lifetime taxes.',
    'Given your timeline, this is actually a great time to model out your retirement income strategy. When you start drawing from the RRSP, in what order, how you coordinate with CPP — these decisions can have a six-figure impact on lifetime taxes. I''d love to put together a proper plan.',
    '["client mentions retirement within 5 years","client is over 55","client has large RRSP balance","client mentions CPP, OAS, or pension income","client is a business owner considering exit"]',
    'high',
    'RRSP must convert to RRIF by Dec 31 of year client turns 71. CPP deferral to 70 increases benefit by 42%.'
);
