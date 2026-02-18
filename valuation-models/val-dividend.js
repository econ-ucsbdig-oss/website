/**
 * val-dividend.js
 * Dividend Growth Model (Wellington Style) for the UCSB DIG Valuation Analysis Lab.
 * Loaded via <script> tag in valuation.html -- all functions are globally accessible.
 *
 * Uses the Gordon Growth Model: P = D1 / (r - g)
 * Includes dividend sustainability scoring, payout ratio analysis,
 * 10-year income projections (with and without DRIP), and quarterly dividend history.
 *
 * Global utilities available from valuation.html:
 *   fmt(n, dec), fmtCur(n), fmtBig(n), fmtPct(n), clamp(v, lo, hi)
 *   apiBaseURL, chartInstances, storeAnalysisData(modelId, data)
 */

// ============================================================
// DIVIDEND GROWTH MODEL ENGINE
// ============================================================
async function runDividendGrowth(symbol, overrides) {
    overrides = overrides || {};
    const output = document.getElementById('analysisOutput');
    output.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><br>Fetching dividend data for ' + symbol + '...</div>';

    try {
        // -----------------------------------------------------------
        // 1. Fetch all required data in parallel
        //    Uses dedicated Polygon /v3/reference/dividends endpoint
        //    for actual per-share dividend history (cash_flow_statement
        //    dividends_paid field is unreliable / often missing)
        // -----------------------------------------------------------
        const [financialsRes, detailsRes, comprehensiveRes, analyticsRes, dividendsRes] = await Promise.all([
            fetch(`${apiBaseURL}/api/stock/${symbol}/financials?limit=12`).then(r => r.json()),
            fetch(`${apiBaseURL}/api/stock/${symbol}/details`).then(r => r.json()),
            fetch(`${apiBaseURL}/api/stock/${symbol}/comprehensive`).then(r => r.json()),
            fetch(`${apiBaseURL}/api/stock/${symbol}/analytics`).then(r => r.json()),
            fetch(`${apiBaseURL}/api/stock/${symbol}/dividends?limit=20`).then(r => r.json())
        ]);

        const financials = financialsRes.financials || financialsRes || [];
        const details = detailsRes || {};
        const quote = comprehensiveRes.quote || comprehensiveRes || {};
        const analytics = analyticsRes.analytics || analyticsRes || {};
        const rawDividends = dividendsRes.dividends || [];

        // -----------------------------------------------------------
        // 2. Extract current price (use prevClose fallback)
        // -----------------------------------------------------------
        const rawPrice = quote.price || 0;
        const currentPrice = (rawPrice > 0 ? rawPrice : (quote.prevClose || 0)) || 0;

        // -----------------------------------------------------------
        // 3. Filter to quarterly periods only (exclude 'FY')
        // -----------------------------------------------------------
        const quarterly = financials.filter(f => f.fiscalPeriod !== 'FY');

        // -----------------------------------------------------------
        // 4. Build dividend data from dedicated dividends endpoint
        //    Each entry has: cashAmount (per share), payDate, exDividendDate, frequency
        // -----------------------------------------------------------
        const hasDividends = rawDividends.length > 0 && rawDividends.some(d => d.cashAmount > 0);

        if (!hasDividends) {
            output.innerHTML = `
            <div class="result-grid">
                <div class="result-card span-2" style="text-align:center;padding:2.5rem;">
                    <div class="verdict-badge fairly-valued">NO DIVIDENDS DETECTED</div>
                    <div class="verdict-detail" style="margin-top:1rem;">No dividend payments found for ${symbol}. The Dividend Growth Model requires dividend-paying stocks.</div>
                    <div style="margin-top:1rem;color:rgba(255,255,255,0.6);">
                        <p>Consider using:</p>
                        <ul style="list-style:none;padding:0;margin-top:0.5rem;">
                            <li style="padding:0.2rem 0;">DCF Valuation for growth stock valuation</li>
                            <li style="padding:0.2rem 0;">Comparable Company Analysis for relative valuation</li>
                        </ul>
                    </div>
                </div>
            </div>`;
            return;
        }

        // -----------------------------------------------------------
        // 5. Compute all dividend metrics using per-share data
        // -----------------------------------------------------------
        const companyName = details.name || symbol;
        const sharesOutstanding = details.weightedSharesOutstanding || details.shareClassSharesOutstanding || 0;
        const beta = analytics.beta || 1.0;

        // --- Annual DPS from actual dividend payments ---
        // Sum the most recent ~4 payments (quarterly) or ~1 (annual) based on frequency
        const frequency = rawDividends[0]?.frequency || 4; // default quarterly
        const paymentsPerYear = frequency;
        const recentPayments = rawDividends.slice(0, Math.min(paymentsPerYear, rawDividends.length));
        const annualDPS = recentPayments.reduce((s, d) => s + (d.cashAmount || 0), 0);

        // --- Dividend Yield ---
        const dividendYield = currentPrice > 0 ? (annualDPS / currentPrice) * 100 : 0;

        // Build dividendData array for quarterly financial context (for payout ratios, charts)
        const dividendData = quarterly.map(q => {
            // Match dividends to this fiscal quarter by pay date
            const qStart = q.startDate ? new Date(q.startDate) : null;
            const qEnd = q.endDate ? new Date(q.endDate) : null;
            let qDividendPerShare = 0;
            if (qStart && qEnd) {
                rawDividends.forEach(d => {
                    const payDate = d.payDate ? new Date(d.payDate) : null;
                    if (payDate && payDate >= qStart && payDate <= qEnd) {
                        qDividendPerShare += d.cashAmount || 0;
                    }
                });
            }
            return {
                period: q.fiscalPeriod,
                year: q.fiscalYear,
                dividendPerShare: qDividendPerShare,
                dividends: qDividendPerShare * sharesOutstanding, // total dollars for backwards compat
                eps: q.epsDiluted || q.eps || 0,
                cashFlow: q.cashFlow || 0,
                revenues: q.revenues || 0,
                netIncome: q.netIncome || 0,
                liabilities: q.liabilities || 0,
                nonCurrentLiabilities: q.nonCurrentLiabilities || 0,
                longTermDebt: q.longTermDebt || 0,
                equity: q.equity || 0
            };
        });

        // --- TTM EPS ---
        const recentDivQuarters = dividendData.slice(0, Math.min(4, dividendData.length));
        const ttmEPS = recentDivQuarters.reduce((s, q) => s + q.eps, 0);
        const totalDividendsLast4Q = annualDPS * sharesOutstanding; // total dollars paid

        // --- Payout Ratio (Earnings) ---
        let payoutRatio = null;
        let payoutRatioDisplay = 'N/A';
        if (ttmEPS !== 0 && annualDPS > 0) {
            payoutRatio = (annualDPS / ttmEPS) * 100;
            payoutRatioDisplay = Math.min(payoutRatio, 200).toFixed(1) + '%';
            if (payoutRatio > 200) payoutRatioDisplay = '>200%';
            if (payoutRatio < 0) payoutRatioDisplay = 'Negative EPS';
        }

        // --- CF Payout Ratio ---
        const ttmCashFlow = recentDivQuarters.reduce((s, q) => s + q.cashFlow, 0);
        let cfPayoutRatio = null;
        let cfPayoutDisplay = 'N/A';
        if (ttmCashFlow > 0 && totalDividendsLast4Q > 0) {
            cfPayoutRatio = (totalDividendsLast4Q / ttmCashFlow) * 100;
            cfPayoutDisplay = cfPayoutRatio.toFixed(1) + '%';
        }

        // --- Dividend Growth Rate (from actual per-share dividends) ---
        let divGrowthRate = 0.03; // default 3%
        let growthQuartersUsed = rawDividends.length;
        // Use oldest vs newest annual DPS from rawDividends
        if (rawDividends.length >= paymentsPerYear * 2) {
            const latestAnnual = rawDividends.slice(0, paymentsPerYear).reduce((s, d) => s + (d.cashAmount || 0), 0);
            const oldestStart = Math.min(rawDividends.length, paymentsPerYear * 3);
            const oldestAnnual = rawDividends.slice(oldestStart - paymentsPerYear, oldestStart).reduce((s, d) => s + (d.cashAmount || 0), 0);
            if (oldestAnnual > 0 && latestAnnual > 0) {
                const years = (oldestStart - paymentsPerYear) / paymentsPerYear;
                const rawGrowth = Math.pow(latestAnnual / oldestAnnual, 1 / Math.max(years, 0.5)) - 1;
                if (rawGrowth > 0.50 || rawGrowth < -0.50) {
                    divGrowthRate = 0.03; // extreme -> use default
                } else {
                    divGrowthRate = rawGrowth;
                }
            }
        }
        divGrowthRate = clamp(divGrowthRate, -0.10, 0.30);

        // Apply user overrides
        if (overrides.divGrowthRate != null) divGrowthRate = overrides.divGrowthRate;

        // --- Cost of Equity (CAPM) ---
        const riskFreeRate = 0.045;
        const equityRiskPremium = 0.055;
        const costOfEquity = overrides.costOfEquity != null ? overrides.costOfEquity : (riskFreeRate + beta * equityRiskPremium);

        // --- Gordon Growth Model ---
        const d1 = annualDPS * (1 + divGrowthRate);
        let ggmFairValue = null;
        let ggmApplicable = true;
        let upside = 0;

        if (costOfEquity <= divGrowthRate) {
            ggmApplicable = false;
        } else {
            ggmFairValue = d1 / (costOfEquity - divGrowthRate);
            upside = currentPrice > 0 ? ((ggmFairValue - currentPrice) / currentPrice) * 100 : 0;
        }

        // --- 10-Year Income Projection (per $10,000 invested) ---
        const investmentAmount = 10000;
        const sharesBought = currentPrice > 0 ? investmentAmount / currentPrice : 0;
        const projectionYears = [];
        let cumulativeNoDrip = 0;
        let cumulativeDrip = 0;
        let dripShares = sharesBought;

        for (let yr = 1; yr <= 10; yr++) {
            const dpsYear = annualDPS * Math.pow(1 + divGrowthRate, yr);
            const incomeNoDrip = sharesBought * dpsYear;
            const incomeDrip = dripShares * dpsYear;
            cumulativeNoDrip += incomeNoDrip;
            cumulativeDrip += incomeDrip;
            // Reinvest dividends at current price for next year
            if (currentPrice > 0) {
                dripShares += incomeDrip / currentPrice;
            }
            projectionYears.push({
                year: yr,
                dps: dpsYear,
                incomeNoDrip: incomeNoDrip,
                incomeDrip: incomeDrip,
                cumulativeNoDrip: cumulativeNoDrip,
                cumulativeDrip: cumulativeDrip,
                totalSharesDrip: dripShares
            });
        }

        // --- Dividend Safety Score (0-5 stars) ---
        let safetyScore = 0;

        // +1 if payout ratio < 75%
        if (payoutRatio !== null && payoutRatio > 0 && payoutRatio < 75) safetyScore++;

        // +1 if CF payout ratio < 60%
        if (cfPayoutRatio !== null && cfPayoutRatio > 0 && cfPayoutRatio < 60) safetyScore++;

        // +1 if dividend has grown (latest 4Q > earliest 4Q)
        if (dividendData.length >= 8) {
            const latest4Q = dividendData.slice(0, 4).reduce((s, q) => s + q.dividends, 0);
            const earliest4Q = dividendData.slice(-4).reduce((s, q) => s + q.dividends, 0);
            if (latest4Q > earliest4Q) safetyScore++;
        }

        // +1 if FCF covers dividends by 1.5x
        if (ttmCashFlow > 0 && totalDividendsLast4Q > 0 && (ttmCashFlow / totalDividendsLast4Q) > 1.5) {
            safetyScore++;
        }

        // +1 if financial debt-to-equity < 1.5 (use long-term debt or non-current liabilities, not total liabilities)
        const latestQ = dividendData[0] || {};
        const latestFinDebt = latestQ.longTermDebt > 0 ? latestQ.longTermDebt :
                              latestQ.nonCurrentLiabilities > 0 ? latestQ.nonCurrentLiabilities * 0.70 :
                              (latestQ.liabilities || 0) * 0.40;
        if (latestQ.equity > 0 && (latestFinDebt / latestQ.equity) < 1.5) {
            safetyScore++;
        }

        // --- Verdict ---
        let verdict, verdictClass;
        if (!ggmApplicable) {
            verdict = 'GGM NOT APPLICABLE';
            verdictClass = 'fairly-valued';
        } else if (upside > 15) {
            verdict = 'UNDERVALUED';
            verdictClass = 'undervalued';
        } else if (upside > -15) {
            verdict = 'FAIRLY VALUED';
            verdictClass = 'fairly-valued';
        } else {
            verdict = 'OVERVALUED';
            verdictClass = 'overvalued';
        }

        // --- Quarterly payout ratios for chart ---
        const quarterlyPayoutRatios = dividendData.map(q => {
            if (q.eps !== 0 && q.dividends > 0 && sharesOutstanding > 0) {
                const qDPS = q.dividends / sharesOutstanding;
                return { period: q.period + "'" + String(q.year).slice(-2), ratio: (qDPS / q.eps) * 100 };
            }
            return { period: q.period + "'" + String(q.year).slice(-2), ratio: null };
        }).reverse();

        // -----------------------------------------------------------
        // 7. Render output
        // -----------------------------------------------------------
        renderDividendOutput({
            symbol, companyName, currentPrice, sharesOutstanding, beta,
            annualDPS, dividendYield, ttmEPS, payoutRatio, payoutRatioDisplay,
            cfPayoutRatio, cfPayoutDisplay, divGrowthRate, costOfEquity,
            riskFreeRate, equityRiskPremium, d1, ggmFairValue, ggmApplicable,
            upside, verdict, verdictClass, projectionYears,
            safetyScore, dividendData, quarterlyPayoutRatios,
            growthQuartersUsed
        });

        // -----------------------------------------------------------
        // 8. Store CSV data
        // -----------------------------------------------------------
        const csvData = {
            modelName: 'Dividend Growth Model',
            firmStyle: 'Wellington Style',
            runDate: new Date().toISOString(),
            ticker: symbol,
            sections: [
                {
                    title: 'Dividend Summary',
                    type: 'metrics',
                    rows: [
                        { label: 'Company', value: companyName, formatted: companyName },
                        { label: 'Current Price', value: currentPrice, formatted: fmtCur(currentPrice) },
                        { label: 'Shares Outstanding', value: sharesOutstanding, formatted: fmtBig(sharesOutstanding) },
                        { label: 'Annual DPS', value: annualDPS, formatted: '$' + annualDPS.toFixed(4) },
                        { label: 'Dividend Yield', value: dividendYield, formatted: dividendYield.toFixed(2) + '%' },
                        { label: 'Payout Ratio (Earnings)', value: payoutRatio, formatted: payoutRatioDisplay },
                        { label: 'Payout Ratio (Cash Flow)', value: cfPayoutRatio, formatted: cfPayoutDisplay },
                        { label: 'Dividend Growth Rate', value: divGrowthRate * 100, formatted: (divGrowthRate * 100).toFixed(2) + '%' },
                        { label: 'Dividend Safety Score', value: safetyScore, formatted: safetyScore + '/5' }
                    ]
                },
                {
                    title: 'GGM Calculation',
                    type: 'metrics',
                    rows: [
                        { label: 'Current Annual DPS', value: annualDPS, formatted: '$' + annualDPS.toFixed(4), formula: 'Sum last 4Q dividends / shares' },
                        { label: 'Dividend Growth Rate (g)', value: divGrowthRate * 100, formatted: (divGrowthRate * 100).toFixed(2) + '%', formula: 'CAGR of dividend payments' },
                        { label: 'Projected Next Year Dividend (D1)', value: d1, formatted: '$' + d1.toFixed(4), formula: 'DPS x (1 + g)' },
                        { label: 'Risk-Free Rate', value: 4.5, formatted: '4.50%', formula: '10-Year US Treasury' },
                        { label: 'Beta', value: beta, formatted: beta.toFixed(2) },
                        { label: 'Equity Risk Premium', value: 5.5, formatted: '5.50%', formula: 'Historical average' },
                        { label: 'Cost of Equity (r)', value: costOfEquity * 100, formatted: (costOfEquity * 100).toFixed(2) + '%', formula: 'rf + beta x ERP' },
                        { label: 'GGM Fair Value', value: ggmFairValue, formatted: ggmApplicable ? fmtCur(ggmFairValue) : 'N/A', formula: 'D1 / (r - g)' },
                        { label: 'Upside', value: upside, formatted: ggmApplicable ? upside.toFixed(2) + '%' : 'N/A' }
                    ]
                },
                {
                    title: '10-Year Income Projection ($10,000 Invested)',
                    type: 'table',
                    headers: ['Year', 'DPS', 'Income (No DRIP)', 'Income (With DRIP)', 'Cumulative (No DRIP)', 'Cumulative (With DRIP)'],
                    rows: projectionYears.map(p => [
                        'Year ' + p.year,
                        '$' + p.dps.toFixed(4),
                        '$' + p.incomeNoDrip.toFixed(2),
                        '$' + p.incomeDrip.toFixed(2),
                        '$' + p.cumulativeNoDrip.toFixed(2),
                        '$' + p.cumulativeDrip.toFixed(2)
                    ])
                },
                {
                    title: 'Quarterly Dividend History',
                    type: 'table',
                    headers: ['Quarter', 'Total Dividends', 'EPS', 'Cash Flow'],
                    rows: dividendData.map(q => [
                        q.period + ' ' + q.year,
                        '$' + q.dividends.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
                        '$' + q.eps.toFixed(2),
                        fmtBig(q.cashFlow)
                    ])
                },
                {
                    title: 'Raw Financial Data — Quarterly',
                    type: 'table',
                    headers: ['Period', 'Date', 'Revenue', 'Net Income', 'Cash Flow', 'EPS', 'Dividends', 'Shares Outstanding'],
                    rows: quarterly.map(function(q) {
                        return [
                            q.fiscalPeriod + ' ' + q.fiscalYear,
                            q.endDate || q.startDate || '',
                            q.revenues || 0,
                            q.netIncome || 0,
                            q.cashFlow || 0,
                            q.epsDiluted || q.eps || 0,
                            Math.abs(q.dividends || 0),
                            sharesOutstanding
                        ];
                    })
                }
            ]
        };

        storeAnalysisData('dividend', csvData);

    } catch (err) {
        console.error('Dividend Growth Model Error:', err);
        output.innerHTML = `<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>Error running Dividend Growth Model for ${symbol}: ${err.message}</div>`;
    }
}


