/**
 * val-esg.js
 * ESG Proxy Scoring & Analysis (BlackRock Style) for the UCSB DIG Valuation Analysis Lab.
 * Loaded via <script> tag in valuation.html -- all functions are globally accessible.
 *
 * Supports DUAL MODE:
 *   - Single ticker: detailed ESG breakdown for one company
 *   - Portfolio mode: ESG analysis across all equity holdings
 *
 * Global utilities available from valuation.html:
 *   fmt(n, dec), fmtCur(n), fmtBig(n), fmtPct(n), clamp(v, lo, hi)
 *   apiBaseURL, chartInstances, storeAnalysisData(modelId, data)
 *   equityHoldings - array of {symbol, description, gicsSector, quantity, lastPrice}
 */

// ============================================================
// ESG SECTOR RISK CONSTANTS
// ============================================================

const SECTOR_ENV_RISK = {
    'Information Technology': 17, 'Communication Services': 17,
    'Health Care': 16, 'Financials': 18,
    'Consumer Staples': 14, 'Consumer Discretionary': 13,
    'Real Estate': 12, 'Industrials': 11,
    'Utilities': 9, 'Materials': 7, 'Energy': 5
};

const SECTOR_LABOR = {
    'Information Technology': 9, 'Financials': 8, 'Health Care': 7,
    'Communication Services': 8, 'Consumer Staples': 6, 'Industrials': 5,
    'Consumer Discretionary': 6, 'Real Estate': 7, 'Utilities': 7,
    'Materials': 4, 'Energy': 4
};

// ============================================================
// ESG SCORING ENGINE
// ============================================================

/**
 * Compute E, S, G scores and total ESG from company details + financials.
 * Returns { envScore, socialScore, govScore, totalESG, rating, ratingColor, components }
 */
function computeESGScores(details, financials, sector) {
    const totalEmployees = details.totalEmployees || 0;
    const marketCap = details.marketCap || 0;

    // Filter to quarterly only
    const quarterly = (financials || []).filter(f => f.fiscalPeriod !== 'FY');
    const recent4Q = quarterly.slice(0, Math.min(4, quarterly.length));

    // TTM financials
    const ttmRevenue = recent4Q.reduce((s, q) => s + (q.revenues || 0), 0);
    const ttmNetIncome = recent4Q.reduce((s, q) => s + (q.netIncome || 0), 0);
    const ttmCashFlow = recent4Q.reduce((s, q) => s + (q.cashFlow || 0), 0);
    const latestQ = quarterly[0] || {};
    const latestAssets = latestQ.assets || 0;
    const latestLiabilities = latestQ.liabilities || 0;
    const latestEquity = latestQ.equity || 0;

    // Revenue per employee
    const revPerEmployee = (totalEmployees > 0 && ttmRevenue > 0)
        ? ttmRevenue / totalEmployees : 0;

    // Flag for limited data (ETFs or missing financials)
    const limitedData = quarterly.length === 0 && totalEmployees === 0;

    // -------------------------------------------------------
    // ENVIRONMENTAL SCORE (0-35)
    // -------------------------------------------------------
    const sectorEnvRisk = SECTOR_ENV_RISK[sector] || 12;

    let effScore;
    if (totalEmployees > 0 && ttmRevenue > 0) {
        if (revPerEmployee > 1000000) effScore = 10;
        else if (revPerEmployee > 500000) effScore = 8;
        else if (revPerEmployee > 250000) effScore = 6;
        else if (revPerEmployee > 100000) effScore = 4;
        else effScore = 2;
    } else {
        effScore = 5; // default if no data
    }

    let sizeBonus;
    if (marketCap > 200e9) sizeBonus = 5;
    else if (marketCap > 50e9) sizeBonus = 4;
    else if (marketCap > 10e9) sizeBonus = 3;
    else if (marketCap > 1e9) sizeBonus = 2;
    else sizeBonus = 1;

    const envScore = clamp(sectorEnvRisk + effScore + sizeBonus, 0, 35);

    // -------------------------------------------------------
    // SOCIAL SCORE (0-35)
    // -------------------------------------------------------
    let laborScore;
    if (totalEmployees > 0 && ttmRevenue > 0) {
        if (revPerEmployee > 300000 && revPerEmployee < 800000) laborScore = 15;
        else if (revPerEmployee > 150000 && revPerEmployee < 1200000) laborScore = 10;
        else if (revPerEmployee > 50000) laborScore = 7;
        else laborScore = 5;
    } else {
        laborScore = 8; // default
    }

    const sectorLabor = SECTOR_LABOR[sector] || 6;

    // Company scale factor (0-10) using log scale of market cap
    let scaleScore;
    if (marketCap > 0) {
        scaleScore = clamp(Math.floor(Math.log10(marketCap) - 7), 1, 10);
    } else {
        scaleScore = 3; // default
    }

    const socialScore = clamp(laborScore + sectorLabor + scaleScore, 0, 35);

    // -------------------------------------------------------
    // GOVERNANCE SCORE (0-30)
    // -------------------------------------------------------
    let transparencyScore, debtScore, eqScore;

    // Financial Transparency (0-10) via accruals ratio
    if (latestAssets > 0 && quarterly.length >= 4) {
        const accruals = (ttmNetIncome - ttmCashFlow) / latestAssets;
        if (accruals < 0) transparencyScore = 10;
        else if (accruals < 0.05) transparencyScore = 8;
        else if (accruals < 0.10) transparencyScore = 5;
        else transparencyScore = 2;
    } else {
        transparencyScore = 5; // default
    }

    // Debt Management (0-10)
    if (latestEquity > 0) {
        const debtToEquity = latestLiabilities / latestEquity;
        if (debtToEquity >= 0.3 && debtToEquity <= 0.8) debtScore = 10;
        else if (debtToEquity >= 0.1 && debtToEquity <= 1.5) debtScore = 7;
        else if (debtToEquity >= 0 && debtToEquity <= 3.0) debtScore = 4;
        else debtScore = 2;
    } else {
        // Negative equity
        debtScore = 2;
    }

    // Earnings Quality (0-10)
    if (ttmNetIncome > 0 && quarterly.length >= 4) {
        const cfToNI = ttmCashFlow / ttmNetIncome;
        if (cfToNI > 1.2) eqScore = 10;
        else if (cfToNI > 0.8) eqScore = 7;
        else if (cfToNI > 0.5) eqScore = 4;
        else eqScore = 2;
    } else {
        eqScore = 5; // default if NI <= 0 or missing
    }

    const govScore = clamp(transparencyScore + debtScore + eqScore, 0, 30);

    // -------------------------------------------------------
    // TOTAL ESG & RATING
    // -------------------------------------------------------
    const totalESG = envScore + socialScore + govScore;

    let rating;
    if (totalESG >= 90) rating = 'AAA';
    else if (totalESG >= 80) rating = 'AA';
    else if (totalESG >= 70) rating = 'A';
    else if (totalESG >= 60) rating = 'BBB';
    else if (totalESG >= 50) rating = 'BB';
    else if (totalESG >= 40) rating = 'B';
    else rating = 'CCC';

    let ratingColor;
    if (rating === 'AAA' || rating === 'AA') ratingColor = '#28a745';
    else if (rating === 'A' || rating === 'BBB') ratingColor = '#ffc107';
    else if (rating === 'BB' || rating === 'B') ratingColor = '#fd7e14';
    else ratingColor = '#dc3545';

    // Compute debtToEquity for display
    const debtToEquity = latestEquity > 0 ? (latestLiabilities / latestEquity) : null;
    const accruals = (latestAssets > 0 && quarterly.length >= 4)
        ? (ttmNetIncome - ttmCashFlow) / latestAssets : null;
    const cfToNI = (ttmNetIncome > 0 && quarterly.length >= 4)
        ? ttmCashFlow / ttmNetIncome : null;

    return {
        envScore, socialScore, govScore, totalESG, rating, ratingColor, limitedData,
        components: {
            sectorEnvRisk, effScore, sizeBonus,
            laborScore, sectorLabor, scaleScore,
            transparencyScore, debtScore, eqScore,
            revPerEmployee, marketCap, totalEmployees,
            ttmRevenue, ttmNetIncome, ttmCashFlow,
            latestAssets, latestLiabilities, latestEquity,
            debtToEquity, accruals, cfToNI
        }
    };
}


