// ============================================================
// SECTOR PROFILES — DCF assumption defaults by industry
// Benchmarked against Damodaran industry averages (NYU Stern)
// ============================================================
const SECTOR_PROFILES = {
    software: {
        label: 'Software / Internet',
        targetOpMargin: 0.20,       // 20% GAAP op margin long-term (SaaS at scale)
        exitMultiple:   25,          // EV/EBIT — premium for recurring revenue
        fcfConversionDefault: 0.90,  // minimal capex, high D&A addback
        defaultGrowth:  0.12,
        terminalGrowth: 0.03,
        waccBounds: [0.08, 0.14],
    },
    semiconductor: {
        label: 'Semiconductors',
        targetOpMargin: 0.25,
        exitMultiple:   22,
        fcfConversionDefault: 0.70,  // moderate capex (fabs) or low (fabless)
        defaultGrowth:  0.10,
        terminalGrowth: 0.03,
        waccBounds: [0.08, 0.14],
    },
    hardware: {
        label: 'Hardware / Electronics',
        targetOpMargin: 0.12,
        exitMultiple:   16,
        fcfConversionDefault: 0.75,
        defaultGrowth:  0.07,
        terminalGrowth: 0.03,
        waccBounds: [0.07, 0.13],
    },
    pharma: {
        label: 'Pharmaceuticals',
        targetOpMargin: 0.20,
        exitMultiple:   18,
        fcfConversionDefault: 0.75,
        defaultGrowth:  0.07,
        terminalGrowth: 0.03,
        waccBounds: [0.07, 0.12],
    },
    biotech: {
        label: 'Biotechnology',
        targetOpMargin: 0.15,
        exitMultiple:   20,
        fcfConversionDefault: 0.70,
        defaultGrowth:  0.15,
        terminalGrowth: 0.03,
        waccBounds: [0.09, 0.15],
    },
    healthcare: {
        label: 'Healthcare Services',
        targetOpMargin: 0.10,
        exitMultiple:   16,
        fcfConversionDefault: 0.70,
        defaultGrowth:  0.07,
        terminalGrowth: 0.03,
        waccBounds: [0.06, 0.11],
    },
    financial: {
        label: 'Banks / Financial Services',
        targetOpMargin: 0.25,
        exitMultiple:   12,
        fcfConversionDefault: 0.80,
        defaultGrowth:  0.05,
        terminalGrowth: 0.025,
        waccBounds: [0.07, 0.12],
    },
    energy: {
        label: 'Energy / Oil & Gas',
        targetOpMargin: 0.15,
        exitMultiple:   10,
        fcfConversionDefault: 0.55,  // capex-heavy
        defaultGrowth:  0.04,
        terminalGrowth: 0.02,
        waccBounds: [0.07, 0.12],
    },
    utilities: {
        label: 'Utilities',
        targetOpMargin: 0.18,
        exitMultiple:   14,
        fcfConversionDefault: 0.50,  // very capex-heavy
        defaultGrowth:  0.03,
        terminalGrowth: 0.02,
        waccBounds: [0.06, 0.10],
    },
    retail: {
        label: 'Retail',
        targetOpMargin: 0.06,
        exitMultiple:   14,
        fcfConversionDefault: 0.70,
        defaultGrowth:  0.05,
        terminalGrowth: 0.025,
        waccBounds: [0.07, 0.12],
    },
    consumer: {
        label: 'Consumer Goods / Food & Beverage',
        targetOpMargin: 0.13,
        exitMultiple:   17,
        fcfConversionDefault: 0.75,
        defaultGrowth:  0.05,
        terminalGrowth: 0.025,
        waccBounds: [0.06, 0.11],
    },
    industrial: {
        label: 'Industrial / Manufacturing',
        targetOpMargin: 0.11,
        exitMultiple:   14,
        fcfConversionDefault: 0.65,
        defaultGrowth:  0.05,
        terminalGrowth: 0.025,
        waccBounds: [0.07, 0.12],
    },
    telecom: {
        label: 'Telecommunications',
        targetOpMargin: 0.15,
        exitMultiple:   14,
        fcfConversionDefault: 0.55,  // capex-heavy infrastructure
        defaultGrowth:  0.04,
        terminalGrowth: 0.02,
        waccBounds: [0.06, 0.11],
    },
    media: {
        label: 'Media / Entertainment',
        targetOpMargin: 0.15,
        exitMultiple:   16,
        fcfConversionDefault: 0.70,
        defaultGrowth:  0.06,
        terminalGrowth: 0.025,
        waccBounds: [0.07, 0.12],
    },
    realestate: {
        label: 'Real Estate / REITs',
        targetOpMargin: 0.28,
        exitMultiple:   18,
        fcfConversionDefault: 0.65,
        defaultGrowth:  0.04,
        terminalGrowth: 0.025,
        waccBounds: [0.06, 0.11],
    },
    transportation: {
        label: 'Transportation / Logistics',
        targetOpMargin: 0.10,
        exitMultiple:   12,
        fcfConversionDefault: 0.55,
        defaultGrowth:  0.05,
        terminalGrowth: 0.025,
        waccBounds: [0.07, 0.12],
    },
    default: {
        label: 'General Business',
        targetOpMargin: 0.12,
        exitMultiple:   15,
        fcfConversionDefault: 0.65,
        defaultGrowth:  0.08,
        terminalGrowth: 0.03,
        waccBounds: [0.06, 0.15],
    },
};