// ============================================================
// RENDER DIVIDEND OUTPUT
// ============================================================
function renderDividendOutput(data) {
    const {
        symbol, companyName, currentPrice, sharesOutstanding, beta,
        annualDPS, dividendYield, ttmEPS, payoutRatio, payoutRatioDisplay,
        cfPayoutRatio, cfPayoutDisplay, divGrowthRate, costOfEquity,
        riskFreeRate, equityRiskPremium, d1, ggmFairValue, ggmApplicable,
        upside, verdict, verdictClass, projectionYears,
        safetyScore, dividendData, quarterlyPayoutRatios,
        growthQuartersUsed
    } = data;

    const output = document.getElementById('analysisOutput');

    // --- Build safety stars ---
    const starsFilled = safetyScore;
    const starsEmpty = 5 - safetyScore;
    const starsHTML = '<span style="color:#febc11;font-size:1.1rem;">' +
        '\u2605'.repeat(starsFilled) + '</span>' +
        '<span style="color:rgba(255,255,255,0.2);font-size:1.1rem;">' +
        '\u2605'.repeat(starsEmpty) + '</span>' +
        ' <span style="font-size:0.85rem;opacity:0.7;">(' + safetyScore + '/5)</span>';

    // --- Fair value display ---
    let fairValueDisplay, verdictDetailText;
    if (ggmApplicable && ggmFairValue !== null) {
        const priceColor = upside >= 0 ? '#28a745' : '#dc3545';
        fairValueDisplay = `<div class="verdict-price" style="color:${priceColor};">${fmtCur(ggmFairValue)}</div>`;
        verdictDetailText = `GGM Fair Value vs Current Price of ${fmtCur(currentPrice)} &mdash; ${fmtPct(upside)} ${upside >= 0 ? 'Upside' : 'Downside'}`;
    } else {
        fairValueDisplay = `<div class="verdict-price" style="color:#ffc107;">N/A</div>`;
        verdictDetailText = `GGM not applicable &mdash; growth rate (${(divGrowthRate * 100).toFixed(2)}%) exceeds or equals required return (${(costOfEquity * 100).toFixed(2)}%)`;
    }

    // --- Payout ratio class ---
    const payoutClass = payoutRatio !== null ? (payoutRatio < 60 ? 'positive' : (payoutRatio < 90 ? 'highlight' : 'negative')) : '';
    const cfPayoutClass = cfPayoutRatio !== null ? (cfPayoutRatio < 50 ? 'positive' : (cfPayoutRatio < 75 ? 'highlight' : 'negative')) : '';

    // --- Quarterly dividend labels & values for history chart ---
    const historyLabels = dividendData.slice().reverse().map(q => q.period + "'" + String(q.year).slice(-2));
    const historyValues = dividendData.slice().reverse().map(q => q.dividends);

    output.innerHTML = `
    <!-- CARD 1 - VERDICT -->
    <div class="result-grid">
        <div class="result-card span-2 verdict-card">
            <div class="verdict-badge ${verdictClass}">${verdict}</div>
            ${fairValueDisplay}
            <div class="verdict-detail">${verdictDetailText}</div>
        </div>

        <!-- CARD 2 - DIVIDEND SUMMARY TABLE -->
        <div class="result-card">
            <h3><i class="fas fa-hand-holding-usd"></i> Dividend Summary</h3>
            <table class="val-table">
                <tr><td>Current Price</td><td class="highlight">${fmtCur(currentPrice)}</td></tr>
                <tr><td>Annual Dividend/Share</td><td class="highlight">$${annualDPS.toFixed(4)}</td></tr>
                <tr><td>Dividend Yield</td><td class="${dividendYield > 3 ? 'positive' : ''}">${dividendYield.toFixed(2)}%</td></tr>
                <tr><td>Payout Ratio (Earnings)</td><td class="${payoutClass}">${payoutRatioDisplay}</td></tr>
                <tr><td>Payout Ratio (Cash Flow)</td><td class="${cfPayoutClass}">${cfPayoutDisplay}</td></tr>
                <tr><td>Dividend Growth Rate</td><td class="${divGrowthRate > 0 ? 'positive' : 'negative'}">${(divGrowthRate * 100).toFixed(2)}%</td></tr>
                <tr><td>Dividend Safety</td><td>${starsHTML}</td></tr>
            </table>
        </div>

        <!-- CARD 3 - GGM CALCULATION WALKTHROUGH -->
        <div class="result-card">
            <h3><i class="fas fa-calculator"></i> GGM Calculation Walkthrough</h3>
            <table class="val-table">
                <thead><tr><th>Step</th><th>Value</th><th>Formula</th></tr></thead>
                <tbody>
                    <tr>
                        <td>1. Current Annual DPS</td>
                        <td class="highlight">$${annualDPS.toFixed(4)}</td>
                        <td style="color:rgba(255,255,255,0.5);font-size:0.8rem;">Sum of last 4Q dividends / shares out</td>
                    </tr>
                    <tr>
                        <td>2. Dividend Growth Rate (g)</td>
                        <td class="${divGrowthRate > 0 ? 'positive' : 'negative'}">${(divGrowthRate * 100).toFixed(2)}%</td>
                        <td style="color:rgba(255,255,255,0.5);font-size:0.8rem;">CAGR: (latest4Q/oldest4Q)^(1/yrs) - 1</td>
                    </tr>
                    <tr>
                        <td>3. Projected Next Year Div (D\u2081)</td>
                        <td class="highlight">$${d1.toFixed(4)}</td>
                        <td style="color:rgba(255,255,255,0.5);font-size:0.8rem;">DPS \u00d7 (1 + g)</td>
                    </tr>
                    <tr>
                        <td>4. Risk-Free Rate (r\u2093)</td>
                        <td>4.50%</td>
                        <td style="color:rgba(255,255,255,0.5);font-size:0.8rem;">10-Year US Treasury yield</td>
                    </tr>
                    <tr>
                        <td>5. Beta (\u03b2)</td>
                        <td>${beta.toFixed(2)}</td>
                        <td style="color:rgba(255,255,255,0.5);font-size:0.8rem;">From market data</td>
                    </tr>
                    <tr>
                        <td>6. Equity Risk Premium</td>
                        <td>5.50%</td>
                        <td style="color:rgba(255,255,255,0.5);font-size:0.8rem;">Historical average ERP</td>
                    </tr>
                    <tr>
                        <td>7. Cost of Equity (r)</td>
                        <td class="highlight">${(costOfEquity * 100).toFixed(2)}%</td>
                        <td style="color:rgba(255,255,255,0.5);font-size:0.8rem;">r\u2093 + \u03b2 \u00d7 ERP = ${(riskFreeRate * 100).toFixed(1)}% + ${beta.toFixed(2)} \u00d7 5.5%</td>
                    </tr>
                    <tr style="border-top:2px solid rgba(254,188,17,0.3);">
                        <td style="font-weight:700;">8. GGM Fair Value</td>
                        <td class="highlight" style="font-size:1.1rem;">${ggmApplicable ? fmtCur(ggmFairValue) : 'N/A'}</td>
                        <td style="color:rgba(255,255,255,0.5);font-size:0.8rem;">D\u2081 / (r - g) = $${d1.toFixed(4)} / (${(costOfEquity * 100).toFixed(2)}% - ${(divGrowthRate * 100).toFixed(2)}%)</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- CARD 4 - 10-YEAR PROJECTION CHART -->
        <div class="result-card span-2">
            <h3><i class="fas fa-chart-bar"></i> 10-Year Income Projection ($10,000 Invested)</h3>
            <p style="font-size:0.8rem;opacity:0.6;margin-bottom:0.5rem;">
                Shares purchased: ${currentPrice > 0 ? (10000 / currentPrice).toFixed(2) : '0'} @ ${fmtCur(currentPrice)} &nbsp;|&nbsp;
                Growth rate: ${(divGrowthRate * 100).toFixed(2)}% per year
            </p>
            <div style="position:relative;height:300px;"><canvas id="divProjectionChart"></canvas></div>
            <table class="val-table" style="margin-top:1rem;">
                <thead><tr><th>Year</th><th>DPS</th><th>Income (No DRIP)</th><th>Income (DRIP)</th><th>Cumulative (No DRIP)</th><th>Cumulative (DRIP)</th></tr></thead>
                <tbody>
                    ${projectionYears.map(p => `<tr>
                        <td>Year ${p.year}</td>
                        <td>$${p.dps.toFixed(4)}</td>
                        <td>${fmtCur(p.incomeNoDrip)}</td>
                        <td class="positive">${fmtCur(p.incomeDrip)}</td>
                        <td>${fmtCur(p.cumulativeNoDrip)}</td>
                        <td class="positive">${fmtCur(p.cumulativeDrip)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>

        <!-- CARD 5 - QUARTERLY DIVIDEND HISTORY -->
        <div class="result-card">
            <h3><i class="fas fa-history"></i> Quarterly Dividend History</h3>
            <div style="position:relative;height:200px;"><canvas id="divHistoryChart"></canvas></div>
        </div>

        <!-- CARD 6 - PAYOUT RATIO TREND -->
        <div class="result-card">
            <h3><i class="fas fa-tachometer-alt"></i> Payout Ratio Trend</h3>
            <div style="position:relative;height:200px;"><canvas id="divPayoutChart"></canvas></div>
        </div>

        <!-- CARD 7 - ASSUMPTIONS -->
        <div class="result-card span-2" style="border-color:rgba(255,193,7,0.3);">
            <h4 style="color:#ffc107;"><i class="fas fa-info-circle" style="margin-right:0.5rem;"></i>Key Assumptions & Methodology</h4>
            <ul style="color:rgba(255,255,255,0.7);font-size:0.85rem;list-style:none;padding:0;">
                <li style="padding:0.3rem 0;">Gordon Growth Model: P = D\u2081 / (r - g), valid when r > g</li>
                <li style="padding:0.3rem 0;">Risk-free rate: 4.50% (10-Year US Treasury)</li>
                <li style="padding:0.3rem 0;">Equity risk premium: 5.50% (historical average)</li>
                <li style="padding:0.3rem 0;">Growth rate estimated from ${growthQuartersUsed} quarters of dividend history</li>
                <li style="padding:0.3rem 0;">DRIP assumes reinvestment at current price (no price appreciation)</li>
                <li style="padding:0.3rem 0;">Dividend safety score is a composite of payout ratios, growth, FCF coverage, and leverage</li>
            </ul>
        </div>

        <!-- CARD 8 - DOWNLOAD CSV -->
        <div class="result-card span-2" style="text-align:center;padding:1.5rem;">
            <button class="run-btn" onclick="downloadModelCSV('dividend')" style="font-size:0.9rem;padding:0.7rem 2rem;">
                <i class="fas fa-download" style="margin-right:0.5rem;"></i> Download Full Analysis (CSV)
            </button>
        </div>
    </div>`;

    // -----------------------------------------------------------
    // Render Charts (after DOM is ready)
    // -----------------------------------------------------------
    setTimeout(() => {
        renderDividendCharts(data, historyLabels, historyValues);
    }, 100);
}


// ============================================================
// RENDER DIVIDEND CHARTS
// ============================================================
function renderDividendCharts(data, historyLabels, historyValues) {
    const { projectionYears, quarterlyPayoutRatios } = data;

    // --- Chart 1: 10-Year Projection (Grouped Bar) ---
    const projCtx = document.getElementById('divProjectionChart');
    if (projCtx) {
        if (chartInstances['div_projection']) {
            try { chartInstances['div_projection'].destroy(); } catch (e) {}
        }
        chartInstances['div_projection'] = new Chart(projCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: projectionYears.map(p => 'Yr ' + p.year),
                datasets: [
                    {
                        label: 'Without DRIP',
                        data: projectionYears.map(p => p.incomeNoDrip),
                        backgroundColor: 'rgba(254,188,17,0.5)',
                        borderColor: '#febc11',
                        borderWidth: 1,
                        order: 2
                    },
                    {
                        label: 'With DRIP',
                        data: projectionYears.map(p => p.incomeDrip),
                        backgroundColor: 'rgba(40,167,69,0.5)',
                        borderColor: '#28a745',
                        borderWidth: 1,
                        order: 2
                    },
                    {
                        label: 'Cumulative (DRIP)',
                        data: projectionYears.map(p => p.cumulativeDrip),
                        type: 'line',
                        borderColor: '#4dabf7',
                        backgroundColor: 'rgba(77,171,247,0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.3,
                        pointRadius: 3,
                        pointBackgroundColor: '#4dabf7',
                        yAxisID: 'y1',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#e5e5e5', font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + ': $' + ctx.parsed.y.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#aaa' }, grid: { display: false } },
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Annual Income ($)', color: '#aaa' },
                        ticks: { color: '#aaa', callback: function(v) { return '$' + v.toFixed(0); } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'Cumulative ($)', color: '#4dabf7' },
                        ticks: { color: '#4dabf7', callback: function(v) { return '$' + v.toFixed(0); } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // --- Chart 2: Quarterly Dividend History ---
    const histCtx = document.getElementById('divHistoryChart');
    if (histCtx && historyLabels.length > 0) {
        if (chartInstances['div_history']) {
            try { chartInstances['div_history'].destroy(); } catch (e) {}
        }
        chartInstances['div_history'] = new Chart(histCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: historyLabels,
                datasets: [{
                    label: 'Total Dividends Paid',
                    data: historyValues,
                    backgroundColor: 'rgba(254,188,17,0.5)',
                    borderColor: '#febc11',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#e5e5e5', font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return 'Dividends: $' + ctx.parsed.y.toLocaleString('en-US', { maximumFractionDigits: 0 });
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#aaa', font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
                    y: {
                        ticks: { color: '#aaa', callback: function(v) { return fmtBig(v); } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }

    // --- Chart 3: Payout Ratio Trend ---
    const payoutCtx = document.getElementById('divPayoutChart');
    if (payoutCtx && quarterlyPayoutRatios.length > 0) {
        if (chartInstances['div_payout']) {
            try { chartInstances['div_payout'].destroy(); } catch (e) {}
        }

        const payoutLabels = quarterlyPayoutRatios.map(q => q.period);
        const payoutValues = quarterlyPayoutRatios.map(q => q.ratio);
        // Build the 75% threshold line
        const thresholdLine = quarterlyPayoutRatios.map(() => 75);

        chartInstances['div_payout'] = new Chart(payoutCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: payoutLabels,
                datasets: [
                    {
                        label: 'Payout Ratio %',
                        data: payoutValues,
                        borderColor: '#febc11',
                        backgroundColor: 'rgba(254,188,17,0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 4,
                        pointBackgroundColor: '#febc11',
                        spanGaps: true
                    },
                    {
                        label: 'Warning Threshold (75%)',
                        data: thresholdLine,
                        borderColor: 'rgba(220,53,69,0.6)',
                        borderWidth: 2,
                        borderDash: [6, 4],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#e5e5e5', font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                if (ctx.parsed.y === null) return ctx.dataset.label + ': N/A';
                                return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%';
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#aaa', font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
                    y: {
                        ticks: { color: '#aaa', callback: function(v) { return v.toFixed(0) + '%'; } },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        suggestedMin: 0,
                        suggestedMax: 100
                    }
                }
            }
        });
    }
}