// ============================================================
// MAIN ENTRY POINT
// ============================================================

async function runESGAnalysis(symbol) {
    const output = document.getElementById('analysisOutput');

    if (symbol && symbol.trim()) {
        // ----------------------------------------------------------
        // SINGLE TICKER MODE
        // ----------------------------------------------------------
        symbol = symbol.trim().toUpperCase();
        output.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><br>Computing ESG proxy scores for ' + symbol + '...</div>';

        try {
            const [detailsRes, financialsRes] = await Promise.all([
                fetch(`${apiBaseURL}/api/stock/${symbol}/details`).then(r => r.json()),
                fetch(`${apiBaseURL}/api/stock/${symbol}/financials?limit=4`).then(r => r.json())
            ]);

            const details = detailsRes || {};
            const financials = financialsRes.financials || financialsRes || [];
            const companyName = details.name || symbol;
            const sector = findSectorForSymbol(symbol) || details.sicDescription || 'Unknown';

            const esg = computeESGScores(details, financials, sector);

            renderSingleTickerESG(symbol, companyName, sector, esg);
            storeSingleTickerCSV(symbol, companyName, sector, esg);

        } catch (err) {
            console.error('ESG Analysis Error:', err);
            output.innerHTML = `<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>Error running ESG Analysis for ${symbol}: ${err.message}</div>`;
        }

    } else {
        // ----------------------------------------------------------
        // PORTFOLIO MODE
        // ----------------------------------------------------------
        const holdings = equityHoldings || [];
        const N = holdings.length;
        output.innerHTML = `<div class="analysis-loading"><div class="spinner"></div><br>Analyzing ESG across ${N} holdings...</div>`;

        try {
            const results = [];
            const batchSize = 5;

            for (let i = 0; i < holdings.length; i += batchSize) {
                const batch = holdings.slice(i, i + batchSize);
                const batchResults = await Promise.all(batch.map(async (h) => {
                    try {
                        const [detailsRes, financialsRes] = await Promise.all([
                            fetch(`${apiBaseURL}/api/stock/${h.symbol}/details`).then(r => r.json()),
                            fetch(`${apiBaseURL}/api/stock/${h.symbol}/financials?limit=4`).then(r => r.json())
                        ]);
                        const details = detailsRes || {};
                        const financials = financialsRes.financials || financialsRes || [];
                        const esg = computeESGScores(details, financials, h.gicsSector);
                        return {
                            symbol: h.symbol,
                            name: details.name || h.description,
                            sector: h.gicsSector,
                            quantity: h.quantity,
                            lastPrice: h.lastPrice,
                            esg: esg,
                            success: true
                        };
                    } catch (err) {
                        console.warn(`ESG fetch failed for ${h.symbol}:`, err);
                        // Assign default sector-only scores
                        const esg = computeESGScores({}, [], h.gicsSector);
                        return {
                            symbol: h.symbol,
                            name: h.description,
                            sector: h.gicsSector,
                            quantity: h.quantity,
                            lastPrice: h.lastPrice,
                            esg: esg,
                            success: false
                        };
                    }
                }));
                results.push(...batchResults);

                // Delay between batches (except last)
                if (i + batchSize < holdings.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            renderPortfolioESG(results);
            storePortfolioCSV(results);

        } catch (err) {
            console.error('Portfolio ESG Analysis Error:', err);
            output.innerHTML = `<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>Error running Portfolio ESG Analysis: ${err.message}</div>`;
        }
    }
}


// ============================================================
// HELPER: Find sector for a symbol from equityHoldings
// ============================================================
function findSectorForSymbol(symbol) {
    const all = (typeof equityHoldings !== 'undefined') ? equityHoldings : [];
    const found = all.find(h => h.symbol === symbol);
    return found ? found.gicsSector : null;
}


// ============================================================
// ESG RATING BADGE HTML
// ============================================================
function esgRatingBadgeHTML(rating, ratingColor) {
    return `<span style="display:inline-block;padding:0.3rem 0.8rem;border-radius:8px;font-size:0.85rem;font-weight:800;letter-spacing:1px;color:${ratingColor};background:${ratingColor}22;border:1px solid ${ratingColor}66;">${rating}</span>`;
}


// ============================================================
// RENDER: SINGLE TICKER ESG
// ============================================================
function renderSingleTickerESG(symbol, companyName, sector, esg) {
    const output = document.getElementById('analysisOutput');
    const { envScore, socialScore, govScore, totalESG, rating, ratingColor, limitedData, components } = esg;
    const c = components;

    // Score bar helper
    function scoreBar(score, max, color) {
        const pct = (score / max) * 100;
        return `<div style="display:flex;align-items:center;gap:0.8rem;">
            <div style="flex:1;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width 0.5s;"></div>
            </div>
            <span style="font-weight:700;color:${color};min-width:55px;text-align:right;">${score}/${max}</span>
        </div>`;
    }

    // Large badge style
    let badgeBg, badgeBorder;
    if (rating === 'AAA' || rating === 'AA') { badgeBg = 'rgba(40,167,69,0.2)'; badgeBorder = '#28a745'; }
    else if (rating === 'A' || rating === 'BBB') { badgeBg = 'rgba(255,193,7,0.15)'; badgeBorder = '#ffc107'; }
    else if (rating === 'BB' || rating === 'B') { badgeBg = 'rgba(253,126,20,0.15)'; badgeBorder = '#fd7e14'; }
    else { badgeBg = 'rgba(220,53,69,0.2)'; badgeBorder = '#dc3545'; }

    // Revenue per employee display
    const revPerEmpDisplay = c.revPerEmployee > 0
        ? '$' + fmtBig(c.revPerEmployee) + '/employee'
        : 'No data';

    // Efficiency label
    let effLabel;
    if (c.revPerEmployee > 1000000) effLabel = 'Very High efficiency';
    else if (c.revPerEmployee > 500000) effLabel = 'High efficiency';
    else if (c.revPerEmployee > 250000) effLabel = 'Moderate efficiency';
    else if (c.revPerEmployee > 100000) effLabel = 'Low efficiency';
    else if (c.revPerEmployee > 0) effLabel = 'Very Low efficiency';
    else effLabel = 'Default (no data)';

    // Size label
    let sizeLabel;
    if (c.marketCap > 200e9) sizeLabel = 'Mega cap (' + fmtBig(c.marketCap) + ')';
    else if (c.marketCap > 50e9) sizeLabel = 'Large cap (' + fmtBig(c.marketCap) + ')';
    else if (c.marketCap > 10e9) sizeLabel = 'Mid-large cap (' + fmtBig(c.marketCap) + ')';
    else if (c.marketCap > 1e9) sizeLabel = 'Mid cap (' + fmtBig(c.marketCap) + ')';
    else sizeLabel = 'Small cap (' + fmtBig(c.marketCap) + ')';

    // Labor label
    let laborLabel;
    if (c.revPerEmployee > 300000 && c.revPerEmployee < 800000) laborLabel = 'Optimal range';
    else if (c.revPerEmployee > 150000 && c.revPerEmployee < 1200000) laborLabel = 'Acceptable range';
    else if (c.revPerEmployee > 50000) laborLabel = 'Below optimal';
    else if (c.totalEmployees > 0) laborLabel = 'Low productivity concern';
    else laborLabel = 'Default (no data)';

    // Governance detail labels
    let transparencyLabel;
    if (c.accruals !== null) {
        if (c.accruals < 0) transparencyLabel = 'Cash > Earnings — Very transparent';
        else if (c.accruals < 0.05) transparencyLabel = 'Low accruals — Transparent';
        else if (c.accruals < 0.10) transparencyLabel = 'Moderate accruals';
        else transparencyLabel = 'High accruals — Concern';
    } else {
        transparencyLabel = 'Insufficient data';
    }

    let debtLabel;
    if (c.debtToEquity !== null) {
        if (c.debtToEquity >= 0.3 && c.debtToEquity <= 0.8) debtLabel = 'Optimal leverage (' + c.debtToEquity.toFixed(2) + 'x)';
        else if (c.debtToEquity >= 0.1 && c.debtToEquity <= 1.5) debtLabel = 'Acceptable (' + c.debtToEquity.toFixed(2) + 'x)';
        else if (c.debtToEquity >= 0 && c.debtToEquity <= 3.0) debtLabel = 'Elevated (' + c.debtToEquity.toFixed(2) + 'x)';
        else debtLabel = 'Excessive (' + c.debtToEquity.toFixed(2) + 'x)';
    } else {
        debtLabel = 'Negative equity';
    }

    let eqLabel;
    if (c.cfToNI !== null) {
        if (c.cfToNI > 1.2) eqLabel = 'Strong CF coverage (' + c.cfToNI.toFixed(2) + 'x)';
        else if (c.cfToNI > 0.8) eqLabel = 'Good CF coverage (' + c.cfToNI.toFixed(2) + 'x)';
        else if (c.cfToNI > 0.5) eqLabel = 'Moderate CF (' + c.cfToNI.toFixed(2) + 'x)';
        else eqLabel = 'Low CF quality (' + c.cfToNI.toFixed(2) + 'x)';
    } else {
        eqLabel = 'Insufficient data';
    }

    const limitedNote = limitedData
        ? '<p style="color:#fd7e14;font-size:0.8rem;margin-top:0.5rem;"><i class="fas fa-info-circle"></i> Limited data — ETF or missing financials. Scores use sector defaults.</p>'
        : '';

    output.innerHTML = `
    <div class="result-grid">
        <!-- CARD 1 - VERDICT (span-2) -->
        <div class="result-card span-2 verdict-card">
            <div class="verdict-badge" style="background:${badgeBg};color:${badgeBorder};border:2px solid ${badgeBorder};">${rating}</div>
            <div class="verdict-price" style="color:${ratingColor};">${totalESG}/100</div>
            <div class="verdict-detail">ESG Proxy Score for ${symbol} — Rating: ${rating}</div>
            <div style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-top:0.3rem;">${companyName} &mdash; ${sector}</div>
            ${limitedNote}
        </div>

        <!-- CARD 2 - E/S/G BREAKDOWN + RADAR -->
        <div class="result-card">
            <h3><i class="fas fa-chart-pie"></i> E / S / G Breakdown</h3>
            <div style="margin-bottom:1.2rem;">
                <div style="margin-bottom:0.8rem;">
                    <span style="font-size:0.8rem;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.5px;">Environmental</span>
                    ${scoreBar(envScore, 35, '#28a745')}
                </div>
                <div style="margin-bottom:0.8rem;">
                    <span style="font-size:0.8rem;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.5px;">Social</span>
                    ${scoreBar(socialScore, 35, '#4dabf7')}
                </div>
                <div>
                    <span style="font-size:0.8rem;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.5px;">Governance</span>
                    ${scoreBar(govScore, 30, '#febc11')}
                </div>
            </div>
            <div style="position:relative;height:220px;"><canvas id="esgRadarChart"></canvas></div>
        </div>

        <!-- CARD 3 - ENVIRONMENTAL DETAILS -->
        <div class="result-card">
            <h3><i class="fas fa-leaf"></i> Environmental Details</h3>
            <table class="val-table">
                <thead><tr><th>Component</th><th>Score</th><th>Details</th></tr></thead>
                <tbody>
                    <tr>
                        <td>Sector Risk</td>
                        <td class="highlight">${c.sectorEnvRisk}/20</td>
                        <td style="color:rgba(255,255,255,0.6);font-size:0.8rem;">${sector} — ${c.sectorEnvRisk >= 15 ? 'Low' : c.sectorEnvRisk >= 10 ? 'Moderate' : 'High'} environmental risk</td>
                    </tr>
                    <tr>
                        <td>Revenue Efficiency</td>
                        <td class="highlight">${c.effScore}/10</td>
                        <td style="color:rgba(255,255,255,0.6);font-size:0.8rem;">${revPerEmpDisplay} — ${effLabel}</td>
                    </tr>
                    <tr>
                        <td>Company Size</td>
                        <td class="highlight">${c.sizeBonus}/5</td>
                        <td style="color:rgba(255,255,255,0.6);font-size:0.8rem;">${sizeLabel}</td>
                    </tr>
                    <tr style="border-top:2px solid rgba(40,167,69,0.3);">
                        <td style="font-weight:700;">Total E</td>
                        <td style="font-weight:700;color:#28a745;">${envScore}/35</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- CARD 4 - SOCIAL DETAILS -->
        <div class="result-card">
            <h3><i class="fas fa-users"></i> Social Details</h3>
            <table class="val-table">
                <thead><tr><th>Component</th><th>Score</th><th>Details</th></tr></thead>
                <tbody>
                    <tr>
                        <td>Labor Practice Proxy</td>
                        <td class="highlight">${c.laborScore}/15</td>
                        <td style="color:rgba(255,255,255,0.6);font-size:0.8rem;">${revPerEmpDisplay} — ${laborLabel}</td>
                    </tr>
                    <tr>
                        <td>Sector Labor Risk</td>
                        <td class="highlight">${c.sectorLabor}/10</td>
                        <td style="color:rgba(255,255,255,0.6);font-size:0.8rem;">${sector}</td>
                    </tr>
                    <tr>
                        <td>Company Scale</td>
                        <td class="highlight">${c.scaleScore}/10</td>
                        <td style="color:rgba(255,255,255,0.6);font-size:0.8rem;">Market cap: ${fmtBig(c.marketCap)}</td>
                    </tr>
                    <tr style="border-top:2px solid rgba(77,171,247,0.3);">
                        <td style="font-weight:700;">Total S</td>
                        <td style="font-weight:700;color:#4dabf7;">${socialScore}/35</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- CARD 5 - GOVERNANCE DETAILS -->
        <div class="result-card">
            <h3><i class="fas fa-balance-scale"></i> Governance Details</h3>
            <table class="val-table">
                <thead><tr><th>Component</th><th>Score</th><th>Details</th></tr></thead>
                <tbody>
                    <tr>
                        <td>Financial Transparency</td>
                        <td class="highlight">${c.transparencyScore}/10</td>
                        <td style="color:rgba(255,255,255,0.6);font-size:0.8rem;">${transparencyLabel}</td>
                    </tr>
                    <tr>
                        <td>Debt Management</td>
                        <td class="highlight">${c.debtScore}/10</td>
                        <td style="color:rgba(255,255,255,0.6);font-size:0.8rem;">${debtLabel}</td>
                    </tr>
                    <tr>
                        <td>Earnings Quality</td>
                        <td class="highlight">${c.eqScore}/10</td>
                        <td style="color:rgba(255,255,255,0.6);font-size:0.8rem;">${eqLabel}</td>
                    </tr>
                    <tr style="border-top:2px solid rgba(254,188,17,0.3);">
                        <td style="font-weight:700;">Total G</td>
                        <td style="font-weight:700;color:#febc11;">${govScore}/30</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- CARD 6 - METHODOLOGY DISCLOSURE (span-2) -->
        <div class="result-card span-2" style="border-color:rgba(255,193,7,0.4);background:rgba(255,193,7,0.05);">
            <h4 style="color:#ffc107;"><i class="fas fa-info-circle"></i> Important Methodology Disclosure</h4>
            <p style="color:rgba(255,255,255,0.8);font-size:0.9rem;">
                These are <strong>estimated proxy scores</strong> derived from publicly available financial data.
                They do NOT reflect official ESG assessments from MSCI, Sustainalytics, Bloomberg, or any certified ESG rating provider.
            </p>
            <p style="color:rgba(255,255,255,0.6);font-size:0.85rem;">
                Scoring methodology uses: sector-based environmental risk classifications, revenue efficiency and employee metrics
                as social proxies, and financial transparency indicators (accruals, cash flow quality, leverage) as governance proxies.
                Actual ESG performance requires assessment of carbon emissions, supply chain practices, board diversity, and other
                factors not available through financial data APIs.
            </p>
        </div>

        <!-- CARD 7 - DOWNLOAD CSV -->
        <div class="result-card span-2" style="text-align:center;padding:1.5rem;">
            <button class="run-btn" onclick="downloadModelCSV('esg')" style="font-size:0.9rem;padding:0.7rem 2rem;">
                <i class="fas fa-download" style="margin-right:0.5rem;"></i> Download Full Analysis (CSV)
            </button>
        </div>
    </div>`;

    // Render Radar Chart after DOM is ready
    setTimeout(() => {
        renderESGRadarChart(envScore, socialScore, govScore);
    }, 100);
}


// ============================================================
// RENDER: PORTFOLIO ESG
// ============================================================
function renderPortfolioESG(results) {
    const output = document.getElementById('analysisOutput');

    // Calculate portfolio-weighted average ESG
    const totalValue = results.reduce((s, r) => s + r.quantity * r.lastPrice, 0);
    let weightedESG = 0, weightedE = 0, weightedS = 0, weightedG = 0;
    results.forEach(r => {
        const w = totalValue > 0 ? (r.quantity * r.lastPrice) / totalValue : 1 / results.length;
        weightedESG += w * r.esg.totalESG;
        weightedE += w * r.esg.envScore;
        weightedS += w * r.esg.socialScore;
        weightedG += w * r.esg.govScore;
    });

    // Sort by total ESG descending
    const sorted = results.slice().sort((a, b) => b.esg.totalESG - a.esg.totalESG);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const rated = results.filter(r => r.success).length;

    // Portfolio rating
    let portRating;
    if (weightedESG >= 90) portRating = 'AAA';
    else if (weightedESG >= 80) portRating = 'AA';
    else if (weightedESG >= 70) portRating = 'A';
    else if (weightedESG >= 60) portRating = 'BBB';
    else if (weightedESG >= 50) portRating = 'BB';
    else if (weightedESG >= 40) portRating = 'B';
    else portRating = 'CCC';

    let portRatingColor;
    if (portRating === 'AAA' || portRating === 'AA') portRatingColor = '#28a745';
    else if (portRating === 'A' || portRating === 'BBB') portRatingColor = '#ffc107';
    else if (portRating === 'BB' || portRating === 'B') portRatingColor = '#fd7e14';
    else portRatingColor = '#dc3545';

    // Sector ESG averages
    const sectorData = {};
    results.forEach(r => {
        const sec = r.sector || 'Other';
        if (!sectorData[sec]) sectorData[sec] = { totalESG: 0, count: 0 };
        sectorData[sec].totalESG += r.esg.totalESG;
        sectorData[sec].count++;
    });
    const sectorAvgs = Object.entries(sectorData).map(([sec, d]) => ({
        sector: sec, avg: d.totalESG / d.count
    })).sort((a, b) => b.avg - a.avg);

    // Build holdings table rows
    const tableRows = sorted.map((r, i) => {
        const rc = r.esg.ratingColor;
        const limitedTag = r.esg.limitedData ? ' <span style="color:#fd7e14;font-size:0.7rem;">(ETF)</span>' : '';
        return `<tr>
            <td style="font-weight:700;">${i + 1}</td>
            <td style="font-weight:700;">${r.symbol}</td>
            <td>${r.name}${limitedTag}</td>
            <td>${r.esg.envScore}</td>
            <td>${r.esg.socialScore}</td>
            <td>${r.esg.govScore}</td>
            <td style="font-weight:700;">${r.esg.totalESG}</td>
            <td>${esgRatingBadgeHTML(r.esg.rating, r.esg.ratingColor)}</td>
        </tr>`;
    }).join('');

    output.innerHTML = `
    <div class="result-grid">
        <!-- CARD 1 - PORTFOLIO ESG SUMMARY (span-2) -->
        <div class="result-card span-2">
            <h3><i class="fas fa-globe"></i> Portfolio ESG Summary</h3>
            <div class="metrics-row">
                <div class="metric-item">
                    <div class="metric-label">Portfolio Avg ESG</div>
                    <div class="metric-value" style="color:${portRatingColor};">${Math.round(weightedESG)}/100</div>
                    <div class="metric-sub">Rating: ${portRating}</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">Best Holding</div>
                    <div class="metric-value" style="color:#28a745;">${best.symbol}</div>
                    <div class="metric-sub">Score: ${best.esg.totalESG} (${best.esg.rating})</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">Worst Holding</div>
                    <div class="metric-value" style="color:#dc3545;">${worst.symbol}</div>
                    <div class="metric-sub">Score: ${worst.esg.totalESG} (${worst.esg.rating})</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">Holdings Rated</div>
                    <div class="metric-value">${rated}/${results.length}</div>
                    <div class="metric-sub">Full data available</div>
                </div>
            </div>
        </div>

        <!-- CARD 2 - ALL HOLDINGS ESG TABLE (span-2) -->
        <div class="result-card span-2">
            <h3><i class="fas fa-table"></i> Holdings ESG Scores</h3>
            <div style="overflow-x:auto;">
                <table class="val-table">
                    <thead>
                        <tr>
                            <th>Rank</th><th>Symbol</th><th>Name</th>
                            <th style="color:#28a745;">E</th>
                            <th style="color:#4dabf7;">S</th>
                            <th style="color:#febc11;">G</th>
                            <th>Total</th><th>Rating</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        </div>

        <!-- CARD 3 - PORTFOLIO RADAR vs BENCHMARK -->
        <div class="result-card">
            <h3><i class="fas fa-chart-pie"></i> Portfolio E/S/G vs Market Average</h3>
            <div style="position:relative;height:280px;"><canvas id="esgPortfolioRadarChart"></canvas></div>
        </div>

        <!-- CARD 4 - SECTOR ESG BAR CHART -->
        <div class="result-card">
            <h3><i class="fas fa-industry"></i> Sector ESG Comparison</h3>
            <div style="position:relative;height:280px;"><canvas id="esgSectorChart"></canvas></div>
        </div>

        <!-- CARD 5 - METHODOLOGY DISCLOSURE (span-2) -->
        <div class="result-card span-2" style="border-color:rgba(255,193,7,0.4);background:rgba(255,193,7,0.05);">
            <h4 style="color:#ffc107;"><i class="fas fa-info-circle"></i> Important Methodology Disclosure</h4>
            <p style="color:rgba(255,255,255,0.8);font-size:0.9rem;">
                These are <strong>estimated proxy scores</strong> derived from publicly available financial data.
                They do NOT reflect official ESG assessments from MSCI, Sustainalytics, Bloomberg, or any certified ESG rating provider.
            </p>
            <p style="color:rgba(255,255,255,0.6);font-size:0.85rem;">
                Scoring methodology uses: sector-based environmental risk classifications, revenue efficiency and employee metrics
                as social proxies, and financial transparency indicators (accruals, cash flow quality, leverage) as governance proxies.
                Actual ESG performance requires assessment of carbon emissions, supply chain practices, board diversity, and other
                factors not available through financial data APIs.
            </p>
        </div>

        <!-- CARD 6 - DOWNLOAD CSV -->
        <div class="result-card span-2" style="text-align:center;padding:1.5rem;">
            <button class="run-btn" onclick="downloadModelCSV('esg')" style="font-size:0.9rem;padding:0.7rem 2rem;">
                <i class="fas fa-download" style="margin-right:0.5rem;"></i> Download Portfolio ESG Analysis (CSV)
            </button>
        </div>
    </div>`;

    // Render charts after DOM is ready
    setTimeout(() => {
        renderPortfolioESGCharts(weightedE, weightedS, weightedG, sectorAvgs);
    }, 100);
}


// ============================================================
// CHARTS: SINGLE TICKER RADAR
// ============================================================
function renderESGRadarChart(envScore, socialScore, govScore) {
    const ctx = document.getElementById('esgRadarChart');
    if (!ctx) return;

    if (chartInstances['esg_radar']) {
        try { chartInstances['esg_radar'].destroy(); } catch (e) {}
    }

    // Normalize scores to percentage of max for comparable radar axes
    const envPct = (envScore / 35) * 100;
    const socialPct = (socialScore / 35) * 100;
    const govPct = (govScore / 30) * 100;

    chartInstances['esg_radar'] = new Chart(ctx.getContext('2d'), {
        type: 'radar',
        data: {
            labels: ['Environmental (0-35)', 'Social (0-35)', 'Governance (0-30)'],
            datasets: [{
                label: 'ESG Score %',
                data: [envPct, socialPct, govPct],
                backgroundColor: 'rgba(254,188,17,0.15)',
                borderColor: '#febc11',
                borderWidth: 2,
                pointBackgroundColor: ['#28a745', '#4dabf7', '#febc11'],
                pointBorderColor: ['#28a745', '#4dabf7', '#febc11'],
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const raw = [envScore + '/35', socialScore + '/35', govScore + '/30'];
                            return raw[ctx.dataIndex] + ' (' + ctx.parsed.r.toFixed(0) + '%)';
                        }
                    }
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { display: false },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    angleLines: { color: 'rgba(255,255,255,0.08)' },
                    pointLabels: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } }
                }
            }
        }
    });
}