function getSectorFromSIC(sicCode, sicDescription) {
    const sic  = parseInt(sicCode) || 0;
    const desc = (sicDescription || '').toLowerCase();

    // Software / Internet / Data Processing
    if ((sic >= 7370 && sic <= 7379) || desc.includes('software') || desc.includes('internet') || desc.includes('data processing') || desc.includes('prepackaged')) return 'software';
    // Semiconductors
    if (sic === 3674 || sic === 3672 || sic === 3679 || desc.includes('semiconductor') || desc.includes('integrated circuit')) return 'semiconductor';
    // Hardware / Electronics
    if ((sic >= 3570 && sic <= 3579) || (sic >= 3669 && sic <= 3679) || (sic >= 3810 && sic <= 3829) || desc.includes('computer hardware') || desc.includes('electronic component')) return 'hardware';
    // Biotechnology
    if (sic === 2836 || sic === 8731 || desc.includes('biotech') || desc.includes('biological product')) return 'biotech';
    // Pharmaceuticals
    if ((sic >= 2830 && sic <= 2835) || desc.includes('pharmaceutical') || desc.includes('drug store') || desc.includes('medicinal')) return 'pharma';
    // Healthcare Services
    if ((sic >= 8000 && sic <= 8099) || desc.includes('hospital') || desc.includes('health service') || desc.includes('medical lab')) return 'healthcare';
    // Banking / Financial Services
    if ((sic >= 6020 && sic <= 6299) || (sic >= 6310 && sic <= 6499) || desc.includes('bank') || desc.includes('financial service') || desc.includes('investment trust')) return 'financial';
    // Energy / Oil & Gas
    if ((sic >= 1300 && sic <= 1389) || sic === 2911 || desc.includes('oil') || desc.includes('petroleum') || desc.includes('natural gas') || desc.includes('crude')) return 'energy';
    // Utilities
    if ((sic >= 4900 && sic <= 4999) || desc.includes('electric service') || desc.includes('utility') || desc.includes('water supply') || desc.includes('gas distribution')) return 'utilities';
    // Telecommunications
    if ((sic >= 4810 && sic <= 4899) || desc.includes('telephone') || desc.includes('telecom') || desc.includes('wireless') || desc.includes('cellular')) return 'telecom';
    // Media / Entertainment
    if ((sic >= 2710 && sic <= 2799) || (sic >= 7810 && sic <= 7819) || (sic >= 7920 && sic <= 7929) || desc.includes('media') || desc.includes('entertainment') || desc.includes('broadcast') || desc.includes('publishing')) return 'media';
    // Retail
    if ((sic >= 5200 && sic <= 5999) || desc.includes('retail store') || desc.includes('department store') || desc.includes('grocery')) return 'retail';
    // Consumer Goods / Food
    if ((sic >= 2000 && sic <= 2199) || desc.includes('food') || desc.includes('beverage') || desc.includes('tobacco') || desc.includes('consumer goods')) return 'consumer';
    // Real Estate
    if ((sic >= 6500 && sic <= 6552) || desc.includes('real estate') || desc.includes('reit')) return 'realestate';
    // Transportation
    if ((sic >= 4000 && sic <= 4799) || desc.includes('airline') || desc.includes('railroad') || desc.includes('trucking') || desc.includes('shipping') || desc.includes('freight')) return 'transportation';
    // Industrial / Manufacturing (broad catch-all)
    if ((sic >= 2000 && sic <= 3999) || (sic >= 1000 && sic <= 1499) || desc.includes('manufactur') || desc.includes('industrial') || desc.includes('mining')) return 'industrial';

    return 'default';
}

