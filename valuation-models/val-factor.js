/**
 * val-factor.js
 * Factor Exposure Analysis (AQR Style) for the UCSB DIG Valuation Analysis Lab.
 * Loaded via <script> tag in valuation.html -- all functions are globally accessible.
 *
 * Computes 5-factor exposure (Value, Momentum, Quality, Size, Low Volatility)
 * across all equity holdings using z-score cross-sectional rankings.
 *
 * Global utilities available from valuation.html:
 *   fmt(n, dec), fmtCur(n), fmtBig(n), fmtPct(n), clamp(v, lo, hi)
 *   apiBaseURL, chartInstances, storeAnalysisData(modelId, data)
 *   equityHoldings - array of {symbol, description, gicsSector, quantity, lastPrice}
 *   Chart.js available globally
 *
 * API endpoints used:
 *   GET {apiBaseURL}/api/stock/{symbol}/analytics
 *   GET {apiBaseURL}/api/stock/{symbol}/financials?limit=4
 *   GET {apiBaseURL}/api/stock/{symbol}/valuation-history?quarters=4
 *   GET {apiBaseURL}/api/stock/{symbol}/details
 */

// ============================================================
// Z-SCORE HELPER
// ============================================================

/**
 * Compute z-scores across the portfolio for a set of values.
 * Null / NaN values get a z-score of 0 (neutral).
 * All z-scores are clamped to [-2, 2].
 */
function _factorZScore(values) {
    const valid = values.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (valid.length === 0) return values.map(() => 0);
    const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
    const stdev = Math.sqrt(valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length) || 1;
    return values.map(v => (v !== null && v !== undefined && !isNaN(v)) ? clamp((v - mean) / stdev, -2, 2) : 0);
}


// ============================================================
// MAIN ANALYSIS FUNCTION
// ============================================================