// ============================================================
// CHARTS: PORTFOLIO RADAR + SECTOR BAR
// ============================================================
function renderPortfolioESGCharts(weightedE, weightedS, weightedG, sectorAvgs) {
    // --- Portfolio Radar vs Market Average ---
    const radarCtx = document.getElementById('esgPortfolioRadarChart');
    if (radarCtx) {
        if (chartInstances['esg_radar']) {
            try { chartInstances['esg_radar'].destroy(); } catch (e) {}
        }

        // Market average benchmark: estimated ~65 total = roughly E:22, S:23, G:20
        const benchE = 22, benchS = 23, benchG = 20;

        const portEPct = (weightedE / 35) * 100;
        const portSPct = (weightedS / 35) * 100;
        const portGPct = (weightedG / 30) * 100;
        const benchEPct = (benchE / 35) * 100;
        const benchSPct = (benchS / 35) * 100;
        const benchGPct = (benchG / 30) * 100;

        chartInstances['esg_radar'] = new Chart(radarCtx.getContext('2d'), {
            type: 'radar',
            data: {
                labels: ['Environmental (0-35)', 'Social (0-35)', 'Governance (0-30)'],
                datasets: [
                    {
                        label: 'DIG Portfolio',
                        data: [portEPct, portSPct, portGPct],
                        backgroundColor: 'rgba(254,188,17,0.15)',
                        borderColor: '#febc11',
                        borderWidth: 2,
                        pointBackgroundColor: '#febc11',
                        pointRadius: 5
                    },
                    {
                        label: 'Market Average',
                        data: [benchEPct, benchSPct, benchGPct],
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        borderColor: 'rgba(255,255,255,0.4)',
                        borderWidth: 2,
                        borderDash: [6, 4],
                        pointBackgroundColor: 'rgba(255,255,255,0.6)',
                        pointRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#e5e5e5', font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + ': ' + ctx.parsed.r.toFixed(1) + '%';
                            }
                        }
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { display: false },
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        angleLines: { color: 'rgba(255,255,255,0.08)' },
                        pointLabels: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } }
                    }
                }
            }
        });
    }

    // --- Sector ESG Bar Chart ---
    const sectorCtx = document.getElementById('esgSectorChart');
    if (sectorCtx && sectorAvgs.length > 0) {
        if (chartInstances['esg_sector']) {
            try { chartInstances['esg_sector'].destroy(); } catch (e) {}
        }

        const sectorLabels = sectorAvgs.map(s => s.sector.length > 18 ? s.sector.slice(0, 16) + '...' : s.sector);
        const sectorValues = sectorAvgs.map(s => Math.round(s.avg));
        const sectorColors = sectorAvgs.map(s => {
            if (s.avg >= 70) return 'rgba(40,167,69,0.6)';
            if (s.avg >= 55) return 'rgba(254,188,17,0.6)';
            if (s.avg >= 40) return 'rgba(253,126,20,0.6)';
            return 'rgba(220,53,69,0.6)';
        });
        const sectorBorders = sectorAvgs.map(s => {
            if (s.avg >= 70) return '#28a745';
            if (s.avg >= 55) return '#febc11';
            if (s.avg >= 40) return '#fd7e14';
            return '#dc3545';
        });

        chartInstances['esg_sector'] = new Chart(sectorCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: sectorLabels,
                datasets: [{
                    label: 'Avg ESG Score',
                    data: sectorValues,
                    backgroundColor: sectorColors,
                    borderColor: sectorBorders,
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return 'Avg ESG: ' + ctx.parsed.x + '/100';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        min: 0,
                        max: 100,
                        ticks: { color: '#aaa' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { color: '#aaa', font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }
}


// ============================================================
// CSV EXPORT: SINGLE TICKER
// ============================================================
function storeSingleTickerCSV(symbol, companyName, sector, esg) {
    const c = esg.components;
    const csvData = {
        modelName: 'ESG Proxy Scoring & Analysis',
        firmStyle: 'BlackRock Style',
        runDate: new Date().toISOString(),
        ticker: symbol,
        sections: [
            {
                title: 'ESG Summary',
                type: 'metrics',
                rows: [
                    { label: 'Company', value: companyName, formatted: companyName },
                    { label: 'Sector', value: sector, formatted: sector },
                    { label: 'Total ESG Score', value: esg.totalESG, formatted: esg.totalESG + '/100' },
                    { label: 'ESG Rating', value: esg.rating, formatted: esg.rating },
                    { label: 'Environmental Score', value: esg.envScore, formatted: esg.envScore + '/35' },
                    { label: 'Social Score', value: esg.socialScore, formatted: esg.socialScore + '/35' },
                    { label: 'Governance Score', value: esg.govScore, formatted: esg.govScore + '/30' }
                ]
            },
            {
                title: 'Environmental Breakdown',
                type: 'metrics',
                rows: [
                    { label: 'Sector Environmental Risk', value: c.sectorEnvRisk, formatted: c.sectorEnvRisk + '/20', formula: 'Sector-based classification' },
                    { label: 'Revenue Efficiency Proxy', value: c.effScore, formatted: c.effScore + '/10', formula: c.revPerEmployee > 0 ? '$' + fmtBig(c.revPerEmployee) + '/employee' : 'No data' },
                    { label: 'Company Size Bonus', value: c.sizeBonus, formatted: c.sizeBonus + '/5', formula: 'Market cap: ' + fmtBig(c.marketCap) }
                ]
            },
            {
                title: 'Social Breakdown',
                type: 'metrics',
                rows: [
                    { label: 'Labor Practice Proxy', value: c.laborScore, formatted: c.laborScore + '/15', formula: 'Revenue per employee range' },
                    { label: 'Sector Labor Risk', value: c.sectorLabor, formatted: c.sectorLabor + '/10', formula: 'Sector-based classification' },
                    { label: 'Company Scale Factor', value: c.scaleScore, formatted: c.scaleScore + '/10', formula: 'Log10(marketCap) - 7' }
                ]
            },
            {
                title: 'Governance Breakdown',
                type: 'metrics',
                rows: [
                    { label: 'Financial Transparency', value: c.transparencyScore, formatted: c.transparencyScore + '/10', formula: c.accruals !== null ? 'Accruals ratio: ' + c.accruals.toFixed(4) : 'Insufficient data' },
                    { label: 'Debt Management', value: c.debtScore, formatted: c.debtScore + '/10', formula: c.debtToEquity !== null ? 'D/E ratio: ' + c.debtToEquity.toFixed(2) : 'Negative equity' },
                    { label: 'Earnings Quality', value: c.eqScore, formatted: c.eqScore + '/10', formula: c.cfToNI !== null ? 'CF/NI ratio: ' + c.cfToNI.toFixed(2) : 'Insufficient data' }
                ]
            },
            {
                title: 'Raw Financial Data — ESG Component Scoring',
                type: 'table',
                headers: ['Component', 'Score', 'Max', 'Raw Metric', 'Raw Value'],
                rows: [
                    ['Sector Env Risk', c.sectorEnvRisk, 20, 'Sector', sector],
                    ['Revenue Efficiency', c.effScore, 10, 'Rev/Employee', c.revPerEmployee],
                    ['Company Size Bonus', c.sizeBonus, 5, 'Market Cap', c.marketCap],
                    ['Labor Practice Proxy', c.laborScore, 15, 'Rev/Employee', c.revPerEmployee],
                    ['Sector Labor Risk', c.sectorLabor, 10, 'Sector', sector],
                    ['Company Scale', c.scaleScore, 10, 'Market Cap', c.marketCap],
                    ['Financial Transparency', c.transparencyScore, 10, 'Accruals Ratio', c.accruals !== null ? c.accruals : ''],
                    ['Debt Management', c.debtScore, 10, 'D/E Ratio', c.debtToEquity !== null ? c.debtToEquity : ''],
                    ['Earnings Quality', c.eqScore, 10, 'CF/NI Ratio', c.cfToNI !== null ? c.cfToNI : ''],
                    ['Total Environmental', esg.envScore, 35, '', ''],
                    ['Total Social', esg.socialScore, 35, '', ''],
                    ['Total Governance', esg.govScore, 30, '', ''],
                    ['Total ESG', esg.totalESG, 100, 'Rating', esg.rating]
                ]
            }
        ]
    };

    storeAnalysisData('esg', csvData);
}


// ============================================================
// CSV EXPORT: PORTFOLIO
// ============================================================
function storePortfolioCSV(results) {
    const totalValue = results.reduce((s, r) => s + r.quantity * r.lastPrice, 0);
    let weightedESG = 0;
    results.forEach(r => {
        const w = totalValue > 0 ? (r.quantity * r.lastPrice) / totalValue : 1 / results.length;
        weightedESG += w * r.esg.totalESG;
    });

    const sorted = results.slice().sort((a, b) => b.esg.totalESG - a.esg.totalESG);

    const csvData = {
        modelName: 'ESG Proxy Scoring & Analysis',
        firmStyle: 'BlackRock Style',
        runDate: new Date().toISOString(),
        ticker: 'PORTFOLIO',
        sections: [
            {
                title: 'Portfolio ESG Summary',
                type: 'metrics',
                rows: [
                    { label: 'Portfolio Weighted Avg ESG', value: Math.round(weightedESG), formatted: Math.round(weightedESG) + '/100' },
                    { label: 'Best Holding', value: sorted[0].symbol, formatted: sorted[0].symbol + ' (' + sorted[0].esg.totalESG + ')' },
                    { label: 'Worst Holding', value: sorted[sorted.length - 1].symbol, formatted: sorted[sorted.length - 1].symbol + ' (' + sorted[sorted.length - 1].esg.totalESG + ')' },
                    { label: 'Holdings Analyzed', value: results.length, formatted: results.length.toString() }
                ]
            },
            {
                title: 'Holdings ESG Scores',
                type: 'table',
                headers: ['Rank', 'Symbol', 'Name', 'Sector', 'E Score', 'S Score', 'G Score', 'Total ESG', 'Rating'],
                rows: sorted.map((r, i) => [
                    i + 1,
                    r.symbol,
                    r.name,
                    r.sector,
                    r.esg.envScore + '/35',
                    r.esg.socialScore + '/35',
                    r.esg.govScore + '/30',
                    r.esg.totalESG + '/100',
                    r.esg.rating
                ])
            },
            {
                title: 'Raw Financial Data — Per-Holding ESG Component Scores',
                type: 'table',
                headers: ['Symbol', 'Sector', 'Sector Env Risk', 'Efficiency', 'Size Bonus', 'E Total', 'Labor Proxy', 'Sector Labor', 'Scale', 'S Total', 'Transparency', 'Debt Mgmt', 'Earnings Qual', 'G Total', 'Total ESG', 'Rating'],
                rows: sorted.map(r => {
                    const c = r.esg.components;
                    return [
                        r.symbol,
                        r.sector,
                        c.sectorEnvRisk,
                        c.effScore,
                        c.sizeBonus,
                        r.esg.envScore,
                        c.laborScore,
                        c.sectorLabor,
                        c.scaleScore,
                        r.esg.socialScore,
                        c.transparencyScore,
                        c.debtScore,
                        c.eqScore,
                        r.esg.govScore,
                        r.esg.totalESG,
                        r.esg.rating
                    ];
                })
            }
        ]
    };

    storeAnalysisData('esg', csvData);
}