// ============================================================
// DCF VALUATION ENGINE
// ============================================================
async function runDCF(symbol, overrides) {
    overrides = overrides || {};
    const output = document.getElementById('analysisOutput');
    output.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><br>Fetching financial data for ' + symbol + '...</div>';

    try {
        // Fetch all required data in parallel
        const [financialsRes, detailsRes, analyticsRes, quoteRes] = await Promise.all([
            fetch(`${apiBaseURL}/api/stock/${symbol}/financials?limit=12`).then(r => r.json()),
            fetch(`${apiBaseURL}/api/stock/${symbol}/details`).then(r => r.json()),
            fetch(`${apiBaseURL}/api/stock/${symbol}/analytics`).then(r => r.json()),
            fetch(`${apiBaseURL}/api/stock/${symbol}/comprehensive`).then(r => r.json())
        ]);

        const financials = financialsRes.financials || financialsRes || [];
        const details = detailsRes || {};
        const analytics = analyticsRes.analytics || analyticsRes || {};
        const quote = quoteRes.quote || quoteRes || {};
        // Use prevClose as fallback when price is 0 (market closed / weekends)
        const rawPrice = quote.price || 0;
        const currentPrice = (rawPrice > 0 ? rawPrice : (quote.prevClose || quote.prev_close || 0)) || details.lastPrice || 0;
        const marketCap = details.marketCap || 0;
        const sharesOutstanding = details.weightedSharesOutstanding || details.shareClassSharesOutstanding || 0;
        const companyName = details.name || symbol;
        const beta = analytics.beta || 1.0;

        // --- Sector classification ---
        const sicCode = details.sicCode || '';
        const sicDescription = details.sicDescription || '';
        const sectorKey = getSectorFromSIC(sicCode, sicDescription);
        const sectorProfile = SECTOR_PROFILES[sectorKey];

        if (!financials.length || financials.length < 2) {
            output.innerHTML = `<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>Insufficient financial data for ${symbol}. Need at least 2 quarters of data.</div>`;
            return;
        }

        // Filter to quarterly only
        const quarterly = financials.filter(f => f.fiscalPeriod !== 'FY');
        if (quarterly.length < 2) {
            output.innerHTML = `<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>Insufficient quarterly financial data for ${symbol}.</div>`;
            return;
        }

        // --- STEP 1: Historical Metrics ---
        const recentQ = quarterly.slice(0, Math.min(4, quarterly.length));
        const ttmRevenue = recentQ.reduce((s, q) => s + (q.revenues || 0), 0);
        const ttmOpIncome = recentQ.reduce((s, q) => s + (q.operatingIncome || 0), 0);
        const ttmNetIncome = recentQ.reduce((s, q) => s + (q.netIncome || 0), 0);
        const ttmCashFlow = recentQ.reduce((s, q) => s + (q.cashFlow || 0), 0); // net_cash_flow (all activities) — kept for raw CSV export only
        const ttmOperatingCF = recentQ.reduce((s, q) => s + (q.operatingCashFlow || 0), 0);
        const ttmCapEx = recentQ.reduce((s, q) => s + (q.capEx || 0), 0); // net_cash_flow_from_investing_activities (typically negative)
        // True FCF = Operating CF - CapEx spending. capEx field is investing CF (negative), so adding it subtracts capex.
        const ttmTrueFCF = ttmOperatingCF + ttmCapEx;
        let avgOpMargin = ttmRevenue > 0 ? ttmOpIncome / ttmRevenue : 0.15;

        // For companies with negative operating margins, use a floor that mean-reverts
        // toward a modest positive margin over the projection period
        const hasNegativeMargin = avgOpMargin < 0;
        const dcfWarnings = [];

        if (hasNegativeMargin) {
            dcfWarnings.push(`Current TTM operating margin is ${(avgOpMargin * 100).toFixed(1)}% (negative). The model assumes margin improvement toward profitability over 5 years.`);
        }

        // YoY growth rates
        const growthRates = [];
        for (let i = 0; i < quarterly.length - 4; i++) {
            const current = quarterly[i].revenues;
            const yearAgo = quarterly[i + 4]?.revenues;
            if (current && yearAgo && yearAgo > 0) {
                growthRates.push((current - yearAgo) / yearAgo);
            }
        }
        let historicalGrowth = growthRates.length > 0
            ? growthRates.reduce((s, g) => s + g, 0) / growthRates.length
            : sectorProfile.defaultGrowth;
        historicalGrowth = clamp(historicalGrowth, -0.05, 0.30);

        // Apply user overrides
        if (overrides.revenueGrowth != null) historicalGrowth = overrides.revenueGrowth;
        if (overrides.opMargin != null) avgOpMargin = overrides.opMargin;

        // --- STEP 2: Revenue Projections (5 years) ---
        const terminalGrowthRate = overrides.terminalGrowth != null ? overrides.terminalGrowth : sectorProfile.terminalGrowth;
        const projections = [];
        let prevRevenue = ttmRevenue;

        // For all companies, mean-revert toward the sector's long-run operating margin
        const targetMargin = sectorProfile.targetOpMargin;

        for (let yr = 1; yr <= 5; yr++) {
            const blendedGrowth = historicalGrowth * (1 - yr / 6) + terminalGrowthRate * (yr / 6);
            const revenue = prevRevenue * (1 + blendedGrowth);

            let opMargin;
            if (hasNegativeMargin) {
                // For negative-margin companies, linearly interpolate toward target margin
                // This assumes the company is working toward profitability
                opMargin = avgOpMargin + (targetMargin - avgOpMargin) * (yr / 5);
            } else {
                opMargin = avgOpMargin * (1 - yr * 0.01) + targetMargin * (yr * 0.01); // mild mean reversion
            }

            const opIncome = revenue * opMargin;

            // FCF conversion ratio: use operating cash flow / operating income if available
            // For negative operating income companies, use operating cash flow directly if positive
            let fcf;
            if (hasNegativeMargin && ttmTrueFCF > 0) {
                // Company generates true FCF despite negative GAAP op income (common for high-SBC growth companies like SNOW)
                const fcfMargin = ttmRevenue > 0 ? ttmTrueFCF / ttmRevenue : 0.05;
                const projectedFCFMargin = fcfMargin + (0.12 - fcfMargin) * (yr / 5); // mean-revert toward 12%
                fcf = revenue * Math.max(projectedFCFMargin, opMargin * 0.70);
            } else if (opIncome > 0) {
                // Use true FCF (operatingCF - capEx) / opIncome for conversion ratio; fall back to sector default
                const fcfRatio = ttmOpIncome > 0 ? clamp(ttmTrueFCF / ttmOpIncome, 0.3, 1.0) : sectorProfile.fcfConversionDefault;
                fcf = opIncome * fcfRatio;
            } else {
                // Negative FCF — use sector default conversion on the loss
                fcf = opIncome * sectorProfile.fcfConversionDefault; // will be negative
            }

            projections.push({ year: yr, revenue, growth: blendedGrowth, opMargin, opIncome, fcf });
            prevRevenue = revenue;
        }

        // --- STEP 3: WACC ---
        const riskFreeRate = 0.045;
        const equityRiskPremium = 0.055;
        const costOfEquity = riskFreeRate + beta * equityRiskPremium;
        const latestFinancial = quarterly[0];

        // Use long-term debt (financial debt) instead of total liabilities
        // Total liabilities includes accounts payable, deferred revenue, lease obligations, etc.
        // which shouldn't be treated as financial debt in WACC or net debt calculations
        const longTermDebt = latestFinancial.longTermDebt || 0;
        const nonCurrentLiabilities = latestFinancial.nonCurrentLiabilities || 0;
        // Best estimate of financial debt: long-term debt if available, otherwise non-current liabilities
        // Fallback: 40% of total liabilities (industry average for non-financial companies)
        const financialDebt = longTermDebt > 0 ? longTermDebt :
                              nonCurrentLiabilities > 0 ? nonCurrentLiabilities * 0.70 :
                              (latestFinancial.liabilities || 0) * 0.40;

        const totalEquity = latestFinancial.equity || 1; // book equity (kept for reference)
        // Use market-value weights for WACC (theoretically correct; book equity is distorted by buybacks/intangibles)
        const mvEquity = Math.max(marketCap, 1);
        const mvDebt = Math.max(financialDebt, 0);
        const totalCapital = mvEquity + mvDebt;
        const equityWeight = mvEquity / totalCapital;
        const debtWeight = mvDebt / totalCapital;
        const costOfDebt = riskFreeRate + 0.02;
        const taxRate = 0.21;
        const waccCalc = clamp(equityWeight * costOfEquity + debtWeight * costOfDebt * (1 - taxRate), sectorProfile.waccBounds[0], sectorProfile.waccBounds[1]);
        const wacc = overrides.wacc != null ? overrides.wacc : waccCalc;

        // --- STEP 4: Terminal Value ---
        const lastFCF = projections[4].fcf;
        const lastOpIncome = projections[4].opIncome;

        // Guard against negative terminal values
        const tvPerpGrowth = lastFCF > 0
            ? lastFCF * (1 + terminalGrowthRate) / (wacc - terminalGrowthRate)
            : 0; // Don't capitalize negative cash flows into perpetuity
        const exitMultiple = overrides.exitMultiple != null ? overrides.exitMultiple : sectorProfile.exitMultiple;
        const tvExitMultiple = lastOpIncome > 0 ? lastOpIncome * exitMultiple : 0;

        let terminalValue;
        if (tvPerpGrowth > 0 && tvExitMultiple > 0) {
            terminalValue = (tvPerpGrowth + tvExitMultiple) / 2; // blend both
        } else if (tvPerpGrowth > 0) {
            terminalValue = tvPerpGrowth;
        } else if (tvExitMultiple > 0) {
            terminalValue = tvExitMultiple;
        } else {
            // Both negative — company isn't projected to be profitable by Year 5
            // Use revenue multiple as last resort (2x Year 5 revenue as conservative EV)
            terminalValue = projections[4].revenue * 2;
            dcfWarnings.push('Terminal value based on revenue multiple (2x) because projected FCF and operating income remain negative in Year 5.');
        }

        // --- STEP 5: DCF ---
        let pvFCFs = 0;
        projections.forEach(p => { pvFCFs += p.fcf / Math.pow(1 + wacc, p.year); });
        const pvTerminal = terminalValue / Math.pow(1 + wacc, 5);
        const enterpriseValue = pvFCFs + pvTerminal;

        // Estimate cash: use current assets as proxy (includes cash, receivables, inventory)
        // A better proxy is ~50% of current assets for cash + short-term investments
        const currentAssets = latestFinancial.currentAssets || 0;
        const estCash = currentAssets > 0
            ? currentAssets * 0.50
            : (latestFinancial.assets || 0) * 0.10; // fallback

        // Net debt = financial debt - cash (not total liabilities)
        const netDebt = financialDebt - estCash;
        // If net cash position (netDebt < 0), ADD cash to equity value
        const equityValue = enterpriseValue - netDebt;
        const fairValue = sharesOutstanding > 0 ? Math.max(equityValue / sharesOutstanding, 0) : 0;
        const upside = currentPrice > 0 ? ((fairValue - currentPrice) / currentPrice) * 100 : 0;

        if (fairValue <= 0) {
            dcfWarnings.push('DCF model produces a non-positive equity value. This typically occurs for highly leveraged or unprofitable companies. Consider adjusting growth or margin assumptions.');
        }

        let verdict, verdictClass;
        if (upside > 15) { verdict = 'UNDERVALUED'; verdictClass = 'undervalued'; }
        else if (upside > -15) { verdict = 'FAIRLY VALUED'; verdictClass = 'fairly-valued'; }
        else { verdict = 'OVERVALUED'; verdictClass = 'overvalued'; }

        // --- STEP 6: Sensitivity Table ---
        const waccRange = [];
        for (let w = wacc - 0.015; w <= wacc + 0.0151; w += 0.005) waccRange.push(w);
        const growthRange = [0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045];
        const sensTable = waccRange.map(w => growthRange.map(g => {
            // Guard: if lastFCF is negative, perpetuity growth model breaks — use exit multiple only
            const tvPerp = lastFCF > 0 ? lastFCF * (1 + g) / (w - g) : 0;
            const tvExit = lastOpIncome > 0 ? tvExitMultiple : 0;
            let tvBlend;
            if (tvPerp > 0 && tvExit > 0) tvBlend = (tvPerp + tvExit) / 2;
            else if (tvPerp > 0) tvBlend = tvPerp;
            else if (tvExit > 0) tvBlend = tvExit;
            else tvBlend = projections[4].revenue * 2; // revenue multiple fallback
            let pv = 0;
            projections.forEach(p => { pv += p.fcf / Math.pow(1 + w, p.year); });
            pv += tvBlend / Math.pow(1 + w, 5);
            const eq = pv - netDebt; // netDebt can be negative (net cash), which adds value
            return sharesOutstanding > 0 ? Math.max(eq / sharesOutstanding, 0) : 0;
        }));

        // --- RENDER ---
        renderDCFOutput(symbol, companyName, currentPrice, marketCap, sharesOutstanding, beta,
            ttmRevenue, ttmOpIncome, ttmNetIncome, ttmTrueFCF, avgOpMargin, historicalGrowth,
            projections, wacc, costOfEquity, costOfDebt, equityWeight, debtWeight, riskFreeRate, taxRate,
            tvPerpGrowth, tvExitMultiple, terminalValue, pvFCFs, pvTerminal, enterpriseValue,
            netDebt, equityValue, fairValue, upside, verdict, verdictClass,
            sensTable, waccRange, growthRange, quarterly, dcfWarnings, sectorProfile, exitMultiple, terminalGrowthRate);

    } catch (err) {
        console.error('DCF Error:', err);
        output.innerHTML = `<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>Error running DCF for ${symbol}: ${err.message}</div>`;
    }
}