async function runFactorExposure() {
    const output = document.getElementById('analysisOutput');
    const N = equityHoldings.length;
    output.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><br>Analyzing 5-factor exposure across ' + N + ' holdings...</div>';

    try {
        // ------------------------------------------------------------------
        // 1. Fetch data for all equity holdings in batches of 4
        // ------------------------------------------------------------------
        const BATCH_SIZE = 4;
        const BATCH_DELAY = 300; // ms between batches

        const rawResults = new Array(N).fill(null);

        for (let batchStart = 0; batchStart < N; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, N);
            const batchPromises = [];

            for (let i = batchStart; i < batchEnd; i++) {
                const sym = equityHoldings[i].symbol;
                const p = Promise.all([
                    fetch(`${apiBaseURL}/api/stock/${sym}/analytics`).then(r => r.json()).catch(() => null),
                    fetch(`${apiBaseURL}/api/stock/${sym}/financials?limit=4`).then(r => r.json()).catch(() => null),
                    fetch(`${apiBaseURL}/api/stock/${sym}/valuation-history?quarters=4`).then(r => r.json()).catch(() => null),
                    fetch(`${apiBaseURL}/api/stock/${sym}/details`).then(r => r.json()).catch(() => null)
                ]).then(([analyticsRes, financialsRes, valHistRes, detailsRes]) => {
                    rawResults[i] = { analyticsRes, financialsRes, valHistRes, detailsRes };
                }).catch(() => {
                    rawResults[i] = null;
                });
                batchPromises.push(p);
            }

            await Promise.all(batchPromises);

            // Delay between batches (skip after last batch)
            if (batchEnd < N) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }

        // ------------------------------------------------------------------
        // 2. Build holdings data array
        // ------------------------------------------------------------------
        const totalPortfolioValue = equityHoldings.reduce((s, h) => s + h.quantity * h.lastPrice, 0);

        const holdings = [];
        const failedSymbols = [];

        for (let i = 0; i < N; i++) {
            const h = equityHoldings[i];
            const mv = h.quantity * h.lastPrice;
            const weight = totalPortfolioValue > 0 ? mv / totalPortfolioValue : 1 / N;

            if (!rawResults[i]) {
                failedSymbols.push(h.symbol);
                // Use defaults for failed holdings
                holdings.push({
                    symbol: h.symbol,
                    description: h.description,
                    gicsSector: h.gicsSector,
                    quantity: h.quantity,
                    lastPrice: h.lastPrice,
                    weight: weight,
                    beta: 1,
                    volatility: 0.25,
                    momentum3m: 0,
                    peRatio: null,
                    pbRatio: null,
                    roe: null,
                    operatingMargin: null,
                    marketCap: null,
                    _failed: true
                });
                continue;
            }

            const { analyticsRes, financialsRes, valHistRes, detailsRes } = rawResults[i];

            // Analytics
            const analytics = (analyticsRes && analyticsRes.analytics) || analyticsRes || {};
            const beta = analytics.beta != null ? analytics.beta : 1;
            const volatility = analytics.volatility != null ? analytics.volatility : 0.25;
            const momentum3m = analytics.momentum3m != null ? analytics.momentum3m : 0;

            // Valuation history (latest available)
            const valHistory = (valHistRes && valHistRes.valuationHistory) || [];
            let peRatio = null;
            let pbRatio = null;
            for (let v = 0; v < valHistory.length; v++) {
                if (peRatio === null && valHistory[v].peRatio != null && valHistory[v].peRatio > 0) {
                    peRatio = valHistory[v].peRatio;
                }
                if (pbRatio === null && valHistory[v].pbRatio != null && valHistory[v].pbRatio > 0) {
                    pbRatio = valHistory[v].pbRatio;
                }
                if (peRatio !== null && pbRatio !== null) break;
            }

            // Financials (TTM from up to 4 quarters)
            const financials = (financialsRes && financialsRes.financials) || financialsRes || [];
            const quarterly = Array.isArray(financials)
                ? financials.filter(f => f.fiscalPeriod && f.fiscalPeriod !== 'FY').slice(0, 4)
                : [];

            let roe = null;
            let operatingMargin = null;

            if (quarterly.length > 0) {
                const ttmNetIncome = quarterly.reduce((s, q) => s + (q.netIncome || 0), 0);
                const ttmRevenue = quarterly.reduce((s, q) => s + (q.revenues || 0), 0);
                const ttmOpIncome = quarterly.reduce((s, q) => s + (q.operatingIncome || 0), 0);
                const latestEquity = quarterly[0].equity || 0;

                if (latestEquity > 0 && ttmNetIncome !== 0) {
                    roe = ttmNetIncome / latestEquity;
                }
                if (ttmRevenue > 0) {
                    operatingMargin = ttmOpIncome / ttmRevenue;
                }
            }

            // Details
            const details = detailsRes || {};
            const marketCap = details.marketCap || null;

            holdings.push({
                symbol: h.symbol,
                description: h.description,
                gicsSector: h.gicsSector,
                quantity: h.quantity,
                lastPrice: h.lastPrice,
                weight: weight,
                beta: beta,
                volatility: volatility,
                momentum3m: momentum3m,
                peRatio: peRatio,
                pbRatio: pbRatio,
                roe: roe,
                operatingMargin: operatingMargin,
                marketCap: marketCap,
                _failed: false
            });
        }

        // ------------------------------------------------------------------
        // 3. Check minimum data threshold
        // ------------------------------------------------------------------
        const successCount = holdings.filter(h => !h._failed).length;
        if (successCount < 5) {
            output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
                'Insufficient data: only ' + successCount + ' of ' + N + ' holdings returned data. ' +
                'Need at least 5 holdings for meaningful factor analysis. ' +
                'Failed symbols: ' + failedSymbols.join(', ') + '</div>';
            return;
        }

        // ------------------------------------------------------------------
        // 4. Compute factor z-scores
        // ------------------------------------------------------------------

        // Value Factor: z-score of -PE and z-score of -PB, averaged
        const negPE = holdings.map(h => (h.peRatio !== null && h.peRatio > 0) ? -h.peRatio : null);
        const negPB = holdings.map(h => (h.pbRatio !== null && h.pbRatio > 0) ? -h.pbRatio : null);
        const zNegPE = _factorZScore(negPE);
        const zNegPB = _factorZScore(negPB);

        const valueScores = holdings.map((h, i) => {
            const hasPE = negPE[i] !== null;
            const hasPB = negPB[i] !== null;
            if (hasPE && hasPB) return clamp((zNegPE[i] + zNegPB[i]) / 2, -2, 2);
            if (hasPE) return zNegPE[i];
            if (hasPB) return zNegPB[i];
            return 0;
        });

        // Momentum Factor: z-score of momentum3m
        const mom3m = holdings.map(h => h.momentum3m != null ? h.momentum3m : null);
        const momentumScores = _factorZScore(mom3m);

        // Quality Factor: average of z-score(ROE) and z-score(operatingMargin)
        const roeVals = holdings.map(h => h.roe);
        const opMarginVals = holdings.map(h => h.operatingMargin);
        const zROE = _factorZScore(roeVals);
        const zOpMargin = _factorZScore(opMarginVals);

        const qualityScores = holdings.map((h, i) => {
            const hasROE = h.roe !== null && !isNaN(h.roe);
            const hasMargin = h.operatingMargin !== null && !isNaN(h.operatingMargin);
            if (hasROE && hasMargin) return clamp((zROE[i] + zOpMargin[i]) / 2, -2, 2);
            if (hasROE) return zROE[i];
            if (hasMargin) return zOpMargin[i];
            return 0;
        });

        // Size Factor (small-cap premium): z-score of -log10(marketCap)
        const negLogCap = holdings.map(h => (h.marketCap !== null && h.marketCap > 0) ? -Math.log10(h.marketCap) : null);
        const sizeScores = _factorZScore(negLogCap);

        // Low Volatility Factor: z-score of -volatility
        const negVol = holdings.map(h => (h.volatility != null) ? -h.volatility : null);
        const lowVolScores = _factorZScore(negVol);

        // Store scores on holdings
        for (let i = 0; i < holdings.length; i++) {
            holdings[i].valueScore = valueScores[i];
            holdings[i].momentumScore = momentumScores[i];
            holdings[i].qualityScore = qualityScores[i];
            holdings[i].sizeScore = sizeScores[i];
            holdings[i].lowVolScore = lowVolScores[i];
            holdings[i].totalScore = valueScores[i] + momentumScores[i] + qualityScores[i] + sizeScores[i] + lowVolScores[i];
        }

        // ------------------------------------------------------------------
        // 5. Portfolio-level factor tilts (weighted sum)
        // ------------------------------------------------------------------
        const portfolioTilts = {
            value: holdings.reduce((s, h) => s + h.weight * h.valueScore, 0),
            momentum: holdings.reduce((s, h) => s + h.weight * h.momentumScore, 0),
            quality: holdings.reduce((s, h) => s + h.weight * h.qualityScore, 0),
            size: holdings.reduce((s, h) => s + h.weight * h.sizeScore, 0),
            lowVol: holdings.reduce((s, h) => s + h.weight * h.lowVolScore, 0)
        };

        // ------------------------------------------------------------------
        // 6. Factor diversification score
        // ------------------------------------------------------------------
        const absTilts = [
            Math.abs(portfolioTilts.value),
            Math.abs(portfolioTilts.momentum),
            Math.abs(portfolioTilts.quality),
            Math.abs(portfolioTilts.size),
            Math.abs(portfolioTilts.lowVol)
        ];
        const tiltMean = absTilts.reduce((s, v) => s + v, 0) / absTilts.length;
        const tiltStdev = Math.sqrt(absTilts.reduce((s, v) => s + (v - tiltMean) ** 2, 0) / absTilts.length);

        let diversificationScore, diversificationLabel;
        if (tiltStdev < 0.3) {
            diversificationScore = 9 + (tiltStdev < 0.15 ? 1 : 0); // 9-10
            diversificationLabel = 'Well Diversified';
        } else if (tiltStdev < 0.6) {
            const frac = (tiltStdev - 0.3) / 0.3;
            diversificationScore = Math.round(8 - frac * 2); // 6-8
            diversificationLabel = 'Moderately Diversified';
        } else if (tiltStdev < 1.0) {
            const frac = (tiltStdev - 0.6) / 0.4;
            diversificationScore = Math.round(5 - frac * 2); // 3-5
            diversificationLabel = 'Concentrated';
        } else {
            diversificationScore = tiltStdev > 1.5 ? 1 : 2; // 1-2
            diversificationLabel = 'Highly Concentrated';
        }
        diversificationScore = clamp(diversificationScore, 1, 10);

        // ------------------------------------------------------------------
        // 7. Render
        // ------------------------------------------------------------------
        renderFactorOutput(holdings, portfolioTilts, diversificationScore, diversificationLabel, failedSymbols);

        // ------------------------------------------------------------------
        // 8. Store CSV data
        // ------------------------------------------------------------------
        _storeFactorCSV(holdings, portfolioTilts, diversificationScore, diversificationLabel);

    } catch (err) {
        console.error('Factor Exposure Analysis Error:', err);
        output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
            'Error running factor exposure analysis: ' + err.message + '</div>';
    }
}


// ============================================================
// RENDER FUNCTION
// ============================================================

function renderFactorOutput(holdings, tilts, diversificationScore, diversificationLabel, failedSymbols) {
    const output = document.getElementById('analysisOutput');

    // Destroy previous chart instances
    ['factor_radar'].forEach(key => {
        if (chartInstances[key]) {
            try { chartInstances[key].destroy(); } catch (e) {}
            delete chartInstances[key];
        }
    });

    // Helpers
    function tiltColor(v) {
        if (Math.abs(v) < 0.15) return '#ffc107'; // near-zero: yellow
        return v > 0 ? '#28a745' : '#dc3545';
    }
    function tiltSign(v) {
        return (v >= 0 ? '+' : '') + v.toFixed(2);
    }
    function heatBg(score) {
        if (score > 1.0)  return 'rgba(40,167,69,0.35)';
        if (score > 0.5)  return 'rgba(40,167,69,0.15)';
        if (score > -0.5) return 'transparent';
        if (score > -1.0) return 'rgba(220,53,69,0.15)';
        return 'rgba(220,53,69,0.35)';
    }
    function heatColor(score) {
        if (score > 1.0)  return '#28a745';
        if (score > 0.5)  return '#6fcf8b';
        if (score > -0.5) return 'rgba(255,255,255,0.85)';
        if (score > -1.0) return '#e87c7c';
        return '#dc3545';
    }

    // Diversification badge color
    let divBadgeColor;
    if (diversificationScore >= 8) divBadgeColor = '#28a745';
    else if (diversificationScore >= 5) divBadgeColor = '#ffc107';
    else divBadgeColor = '#dc3545';

    // Sector uniqueness check
    const uniqueSectors = new Set(holdings.map(h => h.gicsSector));
    const lowSectorVariation = uniqueSectors.size <= 2;

    // Sort holdings by total score descending for the table
    const sortedHoldings = [...holdings].sort((a, b) => b.totalScore - a.totalScore);

    // Factor contribution analysis
    function getTopContributors(factorKey, tiltValue) {
        const contributions = holdings.map(h => ({
            symbol: h.symbol,
            score: h[factorKey],
            weight: h.weight,
            contribution: h.weight * h[factorKey]
        }));
        contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
        return contributions.slice(0, 3);
    }

    const factorContribs = {
        value: { label: 'Value', key: 'valueScore', tilt: tilts.value },
        momentum: { label: 'Momentum', key: 'momentumScore', tilt: tilts.momentum },
        quality: { label: 'Quality', key: 'qualityScore', tilt: tilts.quality },
        size: { label: 'Size', key: 'sizeScore', tilt: tilts.size },
        lowVol: { label: 'Low Volatility', key: 'lowVolScore', tilt: tilts.lowVol }
    };

    // ------------------------------------------------------------------
    // Build dynamic interpretation
    // ------------------------------------------------------------------
    const interpretation = _buildFactorInterpretation(tilts, diversificationLabel);

    // ------------------------------------------------------------------
    // HTML
    // ------------------------------------------------------------------
    let html = '<div class="result-grid">';

    // ---- Card 1: Factor Overview (span-2) ----
    html += '<div class="result-card span-2">';
    html += '<h3><i class="fas fa-dna"></i> Factor Exposure Overview</h3>';
    html += '<div class="metrics-row" style="grid-template-columns:repeat(5,1fr);">';

    const factorLabels = [
        { name: 'Value', val: tilts.value },
        { name: 'Momentum', val: tilts.momentum },
        { name: 'Quality', val: tilts.quality },
        { name: 'Size', val: tilts.size },
        { name: 'Low Vol', val: tilts.lowVol }
    ];
    factorLabels.forEach(f => {
        html += '<div class="metric-item">';
        html += '<div class="metric-label">' + f.name + '</div>';
        html += '<div class="metric-value" style="color:' + tiltColor(f.val) + ';">' + tiltSign(f.val) + '</div>';
        html += '</div>';
    });
    html += '</div>';

    // Diversification badge
    html += '<div style="text-align:center;margin-top:1rem;">';
    html += '<span style="display:inline-block;padding:0.4rem 1.2rem;border-radius:10px;font-weight:700;font-size:0.9rem;' +
        'background:' + divBadgeColor + '22;color:' + divBadgeColor + ';border:1px solid ' + divBadgeColor + ';">';
    html += 'Factor Diversification: ' + diversificationScore + '/10 &mdash; ' + diversificationLabel;
    html += '</span></div>';

    // Warnings
    if (failedSymbols.length > 0) {
        html += '<div style="margin-top:0.75rem;padding:0.5rem 0.8rem;background:rgba(253,126,20,0.1);border:1px solid rgba(253,126,20,0.3);border-radius:8px;font-size:0.8rem;color:#fd7e14;">';
        html += '<i class="fas fa-exclamation-triangle"></i> Data unavailable for: ' + failedSymbols.join(', ') + '. Defaults applied.';
        html += '</div>';
    }
    if (lowSectorVariation) {
        html += '<div style="margin-top:0.5rem;padding:0.5rem 0.8rem;background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.3);border-radius:8px;font-size:0.8rem;color:#ffc107;">';
        html += '<i class="fas fa-info-circle"></i> Low sector variation detected (' + uniqueSectors.size + ' sectors). Cross-sectional z-scores may have limited statistical meaning.';
        html += '</div>';
    }
    html += '</div>';

    // ---- Card 2: Radar Chart (span-2) ----
    html += '<div class="result-card span-2">';
    html += '<h3><i class="fas fa-project-diagram"></i> Factor Exposure Radar</h3>';
    html += '<div class="chart-box tall"><canvas id="factorRadarChart"></canvas></div>';
    html += '</div>';

    // ---- Card 3: Per-Holding Factor Scores Table (span-2) ----
    html += '<div class="result-card span-2">';
    html += '<h3><i class="fas fa-th"></i> Per-Holding Factor Scores</h3>';
    html += '<div class="heat-map-container">';
    html += '<table class="val-table">';
    html += '<thead><tr>';
    html += '<th>Symbol</th><th>Weight</th><th>Value</th><th>Momentum</th><th>Quality</th><th>Size</th><th>Low Vol</th><th>Total</th>';
    html += '</tr></thead><tbody>';

    sortedHoldings.forEach(h => {
        html += '<tr>';
        html += '<td style="font-weight:700;">' + h.symbol + '</td>';
        html += '<td>' + (h.weight * 100).toFixed(1) + '%</td>';

        const scores = [h.valueScore, h.momentumScore, h.qualityScore, h.sizeScore, h.lowVolScore];
        scores.forEach(sc => {
            html += '<td style="text-align:center;font-weight:600;background:' + heatBg(sc) + ';color:' + heatColor(sc) + ';">' + tiltSign(sc) + '</td>';
        });

        const total = h.totalScore;
        const totalColor = total > 1 ? '#28a745' : total < -1 ? '#dc3545' : '#febc11';
        html += '<td style="text-align:center;font-weight:800;color:' + totalColor + ';">' + tiltSign(total) + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table></div></div>';

    // ---- Card 4: Factor Contribution Analysis ----
    html += '<div class="result-card">';
    html += '<h3><i class="fas fa-chart-pie"></i> Factor Contribution Analysis</h3>';

    Object.keys(factorContribs).forEach(key => {
        const fc = factorContribs[key];
        const top3 = getTopContributors(fc.key, fc.tilt);
        const tiltStr = tiltSign(fc.tilt);
        const tc = tiltColor(fc.tilt);

        html += '<div style="margin-bottom:0.8rem;">';
        html += '<div style="font-weight:700;font-size:0.85rem;color:' + tc + ';">' + fc.label + ' tilt (' + tiltStr + ')</div>';
        html += '<div style="font-size:0.78rem;color:rgba(255,255,255,0.7);padding-left:0.5rem;">';
        top3.forEach((c, idx) => {
            const sign = c.contribution >= 0 ? '+' : '';
            html += c.symbol + ' (' + sign + c.contribution.toFixed(3) + ')';
            if (idx < top3.length - 1) html += ', ';
        });
        html += '</div></div>';
    });

    html += '</div>';

    // ---- Card 5: Interpretation (span-2) ----
    html += '<div class="result-card span-2">';
    html += '<h3><i class="fas fa-lightbulb"></i> Factor Interpretation</h3>';
    html += '<div style="font-size:0.9rem;line-height:1.7;color:rgba(255,255,255,0.85);">';
    html += interpretation;
    html += '</div>';
    html += '</div>';

    // ---- Card 6: Assumptions ----
    html += '<div class="result-card span-2">';
    html += '<div class="assumptions-box" style="margin:0;">';
    html += '<h4><i class="fas fa-info-circle"></i> Methodology & Assumptions</h4>';
    html += '<ul>';
    html += '<li>Factors are computed as cross-sectional z-scores within the DIG portfolio (not relative to the full market).</li>';
    html += '<li>Value Factor: Inverse of P/E and P/B ratios. Lower multiples indicate higher value exposure.</li>';
    html += '<li>Momentum Factor: 3-month price momentum from analytics. Higher momentum equals higher score.</li>';
    html += '<li>Quality Factor: Average of z-scored ROE (TTM net income / equity) and operating margin (TTM). Higher profitability equals higher quality.</li>';
    html += '<li>Size Factor: Inverse of log10(market cap). Smaller companies receive higher scores, capturing the small-cap premium.</li>';
    html += '<li>Low Volatility Factor: Inverse of annualized volatility. Less volatile stocks receive higher scores.</li>';
    html += '<li>Portfolio tilts are weight-averaged factor scores. S&amp;P 500 benchmark is neutral (all zeros) since z-scores center at zero.</li>';
    html += '<li>Factor diversification score (1-10) measures how evenly tilts are distributed across factors. Lower standard deviation of absolute tilts indicates better diversification.</li>';
    html += '<li>ETFs and holdings without financial data use neutral defaults (z-score of 0).</li>';
    html += '<li>Z-scores are clamped to [-2, +2] to limit outlier influence.</li>';
    html += '<li>This is an educational, CAPM-inspired multi-factor decomposition. For production use, consider established factor indices (e.g., MSCI, FTSE Russell).</li>';
    html += '</ul>';
    html += '<h4 style="margin-top:1rem;color:#febc11;font-size:0.85rem;">Step-by-Step: How to Replicate in Excel</h4>';
    html += '<ol style="font-size:0.8rem;color:rgba(255,255,255,0.6);line-height:1.8;">';
    html += '<li><strong>Download the CSV</strong> and open the "Raw Financial Data" section. You will see columns: Symbol, Beta, Volatility, Momentum 3M, P/E, P/B, ROE, Op Margin, Market Cap.</li>';
    html += '<li><strong>Value Factor</strong>: For each holding, compute <code>1 / P/E</code> and <code>1 / P/B</code>. Then z-score each column across all holdings: <code>z = (x - mean) / stdev</code>. Average the two z-scores = Value z-score.</li>';
    html += '<li><strong>Momentum Factor</strong>: Take the "Momentum 3M" column. Z-score it across all holdings. That is the Momentum z-score.</li>';
    html += '<li><strong>Quality Factor</strong>: Z-score the "ROE" column. Z-score the "Op Margin" column. Average = Quality z-score.</li>';
    html += '<li><strong>Size Factor</strong>: Compute <code>1 / log10(Market Cap)</code> for each holding. Z-score the result = Size z-score.</li>';
    html += '<li><strong>Low Vol Factor</strong>: Compute <code>1 / Volatility</code> for each holding. Z-score the result = Low Vol z-score.</li>';
    html += '<li><strong>Clamp</strong> all z-scores to [-2, +2] to prevent outlier distortion.</li>';
    html += '<li><strong>Portfolio Tilt</strong>: For each factor, multiply each holding\'s z-score by its portfolio weight, then sum: <code>Tilt = Σ(weight_i × zscore_i)</code>.</li>';
    html += '<li><strong>Diversification Score</strong>: Take the standard deviation of absolute tilts across all 5 factors. Map: stdev &lt; 0.1 → 10/10, stdev &gt; 0.7 → 1/10, linear in between.</li>';
    html += '</ol>';
    html += '</div></div>';

    // ---- Card 7: Download CSV ----
    html += '<div class="result-card span-2" style="text-align:center;padding:1.5rem;">';
    html += '<button class="run-btn" onclick="downloadModelCSV(\'factor\')" style="background:linear-gradient(135deg,#28a745,#20c997);">';
    html += '<i class="fas fa-download"></i> Download Factor Analysis CSV</button>';
    html += '</div>';

    html += '</div>'; // close result-grid

    output.innerHTML = html;

    // ---- Render Radar Chart ----
    setTimeout(() => {
        _renderFactorRadarChart(tilts);
    }, 100);
}


// ============================================================
// RADAR CHART
// ============================================================

function _renderFactorRadarChart(tilts) {
    const canvas = document.getElementById('factorRadarChart');
    if (!canvas) return;

    if (chartInstances['factor_radar']) {
        try { chartInstances['factor_radar'].destroy(); } catch (e) {}
    }

    chartInstances['factor_radar'] = new Chart(canvas.getContext('2d'), {
        type: 'radar',
        data: {
            labels: ['Value', 'Momentum', 'Quality', 'Size', 'Low Volatility'],
            datasets: [
                {
                    label: 'DIG Portfolio',
                    data: [tilts.value, tilts.momentum, tilts.quality, tilts.size, tilts.lowVol],
                    backgroundColor: 'rgba(254,188,17,0.2)',
                    borderColor: '#febc11',
                    borderWidth: 2,
                    pointBackgroundColor: '#febc11',
                    pointRadius: 4
                },
                {
                    label: 'S&P 500 (Neutral)',
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderColor: 'rgba(255,255,255,0.3)',
                    borderDash: [5, 5],
                    borderWidth: 1,
                    pointBackgroundColor: 'rgba(255,255,255,0.3)',
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    min: -2,
                    max: 2,
                    ticks: {
                        color: '#aaa',
                        backdropColor: 'transparent',
                        stepSize: 0.5,
                        font: { size: 10 }
                    },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    angleLines: { color: 'rgba(255,255,255,0.1)' },
                    pointLabels: {
                        color: '#e5e5e5',
                        font: { size: 13, weight: '600' }
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e5e5e5',
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,20,25,0.9)',
                    titleColor: '#febc11',
                    bodyColor: '#e5e5e5',
                    borderColor: 'rgba(254,188,17,0.3)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(ctx) {
                            return ctx.dataset.label + ': ' + (ctx.raw >= 0 ? '+' : '') + ctx.raw.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}


// ============================================================
// DYNAMIC INTERPRETATION BUILDER
// ============================================================

function _buildFactorInterpretation(tilts, diversificationLabel) {
    const factors = [
        { name: 'Value', tilt: tilts.value },
        { name: 'Momentum', tilt: tilts.momentum },
        { name: 'Quality', tilt: tilts.quality },
        { name: 'Size', tilt: tilts.size },
        { name: 'Low Volatility', tilt: tilts.lowVol }
    ];

    // Sort by absolute tilt descending
    const ranked = [...factors].sort((a, b) => Math.abs(b.tilt) - Math.abs(a.tilt));

    const strongest = ranked[0];
    const secondStrongest = ranked[1];
    const weakest = ranked[ranked.length - 1];

    const lines = [];

    // Describe the strongest tilt
    if (Math.abs(strongest.tilt) > 0.3) {
        const dir = strongest.tilt > 0 ? 'positive' : 'negative';
        const sign = strongest.tilt > 0 ? '+' : '';
        let desc = '';
        if (strongest.name === 'Quality' && strongest.tilt > 0) {
            desc = 'suggesting a preference for companies with strong profitability metrics (high ROE and operating margins)';
        } else if (strongest.name === 'Quality' && strongest.tilt < 0) {
            desc = 'suggesting the portfolio leans toward companies with lower profitability metrics relative to its peers';
        } else if (strongest.name === 'Value' && strongest.tilt > 0) {
            desc = 'indicating a tilt toward stocks trading at lower valuation multiples (lower P/E and P/B)';
        } else if (strongest.name === 'Value' && strongest.tilt < 0) {
            desc = 'indicating the portfolio favors higher-growth, higher-multiple stocks over deep-value names';
        } else if (strongest.name === 'Momentum' && strongest.tilt > 0) {
            desc = 'indicating strong recent price momentum across holdings';
        } else if (strongest.name === 'Momentum' && strongest.tilt < 0) {
            desc = 'indicating recent price weakness or mean-reverting tendencies across holdings';
        } else if (strongest.name === 'Size' && strongest.tilt > 0) {
            desc = 'indicating a tilt toward smaller-capitalization companies within the portfolio';
        } else if (strongest.name === 'Size' && strongest.tilt < 0) {
            desc = 'indicating an overweight to large-cap stocks relative to a market-neutral portfolio';
        } else if (strongest.name === 'Low Volatility' && strongest.tilt > 0) {
            desc = 'reflecting a portfolio skewed toward lower-volatility, more defensive names';
        } else if (strongest.name === 'Low Volatility' && strongest.tilt < 0) {
            desc = 'reflecting a portfolio skewed toward higher-volatility, higher-beta names';
        }
        lines.push('The DIG portfolio has a significant <strong>' + strongest.name + '</strong> tilt (' +
            sign + strongest.tilt.toFixed(2) + '), ' + desc + '.');
    } else {
        lines.push('The DIG portfolio shows relatively balanced factor exposures with no single dominant tilt.');
    }

    // Second strongest
    if (Math.abs(secondStrongest.tilt) > 0.2) {
        const dir2 = secondStrongest.tilt > 0 ? 'positive' : 'negative';
        lines.push('The portfolio also shows notable <strong>' + secondStrongest.name + '</strong> exposure (' +
            (secondStrongest.tilt > 0 ? '+' : '') + secondStrongest.tilt.toFixed(2) + ').');
    }

    // Describe near-neutral factors
    const nearNeutral = factors.filter(f => Math.abs(f.tilt) < 0.15);
    if (nearNeutral.length > 0) {
        const names = nearNeutral.map(f => f.name).join(' and ');
        lines.push('The portfolio is roughly neutral on ' + names + ', showing no strong directional bias in ' +
            (nearNeutral.length === 1 ? 'this factor' : 'these factors') + '.');
    }

    // Size-specific note
    if (tilts.size < -0.3) {
        lines.push('The negative Size tilt indicates the portfolio is dominated by mega-cap and large-cap stocks, ' +
            'which may reduce exposure to the empirically documented small-cap premium.');
    }

    // Diversification note
    lines.push('Overall factor diversification is rated as <strong>' + diversificationLabel + '</strong>.');

    return lines.join(' ');
}


// ============================================================
// CSV DATA BUILDER
// ============================================================

function _storeFactorCSV(holdings, tilts, diversificationScore, diversificationLabel) {
    const sections = [];

    // Section 1: Portfolio Factor Tilts
    sections.push({
        title: 'Portfolio Factor Tilts',
        type: 'metrics',
        rows: [
            { label: 'Value Tilt', formatted: (tilts.value >= 0 ? '+' : '') + tilts.value.toFixed(3) },
            { label: 'Momentum Tilt', formatted: (tilts.momentum >= 0 ? '+' : '') + tilts.momentum.toFixed(3) },
            { label: 'Quality Tilt', formatted: (tilts.quality >= 0 ? '+' : '') + tilts.quality.toFixed(3) },
            { label: 'Size Tilt', formatted: (tilts.size >= 0 ? '+' : '') + tilts.size.toFixed(3) },
            { label: 'Low Volatility Tilt', formatted: (tilts.lowVol >= 0 ? '+' : '') + tilts.lowVol.toFixed(3) },
            { label: 'Diversification Score', formatted: diversificationScore + '/10 (' + diversificationLabel + ')' }
        ]
    });

    // Section 2: Per-Holding Factor Scores
    sections.push({
        title: 'Per-Holding Factor Scores',
        type: 'table',
        headers: ['Symbol', 'Description', 'Weight', 'Value', 'Momentum', 'Quality', 'Size', 'Low Vol', 'Total'],
        rows: holdings.map(h => [
            h.symbol,
            h.description,
            (h.weight * 100).toFixed(2) + '%',
            h.valueScore.toFixed(2),
            h.momentumScore.toFixed(2),
            h.qualityScore.toFixed(2),
            h.sizeScore.toFixed(2),
            h.lowVolScore.toFixed(2),
            h.totalScore.toFixed(2)
        ])
    });

    // Section 3: Raw Data (unformatted for Excel analysis)
    sections.push({
        title: 'Raw Financial Data — Per-Holding Metrics',
        type: 'table',
        headers: ['Symbol', 'Beta', 'Volatility', 'Momentum 3M', 'P/E', 'P/B', 'ROE', 'Op Margin', 'Market Cap'],
        rows: holdings.map(h => [
            h.symbol,
            h.beta !== null ? h.beta : '',
            h.volatility !== null ? h.volatility : '',
            h.momentum3m !== null ? h.momentum3m : '',
            h.peRatio !== null ? h.peRatio : '',
            h.pbRatio !== null ? h.pbRatio : '',
            h.roe !== null ? h.roe : '',
            h.operatingMargin !== null ? h.operatingMargin : '',
            h.marketCap !== null ? h.marketCap : ''
        ])
    });

    storeAnalysisData('factor', {
        modelName: 'Factor Exposure Analysis',
        firmStyle: 'AQR Style',
        runDate: new Date().toISOString(),
        ticker: 'PORTFOLIO',
        sections: sections
    });
}