function renderDCFOutput(symbol, companyName, currentPrice, marketCap, sharesOut, beta,
    ttmRev, ttmOp, ttmNet, ttmFCF, avgMargin, histGrowth,
    projections, wacc, coe, cod, eqW, debtW, rf, taxR,
    tvPerp, tvExit, tv, pvFCFs, pvTV, ev, netDebt, eqVal, fairVal, upside, verdict, verdictClass,
    sensTable, waccRange, growthRange, quarterly, dcfWarnings, sectorProfile, exitMultiple, terminalGrowthRate) {
    sectorProfile = sectorProfile || SECTOR_PROFILES.default;
    exitMultiple  = exitMultiple  || sectorProfile.exitMultiple;
    terminalGrowthRate = terminalGrowthRate || sectorProfile.terminalGrowth;

    const output = document.getElementById('analysisOutput');

    // Historical margin data for chart
    const marginData = quarterly.slice(0, 8).reverse().filter(q => q.revenues > 0).map(q => ({
        label: `${q.fiscalPeriod} ${q.fiscalYear}`,
        margin: (q.operatingIncome / q.revenues) * 100
    }));

    output.innerHTML = `
    <!-- VERDICT -->
    <div class="result-card span-2 verdict-card">
        <div class="verdict-badge ${verdictClass}">${verdict}</div>
        <div class="verdict-price" style="color: ${upside >= 0 ? '#28a745' : '#dc3545'};">${fmtCur(fairVal)}</div>
        <div class="verdict-detail">DCF Fair Value vs Current Price of ${fmtCur(currentPrice)} &mdash; ${fmtPct(upside)} ${upside >= 0 ? 'Upside' : 'Downside'}</div>
    </div>

    ${dcfWarnings && dcfWarnings.length > 0 ? `
    <div class="result-card span-2" style="border-left:3px solid #f0ad4e;background:rgba(240,173,78,0.08);">
        <h3 style="color:#f0ad4e;margin-bottom:0.5rem;"><i class="fas fa-exclamation-triangle"></i> Model Caveats</h3>
        <ul style="margin:0;padding-left:1.2rem;font-size:0.85rem;opacity:0.85;">
            ${dcfWarnings.map(w => `<li style="margin-bottom:0.3rem;">${w}</li>`).join('')}
        </ul>
    </div>` : ''}

    <div class="result-grid">
        <!-- COMPANY OVERVIEW -->
        <div class="result-card">
            <h3><i class="fas fa-building"></i> Company Overview</h3>
            <div class="metrics-row">
                <div class="metric-item"><div class="metric-label">Ticker</div><div class="metric-value">${symbol}</div></div>
                <div class="metric-item"><div class="metric-label">Price</div><div class="metric-value">${fmtCur(currentPrice)}</div></div>
                <div class="metric-item"><div class="metric-label">Market Cap</div><div class="metric-value">${fmtBig(marketCap)}</div></div>
                <div class="metric-item"><div class="metric-label">Beta</div><div class="metric-value">${fmt(beta)}</div></div>
            </div>
            <table class="val-table">
                <tr><td>Company</td><td class="highlight">${companyName}</td></tr>
                <tr><td>Sector (SIC-based)</td><td class="highlight">${sectorProfile.label}</td></tr>
                <tr><td>Shares Outstanding</td><td>${fmtBig(sharesOut)}</td></tr>
                <tr><td>TTM Revenue</td><td>${fmtBig(ttmRev)}</td></tr>
                <tr><td>TTM Operating Income</td><td>${fmtBig(ttmOp)}</td></tr>
                <tr><td>TTM Net Income</td><td>${fmtBig(ttmNet)}</td></tr>
                <tr><td>TTM Free Cash Flow</td><td>${fmtBig(ttmFCF)}</td></tr>
            </table>
        </div>

        <!-- WACC -->
        <div class="result-card">
            <h3><i class="fas fa-percentage"></i> WACC Calculation</h3>
            <table class="val-table">
                <tr><td>Risk-Free Rate (10Y Treasury)</td><td>${fmtPct(rf * 100)}</td></tr>
                <tr><td>Beta</td><td>${fmt(beta)}</td></tr>
                <tr><td>Equity Risk Premium</td><td>5.50%</td></tr>
                <tr><td>Cost of Equity (CAPM)</td><td class="highlight">${fmtPct(coe * 100)}</td></tr>
                <tr><td>Cost of Debt (est.)</td><td>${fmtPct(cod * 100)}</td></tr>
                <tr><td>Tax Rate</td><td>${(taxR * 100).toFixed(0)}%</td></tr>
                <tr><td>Equity Weight</td><td>${fmtPct(eqW * 100)}</td></tr>
                <tr><td>Debt Weight</td><td>${fmtPct(debtW * 100)}</td></tr>
                <tr><td style="font-weight:700;border-top:1px solid rgba(255,255,255,0.15);">WACC</td><td class="highlight" style="border-top:1px solid rgba(255,255,255,0.15);">${fmtPct(wacc * 100)}</td></tr>
            </table>
        </div>

        <!-- REVENUE PROJECTIONS -->
        <div class="result-card">
            <h3><i class="fas fa-chart-line"></i> 5-Year Revenue Projection</h3>
            <table class="val-table">
                <thead><tr><th>Year</th><th>Revenue</th><th>Growth</th><th>Op Margin</th><th>Op Income</th><th>FCF</th></tr></thead>
                <tbody>
                    <tr><td>Base (TTM)</td><td>${fmtBig(ttmRev)}</td><td>-</td><td>${(avgMargin * 100).toFixed(1)}%</td><td>${fmtBig(ttmOp)}</td><td>${fmtBig(ttmFCF)}</td></tr>
                    ${projections.map(p => `<tr>
                        <td>Year ${p.year}</td>
                        <td>${fmtBig(p.revenue)}</td>
                        <td class="${p.growth >= 0 ? 'positive' : 'negative'}">${fmtPct(p.growth * 100)}</td>
                        <td>${(p.opMargin * 100).toFixed(1)}%</td>
                        <td>${fmtBig(p.opIncome)}</td>
                        <td>${fmtBig(p.fcf)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="chart-box"><canvas id="revenueChart"></canvas></div>
        </div>

        <!-- OPERATING MARGIN TREND -->
        <div class="result-card">
            <h3><i class="fas fa-chart-area"></i> Operating Margin Trend</h3>
            <div class="chart-box"><canvas id="marginChart"></canvas></div>
        </div>

        <!-- TERMINAL VALUE -->
        <div class="result-card">
            <h3><i class="fas fa-infinity"></i> Terminal Value & DCF Bridge</h3>
            <table class="val-table">
                <tr><td>Terminal Value (Perpetuity Growth @ ${(terminalGrowthRate * 100).toFixed(1)}%)</td><td>${fmtBig(tvPerp)}</td></tr>
                <tr><td>Terminal Value (Exit Multiple @ ${exitMultiple}x Op Income)</td><td>${fmtBig(tvExit)}</td></tr>
                <tr><td>Blended Terminal Value</td><td class="highlight">${fmtBig(tv)}</td></tr>
                <tr style="border-top:1px solid rgba(255,255,255,0.15);"><td>PV of Projected FCFs</td><td>${fmtBig(pvFCFs)}</td></tr>
                <tr><td>PV of Terminal Value</td><td>${fmtBig(pvTV)}</td></tr>
                <tr><td style="font-weight:700;">Enterprise Value</td><td class="highlight">${fmtBig(ev)}</td></tr>
                <tr><td>${netDebt >= 0 ? 'Less: Net Debt' : 'Plus: Net Cash'}</td><td>${netDebt >= 0 ? '(' + fmtBig(netDebt) + ')' : fmtBig(Math.abs(netDebt))}</td></tr>
                <tr><td style="font-weight:700;">Equity Value</td><td class="highlight">${fmtBig(eqVal)}</td></tr>
                <tr><td style="font-weight:700;">Fair Value Per Share</td><td class="highlight" style="font-size:1.1rem;">${fmtCur(fairVal)}</td></tr>
            </table>
            <div class="chart-box"><canvas id="bridgeChart"></canvas></div>
        </div>

        <!-- SENSITIVITY TABLE -->
        <div class="result-card span-2">
            <h3><i class="fas fa-th"></i> Sensitivity Analysis — Fair Value per Share</h3>
            <p style="font-size:0.8rem;opacity:0.6;margin-bottom:1rem;">Rows = Discount Rate (WACC) &nbsp;|&nbsp; Columns = Terminal Growth Rate</p>
            <div style="overflow-x:auto;">
                <table class="sensitivity-table">
                    <thead><tr><th>WACC \\ Growth</th>${growthRange.map(g => `<th>${(g * 100).toFixed(1)}%</th>`).join('')}</tr></thead>
                    <tbody>
                        ${sensTable.map((row, ri) => {
                            const isCurrentWacc = Math.abs(waccRange[ri] - wacc) < 0.001;
                            return `<tr>${[`<th>${(waccRange[ri] * 100).toFixed(1)}%</th>`, ...row.map((val, ci) => {
                                const pctDiff = currentPrice > 0 ? ((val - currentPrice) / currentPrice) * 100 : 0;
                                let cls = 'cell-yellow';
                                if (pctDiff > 20) cls = 'cell-green';
                                else if (pctDiff > 5) cls = 'cell-light-green';
                                else if (pctDiff > -5) cls = 'cell-yellow';
                                else if (pctDiff > -20) cls = 'cell-orange';
                                else cls = 'cell-red';
                                const isCurrent = isCurrentWacc && Math.abs(growthRange[ci] - 0.03) < 0.001;
                                return `<td class="${cls}${isCurrent ? ' current-cell' : ''}">${fmtCur(val)}</td>`;
                            })].join('')}</tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- ASSUMPTIONS -->
    <div class="assumptions-box">
        <h4><i class="fas fa-info-circle"></i> Key Assumptions & Model Risks</h4>
        <ul>
            <li>Sector classification: <strong>${sectorProfile.label}</strong> (SIC-based) — assumptions benchmarked to industry averages</li>
            <li>Revenue growth decays linearly from ${(histGrowth * 100).toFixed(1)}% historical to ${(terminalGrowthRate * 100).toFixed(1)}% terminal over 5 years</li>
            <li>Operating margins mean-revert toward <strong>${(sectorProfile.targetOpMargin * 100).toFixed(0)}%</strong> long-run sector target (Damodaran industry average)</li>
            <li>FCF conversion ratio based on historical Operating Cash Flow − CapEx relationship; sector default ${(sectorProfile.fcfConversionDefault * 100).toFixed(0)}%</li>
            <li>WACC uses CAPM with 4.5% risk-free rate and 5.5% equity risk premium; clamped to sector range [${(sectorProfile.waccBounds[0]*100).toFixed(0)}%–${(sectorProfile.waccBounds[1]*100).toFixed(0)}%]</li>
            <li>Terminal value is average of perpetuity growth (${(terminalGrowthRate * 100).toFixed(1)}%) and ${exitMultiple}x exit multiple — both sector-calibrated</li>
            <li>Net debt estimated from balance sheet; actual cash position may differ</li>
            <li>Model does not account for one-time items, M&A, or capital structure changes</li>
        </ul>
    </div>

    <!-- DOWNLOAD CSV -->
    <button class="run-btn" onclick="downloadModelCSV('dcf')" style="margin-top:1rem;background:linear-gradient(135deg,#28a745,#20c997);width:100%;">
        <i class="fas fa-download"></i> Download DCF Analysis CSV
    </button>`;

    // --- STORE CSV DATA ---
    storeAnalysisData('dcf', {
        modelName: 'DCF Valuation',
        firmStyle: 'Morgan Stanley Style',
        runDate: new Date().toISOString(),
        ticker: symbol,
        sections: [
            { title: 'Valuation Summary', type: 'metrics', rows: [
                { label: 'Current Price', formatted: fmtCur(currentPrice), formula: 'Polygon.io quote (prevClose fallback)' },
                { label: 'DCF Fair Value', formatted: fmtCur(fairVal), formula: 'Equity Value / Shares Outstanding' },
                { label: 'Upside/Downside', formatted: fmtPct(upside), formula: '(Fair Value - Current Price) / Current Price' },
                { label: 'Verdict', formatted: upside > 15 ? 'UNDERVALUED' : upside < -15 ? 'OVERVALUED' : 'FAIRLY VALUED' }
            ]},
            { title: 'WACC Inputs', type: 'metrics', rows: [
                { label: 'Risk-Free Rate', formatted: fmtPct(rf * 100), formula: '10-Year US Treasury yield' },
                { label: 'Beta', formatted: fmt(beta), formula: 'Market data' },
                { label: 'Equity Risk Premium', formatted: '5.50%', formula: 'Historical average' },
                { label: 'Cost of Equity (CAPM)', formatted: fmtPct(coe * 100), formula: 'Rf + β × ERP' },
                { label: 'Cost of Debt', formatted: fmtPct(cod * 100), formula: 'Estimated from interest coverage' },
                { label: 'Tax Rate', formatted: (taxR * 100).toFixed(0) + '%' },
                { label: 'WACC', formatted: fmtPct(wacc * 100), formula: 'E/(E+D) × CoE + D/(E+D) × CoD × (1-t)' }
            ]},
            { title: '5-Year Revenue Projections', type: 'table',
              headers: ['Year', 'Revenue', 'Growth', 'Op Margin', 'Op Income', 'FCF'],
              rows: [['Base (TTM)', fmtBig(ttmRev), '-', (avgMargin * 100).toFixed(1) + '%', fmtBig(ttmOp), fmtBig(ttmFCF)],
                ...projections.map(p => ['Year ' + p.year, fmtBig(p.revenue), fmtPct(p.growth * 100), (p.opMargin * 100).toFixed(1) + '%', fmtBig(p.opIncome), fmtBig(p.fcf)])]
            },
            { title: 'Terminal Value & Equity Value', type: 'metrics', rows: [
                { label: 'Terminal Value (Perpetuity Growth)', formatted: fmtBig(tvPerp), formula: `FCF₅ × (1+g) / (WACC-g), g=${(terminalGrowthRate*100).toFixed(1)}%` },
                { label: 'Terminal Value (Exit Multiple)', formatted: fmtBig(tvExit), formula: `Year 5 Op Income × ${exitMultiple}x` },
                { label: 'Blended Terminal Value', formatted: fmtBig(tv), formula: 'Average of both methods' },
                { label: 'PV of Projected FCFs', formatted: fmtBig(pvFCFs) },
                { label: 'PV of Terminal Value', formatted: fmtBig(pvTV) },
                { label: 'Enterprise Value', formatted: fmtBig(ev), formula: 'PV(FCFs) + PV(TV)' },
                { label: netDebt >= 0 ? 'Less: Net Debt' : 'Plus: Net Cash', formatted: netDebt >= 0 ? '(' + fmtBig(netDebt) + ')' : fmtBig(Math.abs(netDebt)) },
                { label: 'Equity Value', formatted: fmtBig(eqVal) },
                { label: 'Shares Outstanding', formatted: fmtBig(sharesOut) },
                { label: 'Fair Value Per Share', formatted: fmtCur(fairVal) }
            ]},
            { title: 'Sensitivity Table (Fair Value by WACC × Growth Rate)', type: 'table',
              headers: ['WACC \\ Growth', ...growthRange.map(g => (g * 100).toFixed(1) + '%')],
              rows: sensTable.map((row, ri) => [(waccRange[ri] * 100).toFixed(1) + '%', ...row.map(v => fmtCur(v))])
            },
            { title: 'Raw Quarterly Financial Data', type: 'table',
              headers: ['Period', 'Filing Date', 'Revenue', 'Gross Profit', 'Op Income', 'Net Income', 'Cash Flow', 'Total Assets', 'Equity', 'Liabilities'],
              rows: quarterly.slice(0, 8).map(q => [
                  (q.fiscalPeriod || '') + ' ' + (q.fiscalYear || ''),
                  q.filingDate || q.date || '',
                  q.revenues || 0,
                  q.grossProfit || 0,
                  q.operatingIncome || 0,
                  q.netIncome || 0,
                  q.cashFlow || 0,
                  q.assets || 0,
                  q.equity || 0,
                  q.liabilities || 0
              ])
            }
        ]
    });

    // --- RENDER CHARTS ---
    setTimeout(() => {
        // Revenue projection chart
        const revCtx = document.getElementById('revenueChart');
        if (revCtx) {
            chartInstances.revenue = new Chart(revCtx.getContext('2d'), {
                type: 'bar', data: {
                    labels: ['TTM', ...projections.map(p => `Yr ${p.year}`)],
                    datasets: [{
                        label: 'Revenue', data: [ttmRev, ...projections.map(p => p.revenue)],
                        backgroundColor: 'rgba(254,188,17,0.3)', borderColor: '#febc11', borderWidth: 1
                    }, {
                        label: 'Free Cash Flow', data: [ttmFCF, ...projections.map(p => p.fcf)],
                        backgroundColor: 'rgba(40,167,69,0.3)', borderColor: '#28a745', borderWidth: 1
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#e5e5e5' } } },
                    scales: { x: { ticks: { color: '#aaa' }, grid: { display: false } }, y: { ticks: { color: '#aaa', callback: v => fmtBig(v) }, grid: { color: 'rgba(255,255,255,0.05)' } } }
                }
            });
        }

        // Margin chart
        const marginCtx = document.getElementById('marginChart');
        if (marginCtx && marginData.length > 0) {
            const projMargins = projections.map(p => ({ label: `Yr ${p.year} (Proj)`, margin: p.opMargin * 100 }));
            const allMargins = [...marginData, ...projMargins];
            chartInstances.margin = new Chart(marginCtx.getContext('2d'), {
                type: 'line', data: {
                    labels: allMargins.map(m => m.label),
                    datasets: [{
                        label: 'Operating Margin %', data: allMargins.map(m => m.margin),
                        borderColor: '#febc11', backgroundColor: 'rgba(254,188,17,0.1)', fill: true, tension: 0.3, pointRadius: 4, pointBackgroundColor: '#febc11'
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#e5e5e5' } } },
                    scales: { x: { ticks: { color: '#aaa', maxRotation: 45 }, grid: { display: false } }, y: { ticks: { color: '#aaa', callback: v => v.toFixed(1) + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } } }
                }
            });
        }

        // Bridge chart (waterfall-style bar)
        const bridgeCtx = document.getElementById('bridgeChart');
        if (bridgeCtx) {
            chartInstances.bridge = new Chart(bridgeCtx.getContext('2d'), {
                type: 'bar', data: {
                    labels: ['PV of FCFs', 'PV of Terminal Value', 'Enterprise Value', 'Less Net Debt', 'Equity Value'],
                    datasets: [{
                        data: [pvFCFs, pvTV, ev, -Math.max(netDebt, 0), eqVal],
                        backgroundColor: ['rgba(254,188,17,0.4)', 'rgba(77,171,247,0.4)', 'rgba(254,188,17,0.6)', 'rgba(220,53,69,0.4)', 'rgba(40,167,69,0.5)'],
                        borderColor: ['#febc11', '#4dabf7', '#febc11', '#dc3545', '#28a745'], borderWidth: 1
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                    scales: { x: { ticks: { color: '#aaa' }, grid: { display: false } }, y: { ticks: { color: '#aaa', callback: v => fmtBig(v) }, grid: { color: 'rgba(255,255,255,0.05)' } } }
                }
            });
        }
    }, 100);
}
