/**
 * val-capital-allocation.js
 * Capital Allocation Scorecard (Berkshire / Buffett Style)
 * Loaded via <script> tag in valuation.html -- all functions are globally accessible.
 *
 * Dependencies available from valuation.html:
 *   fmt(n, dec), fmtCur(n), fmtBig(n), fmtPct(n), clamp(v, lo, hi)
 *   apiBaseURL, chartInstances, storeAnalysisData(), downloadModelCSV()
 */

// ============================================================
// HELPER: Simple Linear Regression Slope
// ============================================================

/**
 * Returns the slope of a simple linear regression on the array `ys`.
 * The x-values are assumed to be 0, 1, 2, ...
 * Returns 0 if fewer than 2 data points.
 */
function _capLinRegSlope(ys) {
    var n = ys.length;
    if (n < 2) return 0;
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (var i = 0; i < n; i++) {
        sumX += i;
        sumY += ys[i];
        sumXY += i * ys[i];
        sumX2 += i * i;
    }
    var denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return 0;
    return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Classify a slope into a trend label and color.
 * Returns { label, color, arrow }
 */
function _capTrendClass(slope) {
    if (slope > 0.001) return { label: 'Expanding', color: '#28a745', arrow: '\u2191' };
    if (slope < -0.001) return { label: 'Contracting', color: '#dc3545', arrow: '\u2193' };
    return { label: 'Stable', color: '#ffc107', arrow: '\u2192' };
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

async function runCapitalAllocation(symbol) {
    var output = document.getElementById('analysisOutput');
    output.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><br>Running capital allocation analysis for ' + symbol + '...</div>';

    try {
        // ----------------------------------------------------------
        // 1) Fetch all data in parallel
        // ----------------------------------------------------------
        var fetchFn = typeof cachedFetch === 'function' ? cachedFetch : function(url) {
            return fetch(url).then(function(r) { return r.json(); });
        };

        var results = await Promise.all([
            fetchFn(apiBaseURL + '/api/stock/' + symbol + '/financials?limit=12'),
            fetchFn(apiBaseURL + '/api/stock/' + symbol + '/value-creation?quarters=12'),
            fetchFn(apiBaseURL + '/api/stock/' + symbol + '/details'),
            fetchFn(apiBaseURL + '/api/stock/' + symbol + '/analytics')
        ]);

        var financialsRes = results[0];
        var vcRes = results[1];
        var details = results[2] || {};
        var analyticsRes = results[3];

        var financials = financialsRes.financials || financialsRes || [];
        var vcRaw = vcRes.valueCreation || [];
        var analytics = analyticsRes.analytics || analyticsRes || {};

        // ----------------------------------------------------------
        // 2) Filter value-creation to quarterly, sort ascending by date
        // ----------------------------------------------------------
        var vcData = vcRaw
            .filter(function(v) { return v.fiscalPeriod && v.fiscalPeriod !== 'FY'; })
            .sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

        if (vcData.length < 4) {
            output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>Insufficient value-creation data for ' + symbol + '. Need at least 4 quarters (found ' + vcData.length + '). This may be an ETF or a recently listed company.</div>';
            return;
        }

        // ----------------------------------------------------------
        // NORMALIZE: The value-creation API returns percentage fields
        // already multiplied by 100 (e.g., roic=9.77 means 9.77%).
        // Convert to decimal form (0.0977) so all downstream math
        // (WACC comparison, scoring thresholds) works correctly.
        // ----------------------------------------------------------
        var pctFields = ['roic', 'roe', 'roa', 'profitMargin', 'grossMargin', 'operatingMargin', 'netMargin'];
        for (var vi = 0; vi < vcData.length; vi++) {
            for (var fi = 0; fi < pctFields.length; fi++) {
                var field = pctFields[fi];
                if (vcData[vi][field] != null) {
                    vcData[vi][field] = vcData[vi][field] / 100;
                }
            }
        }

        // Filter financials to quarterly, sort ascending
        var quarterly = financials
            .filter(function(f) { return f.fiscalPeriod !== 'FY'; })
            .sort(function(a, b) { return new Date(a.date || a.period) - new Date(b.date || b.period); });

        // ----------------------------------------------------------
        // A) WACC Calculation
        // ----------------------------------------------------------
        var riskFreeRate = 0.045;
        var equityRiskPremium = 0.055;
        var beta = analytics.beta || 1.0;
        var costOfEquity = riskFreeRate + beta * equityRiskPremium;
        var debtWeight = 0.3;
        var equityWeight = 0.7;
        var costOfDebt = 0.05;
        var taxRate = 0.21;
        var wacc = equityWeight * costOfEquity + debtWeight * costOfDebt * (1 - taxRate);
        wacc = clamp(wacc, 0.06, 0.15);

        // ----------------------------------------------------------
        // B) ROIC vs WACC Spread
        // ----------------------------------------------------------
        var roicValues = [];
        var roicLabels = [];
        for (var i = 0; i < vcData.length; i++) {
            var roicVal = vcData[i].roic || 0;
            roicValues.push(roicVal);
            roicLabels.push((vcData[i].fiscalPeriod || '') + ' ' + (vcData[i].fiscalYear || ''));
        }

        var latestROIC = roicValues[roicValues.length - 1] || 0;
        var avgROIC = roicValues.reduce(function(s, v) { return s + v; }, 0) / roicValues.length;
        var roicSlope = _capLinRegSlope(roicValues);
        var roicSpread = latestROIC - wacc;
        var roicTrend = _capTrendClass(roicSlope);

        // ----------------------------------------------------------
        // C) Return on Incremental Capital
        // ----------------------------------------------------------
        var incrementalROICs = [];
        for (var i = 1; i < vcData.length; i++) {
            var opInc_t = vcData[i].operatingIncome || 0;
            var opInc_prev = vcData[i - 1].operatingIncome || 0;
            var assets_t = vcData[i].assets || 0;
            var assets_prev = vcData[i - 1].assets || 0;
            var deltaAssets = assets_t - assets_prev;
            if (deltaAssets !== 0) {
                incrementalROICs.push((opInc_t - opInc_prev) / deltaAssets);
            }
        }
        var avgIncrementalROIC = incrementalROICs.length > 0
            ? incrementalROICs.reduce(function(s, v) { return s + v; }, 0) / incrementalROICs.length
            : null;

        // ----------------------------------------------------------
        // D) Revenue Per Employee
        // ----------------------------------------------------------
        var totalEmployees = details.totalEmployees || 0;
        // TTM Revenue from financials (last 4 quarters descending)
        var financialsDesc = quarterly.slice().reverse();
        var recentQFinancials = financialsDesc.slice(0, Math.min(4, financialsDesc.length));
        var ttmRevenue = recentQFinancials.reduce(function(s, q) { return s + (q.revenues || 0); }, 0);
        var ttmNetIncome = recentQFinancials.reduce(function(s, q) { return s + (q.netIncome || 0); }, 0);
        var ttmCashFlow = recentQFinancials.reduce(function(s, q) { return s + (q.cashFlow || 0); }, 0);
        var ttmOperatingIncome = recentQFinancials.reduce(function(s, q) { return s + (q.operatingIncome || 0); }, 0);

        var revenuePerEmployee = null;
        var revenuePerEmployeeStr = 'N/A (employee data unavailable)';
        if (totalEmployees > 0 && ttmRevenue > 0) {
            revenuePerEmployee = ttmRevenue / totalEmployees;
            revenuePerEmployeeStr = fmtCur(revenuePerEmployee);
        }

        // ----------------------------------------------------------
        // E) Margin Analysis
        // ----------------------------------------------------------
        var grossMargins = [];
        var opMargins = [];
        var netMargins = [];
        for (var i = 0; i < vcData.length; i++) {
            grossMargins.push(vcData[i].grossMargin || 0);
            opMargins.push(vcData[i].operatingMargin || 0);
            netMargins.push(vcData[i].netMargin || 0);
        }

        var grossMarginSlope = _capLinRegSlope(grossMargins);
        var opMarginSlope = _capLinRegSlope(opMargins);
        var netMarginSlope = _capLinRegSlope(netMargins);

        var grossMarginTrend = _capTrendClass(grossMarginSlope);
        var opMarginTrend = _capTrendClass(opMarginSlope);
        var netMarginTrend = _capTrendClass(netMarginSlope);

        var marginExpansionCount = 0;
        if (grossMarginSlope > 0.001) marginExpansionCount++;
        if (opMarginSlope > 0.001) marginExpansionCount++;
        if (netMarginSlope > 0.001) marginExpansionCount++;

        // ----------------------------------------------------------
        // F) Reinvestment Rate
        // ----------------------------------------------------------
        var totalDividends = 0;
        for (var i = 0; i < recentQFinancials.length; i++) {
            totalDividends += Math.abs(recentQFinancials[i].dividends || 0);
        }
        var reinvestmentRate = 0;
        if (ttmNetIncome > 0) {
            reinvestmentRate = 1 - (totalDividends / ttmNetIncome);
        } else if (ttmCashFlow > 0 && ttmOperatingIncome > 0) {
            reinvestmentRate = (ttmCashFlow - totalDividends) / ttmOperatingIncome;
        }
        reinvestmentRate = clamp(reinvestmentRate, 0, 1);

        // ----------------------------------------------------------
        // G) Capital Efficiency Score (1-10)
        // ----------------------------------------------------------
        var score = 0;

        // ROIC vs WACC (2 pts)
        var roicVsWaccPts = 0;
        if (latestROIC > wacc + 0.05) { roicVsWaccPts = 2; }
        else if (latestROIC > wacc) { roicVsWaccPts = 1; }
        score += roicVsWaccPts;

        // ROIC trending up (2 pts)
        var roicTrendPts = 0;
        if (roicSlope > 0.001) { roicTrendPts = 2; }
        else if (roicSlope > -0.001) { roicTrendPts = 1; }
        score += roicTrendPts;

        // Margins expanding (2 pts)
        var marginPts = 0;
        if (marginExpansionCount >= 2) { marginPts = 2; }
        else if (marginExpansionCount >= 1) { marginPts = 1; }
        score += marginPts;

        // Revenue efficiency (2 pts) -- revenue growth vs asset growth
        var earliestVC = vcData[0];
        var latestVC = vcData[vcData.length - 1];
        var earliestRevenue = earliestVC.revenues || 0;
        var latestRevenue = latestVC.revenues || 0;
        var earliestAssets = earliestVC.assets || 0;
        var latestAssets = latestVC.assets || 0;

        var revenueGrowth = Math.abs(earliestRevenue) > 0
            ? (latestRevenue - earliestRevenue) / Math.abs(earliestRevenue) : 0;
        var assetGrowth = Math.abs(earliestAssets) > 0
            ? (latestAssets - earliestAssets) / Math.abs(earliestAssets) : 0;

        var revEffPts = 0;
        if (revenueGrowth > assetGrowth * 1.2) { revEffPts = 2; }
        else if (revenueGrowth > assetGrowth) { revEffPts = 1; }
        score += revEffPts;

        // Debt management (1 pt)
        var latestDE = latestVC.debtToEquity || 0;
        var negativeEquity = (latestVC.equity || 0) < 0;
        var debtPts = 0;
        if (!negativeEquity && latestDE < 2.0) { debtPts = 1; }
        score += debtPts;

        // Positive reinvestment (1 pt)
        var reinvestPts = 0;
        if (reinvestmentRate > 0.3 && reinvestmentRate < 0.95) { reinvestPts = 1; }
        score += reinvestPts;

        score = clamp(score, 1, 10);

        // ----------------------------------------------------------
        // H) Moat Assessment
        // ----------------------------------------------------------
        var moatAssessment, moatEmoji;
        if (latestROIC > 0.15 && marginExpansionCount >= 1 && score >= 7) {
            moatAssessment = 'Strong Moat';
            moatEmoji = ' \uD83C\uDFF0'; // castle emoji
        } else if (latestROIC > 0.10 && score >= 5) {
            moatAssessment = 'Moderate Moat';
            moatEmoji = '';
        } else {
            moatAssessment = 'Weak/No Moat';
            moatEmoji = '';
        }

        // ----------------------------------------------------------
        // DuPont Decomposition (latest)
        // ----------------------------------------------------------
        var latestProfitMargin = latestVC.profitMargin || 0;
        var latestAssetTurnover = latestVC.assetTurnover || 0;
        var latestEquityMultiplier = latestVC.equityMultiplier || 0;
        var latestROE = latestVC.roe || 0;
        var latestROA = latestVC.roa || 0;

        // DuPont trends (compare first vs last quarter)
        var earliestPM = earliestVC.profitMargin || 0;
        var earliestAT = earliestVC.assetTurnover || 0;
        var earliestEM = earliestVC.equityMultiplier || 0;
        var pmSlope = _capLinRegSlope(vcData.map(function(v) { return v.profitMargin || 0; }));
        var atSlope = _capLinRegSlope(vcData.map(function(v) { return v.assetTurnover || 0; }));
        var emSlope = _capLinRegSlope(vcData.map(function(v) { return v.equityMultiplier || 0; }));
        var pmTrend = _capTrendClass(pmSlope);
        var atTrend = _capTrendClass(atSlope);
        var emTrend = _capTrendClass(emSlope);

        // ----------------------------------------------------------
        // 5) Render
        // ----------------------------------------------------------
        renderCapitalAllocationOutput(
            symbol, details.name || symbol, score, moatAssessment, moatEmoji,
            wacc, latestROIC, avgROIC, roicSpread, roicSlope, roicTrend,
            roicValues, roicLabels,
            grossMargins, opMargins, netMargins,
            grossMarginTrend, opMarginTrend, netMarginTrend, marginExpansionCount,
            revenueGrowth, assetGrowth,
            latestDE, negativeEquity,
            reinvestmentRate,
            revenuePerEmployeeStr,
            avgIncrementalROIC,
            latestROA,
            latestProfitMargin, latestAssetTurnover, latestEquityMultiplier, latestROE,
            pmTrend, atTrend, emTrend,
            roicVsWaccPts, roicTrendPts, marginPts, revEffPts, debtPts, reinvestPts,
            beta, riskFreeRate, equityRiskPremium, costOfEquity, costOfDebt, taxRate
        );

        // ----------------------------------------------------------
        // 6) Store CSV data
        // ----------------------------------------------------------
        storeAnalysisData('capital', {
            modelName: 'Capital Allocation Scorecard',
            firmStyle: 'Berkshire / Buffett',
            runDate: new Date().toISOString(),
            ticker: symbol,
            sections: [
                {
                    title: 'Capital Efficiency Score',
                    type: 'metrics',
                    rows: [
                        { label: 'Overall Score', value: score, formatted: score + '/10' },
                        { label: 'Moat Assessment', value: moatAssessment, formatted: moatAssessment },
                        { label: 'Latest ROIC', value: latestROIC, formatted: (latestROIC * 100).toFixed(2) + '%' },
                        { label: 'Average ROIC', value: avgROIC, formatted: (avgROIC * 100).toFixed(2) + '%' },
                        { label: 'WACC', value: wacc, formatted: (wacc * 100).toFixed(2) + '%' },
                        { label: 'ROIC-WACC Spread', value: roicSpread, formatted: (roicSpread * 100).toFixed(2) + '%' },
                        { label: 'Reinvestment Rate', value: reinvestmentRate, formatted: (reinvestmentRate * 100).toFixed(1) + '%' },
                        { label: 'Revenue per Employee', value: revenuePerEmployee, formatted: revenuePerEmployeeStr },
                        { label: 'Incremental ROIC', value: avgIncrementalROIC, formatted: avgIncrementalROIC != null ? (avgIncrementalROIC * 100).toFixed(2) + '%' : 'N/A' },
                        { label: 'Debt-to-Equity', value: latestDE, formatted: negativeEquity ? 'N/A (negative equity)' : fmt(latestDE) }
                    ]
                },
                {
                    title: 'Scorecard Breakdown',
                    type: 'table',
                    headers: ['Category', 'Points', 'Max'],
                    rows: [
                        ['ROIC vs WACC', roicVsWaccPts, 2],
                        ['ROIC Trend', roicTrendPts, 2],
                        ['Margin Expansion', marginPts, 2],
                        ['Revenue Efficiency', revEffPts, 2],
                        ['Debt Management', debtPts, 1],
                        ['Reinvestment', reinvestPts, 1]
                    ]
                },
                {
                    title: 'DuPont Decomposition',
                    type: 'metrics',
                    rows: [
                        { label: 'Profit Margin', value: latestProfitMargin, formatted: (latestProfitMargin * 100).toFixed(2) + '%' },
                        { label: 'Asset Turnover', value: latestAssetTurnover, formatted: fmt(latestAssetTurnover) },
                        { label: 'Equity Multiplier', value: latestEquityMultiplier, formatted: fmt(latestEquityMultiplier) },
                        { label: 'ROE', value: latestROE, formatted: (latestROE * 100).toFixed(2) + '%' }
                    ]
                },
                {
                    title: 'ROIC by Quarter',
                    type: 'table',
                    headers: ['Quarter', 'ROIC', 'Spread vs WACC'],
                    rows: roicLabels.map(function(lbl, idx) {
                        return [
                            lbl,
                            (roicValues[idx] * 100).toFixed(2) + '%',
                            ((roicValues[idx] - wacc) * 100).toFixed(2) + '%'
                        ];
                    })
                },
                {
                    title: 'Margin Trends',
                    type: 'table',
                    headers: ['Quarter', 'Gross Margin', 'Operating Margin', 'Net Margin'],
                    rows: roicLabels.map(function(lbl, idx) {
                        return [
                            lbl,
                            (grossMargins[idx] * 100).toFixed(2) + '%',
                            (opMargins[idx] * 100).toFixed(2) + '%',
                            (netMargins[idx] * 100).toFixed(2) + '%'
                        ];
                    })
                },
                {
                    title: 'Raw Financial Data — Quarterly Value-Creation',
                    type: 'table',
                    headers: ['Period', 'Date', 'ROIC', 'ROE', 'ROA', 'Gross Margin', 'Op Margin', 'Net Margin', 'Asset Turnover', 'Equity Multiplier', 'D/E'],
                    rows: vcData.map(function(v) {
                        return [
                            (v.fiscalPeriod || '') + ' ' + (v.fiscalYear || ''),
                            v.date || '',
                            v.roic || 0,
                            v.roe || 0,
                            v.roa || 0,
                            v.grossMargin || 0,
                            v.operatingMargin || 0,
                            v.netMargin || 0,
                            v.assetTurnover || 0,
                            v.equityMultiplier || 0,
                            v.debtToEquity || 0
                        ];
                    })
                },
                {
                    title: 'Raw Financial Data — Quarterly Financials',
                    type: 'table',
                    headers: ['Period', 'Date', 'Revenue', 'Operating Income', 'Net Income', 'Cash Flow', 'Assets', 'Equity'],
                    rows: quarterly.map(function(q) {
                        return [
                            (q.fiscalPeriod || '') + ' ' + (q.fiscalYear || ''),
                            q.endDate || q.startDate || q.date || '',
                            q.revenues || 0,
                            q.operatingIncome || 0,
                            q.netIncome || 0,
                            q.cashFlow || 0,
                            q.assets || 0,
                            q.equity || 0
                        ];
                    })
                }
            ]
        });

    } catch (err) {
        console.error('Capital Allocation Error:', err);
        output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>Error running capital allocation analysis for ' + symbol + ': ' + err.message + '</div>';
    }
}


// ============================================================
// RENDER OUTPUT
// ============================================================

function renderCapitalAllocationOutput(
    symbol, companyName, score, moatAssessment, moatEmoji,
    wacc, latestROIC, avgROIC, roicSpread, roicSlope, roicTrend,
    roicValues, roicLabels,
    grossMargins, opMargins, netMargins,
    grossMarginTrend, opMarginTrend, netMarginTrend, marginExpansionCount,
    revenueGrowth, assetGrowth,
    latestDE, negativeEquity,
    reinvestmentRate,
    revenuePerEmployeeStr,
    avgIncrementalROIC,
    latestROA,
    latestProfitMargin, latestAssetTurnover, latestEquityMultiplier, latestROE,
    pmTrend, atTrend, emTrend,
    roicVsWaccPts, roicTrendPts, marginPts, revEffPts, debtPts, reinvestPts,
    beta, riskFreeRate, equityRiskPremium, costOfEquity, costOfDebt, taxRate
) {
    var output = document.getElementById('analysisOutput');

    // Verdict class
    var verdictClass;
    if (score >= 8) { verdictClass = 'undervalued'; }
    else if (score >= 5) { verdictClass = 'fairly-valued'; }
    else { verdictClass = 'overvalued'; }

    // Star helper: returns gold stars for points earned
    function stars(pts) {
        var s = '';
        for (var i = 0; i < pts; i++) {
            s += '<span style="color:#febc11;">\u2B50</span>';
        }
        return s || '<span style="opacity:0.3;">\u2014</span>';
    }

    // Margin trend summary helpers
    function marginArrow(trend) {
        return '<span style="color:' + trend.color + ';">' + trend.arrow + '</span>';
    }

    var marginSummary = 'Gross ' + grossMarginTrend.arrow + ', Op ' + opMarginTrend.arrow + ', Net ' + netMarginTrend.arrow;

    // Revenue efficiency label
    var revEffLabel;
    if (revenueGrowth > assetGrowth * 1.2) { revEffLabel = 'Highly Efficient'; }
    else if (revenueGrowth > assetGrowth) { revEffLabel = 'Efficient'; }
    else { revEffLabel = 'Capital Intensive'; }

    // Debt label
    var debtLabel;
    if (negativeEquity) { debtLabel = 'N/A (negative equity)'; }
    else if (latestDE < 1.0) { debtLabel = 'Conservative'; }
    else if (latestDE < 2.0) { debtLabel = 'Moderate'; }
    else { debtLabel = 'High Leverage'; }

    // Reinvestment label
    var reinvestLabel;
    if (reinvestmentRate > 0.8) { reinvestLabel = 'Heavy Reinvestment'; }
    else if (reinvestmentRate > 0.3) { reinvestLabel = 'Balanced'; }
    else { reinvestLabel = 'Returning Capital'; }

    output.innerHTML = ''
        // ---- Card 1: Verdict (span-2) ----
        + '<div class="result-card span-2 verdict-card">'
        + '  <div class="verdict-badge ' + verdictClass + '">' + score + '/10 Capital Efficiency</div>'
        + '  <div class="verdict-price">' + moatAssessment + moatEmoji + '</div>'
        + '  <div class="verdict-detail">' + symbol + ' &mdash; ROIC ' + fmtPct(latestROIC * 100) + ' vs WACC ' + fmtPct(wacc * 100) + ' &mdash; Spread: ' + fmtPct(roicSpread * 100) + '</div>'
        + '</div>'

        + '<div class="result-grid">'

        // ---- Card 2: Scorecard Table ----
        + '<div class="result-card">'
        + '  <h3><i class="fas fa-clipboard-check"></i> Capital Allocation Scorecard</h3>'
        + '  <table class="val-table">'
        + '    <thead><tr><th>Category</th><th>Metric</th><th>Assessment</th><th>Grade</th></tr></thead>'
        + '    <tbody>'
        + '      <tr>'
        + '        <td>ROIC vs WACC</td>'
        + '        <td>ROIC: ' + (latestROIC * 100).toFixed(1) + '%, WACC: ' + (wacc * 100).toFixed(1) + '%</td>'
        + '        <td class="' + (roicSpread > 0 ? 'positive' : 'negative') + '">Spread: ' + fmtPct(roicSpread * 100) + '</td>'
        + '        <td>' + stars(roicVsWaccPts) + '</td>'
        + '      </tr>'
        + '      <tr>'
        + '        <td>ROIC Trend</td>'
        + '        <td>Slope: ' + (roicSlope > 0 ? '+' : '') + roicSlope.toFixed(4) + '/qtr</td>'
        + '        <td style="color:' + roicTrend.color + ';">' + roicTrend.label + '</td>'
        + '        <td>' + stars(roicTrendPts) + '</td>'
        + '      </tr>'
        + '      <tr>'
        + '        <td>Margin Expansion</td>'
        + '        <td>' + marginExpansionCount + ' of 3 expanding</td>'
        + '        <td>' + marginSummary + '</td>'
        + '        <td>' + stars(marginPts) + '</td>'
        + '      </tr>'
        + '      <tr>'
        + '        <td>Revenue Efficiency</td>'
        + '        <td>Rev growth ' + (revenueGrowth * 100).toFixed(1) + '%, Asset growth ' + (assetGrowth * 100).toFixed(1) + '%</td>'
        + '        <td>' + revEffLabel + '</td>'
        + '        <td>' + stars(revEffPts) + '</td>'
        + '      </tr>'
        + '      <tr>'
        + '        <td>Debt Management</td>'
        + '        <td>D/E: ' + (negativeEquity ? 'N/A' : fmt(latestDE)) + '</td>'
        + '        <td>' + debtLabel + '</td>'
        + '        <td>' + stars(debtPts) + '</td>'
        + '      </tr>'
        + '      <tr>'
        + '        <td>Reinvestment</td>'
        + '        <td>Rate: ' + (reinvestmentRate * 100).toFixed(1) + '%</td>'
        + '        <td>' + reinvestLabel + '</td>'
        + '        <td>' + stars(reinvestPts) + '</td>'
        + '      </tr>'
        + '    </tbody>'
        + '  </table>'
        + '</div>'

        // ---- Card 3: ROIC Trend Chart ----
        + '<div class="result-card">'
        + '  <h3><i class="fas fa-chart-line"></i> ROIC vs WACC Trend</h3>'
        + '  <div class="chart-box" style="height:250px;"><canvas id="capRoicChart"></canvas></div>'
        + '</div>'

        // ---- Card 4: Margin Trend Chart ----
        + '<div class="result-card">'
        + '  <h3><i class="fas fa-chart-area"></i> Margin Trends</h3>'
        + '  <div class="chart-box" style="height:250px;"><canvas id="capMarginChart"></canvas></div>'
        + '</div>'

        // ---- Card 5: DuPont Decomposition (span-2) ----
        + '<div class="result-card span-2">'
        + '  <h3><i class="fas fa-project-diagram"></i> DuPont Decomposition (Latest Quarter)</h3>'
        + '  <div class="metrics-row">'
        + '    <div class="metric-item">'
        + '      <div class="metric-label">Profit Margin</div>'
        + '      <div class="metric-value">' + (latestProfitMargin * 100).toFixed(1) + '%</div>'
        + '      <div class="metric-sub" style="color:' + pmTrend.color + ';">' + pmTrend.arrow + ' ' + pmTrend.label + '</div>'
        + '    </div>'
        + '    <div class="metric-item" style="display:flex;align-items:center;justify-content:center;padding:0.5rem;"><span style="font-size:1.5rem;opacity:0.4;">&times;</span></div>'
        + '    <div class="metric-item">'
        + '      <div class="metric-label">Asset Turnover</div>'
        + '      <div class="metric-value">' + fmt(latestAssetTurnover) + 'x</div>'
        + '      <div class="metric-sub" style="color:' + atTrend.color + ';">' + atTrend.arrow + ' ' + atTrend.label + '</div>'
        + '    </div>'
        + '    <div class="metric-item" style="display:flex;align-items:center;justify-content:center;padding:0.5rem;"><span style="font-size:1.5rem;opacity:0.4;">&times;</span></div>'
        + '    <div class="metric-item">'
        + '      <div class="metric-label">Equity Multiplier</div>'
        + '      <div class="metric-value">' + fmt(latestEquityMultiplier) + 'x</div>'
        + '      <div class="metric-sub" style="color:' + emTrend.color + ';">' + emTrend.arrow + ' ' + emTrend.label + '</div>'
        + '    </div>'
        + '    <div class="metric-item" style="display:flex;align-items:center;justify-content:center;padding:0.5rem;"><span style="font-size:1.5rem;opacity:0.4;">=</span></div>'
        + '    <div class="metric-item">'
        + '      <div class="metric-label">ROE</div>'
        + '      <div class="metric-value" style="color:#febc11;">' + (latestROE * 100).toFixed(1) + '%</div>'
        + '    </div>'
        + '  </div>'
        + '</div>'

        // ---- Card 6: Efficiency Metrics Table ----
        + '<div class="result-card">'
        + '  <h3><i class="fas fa-tachometer-alt"></i> Efficiency Metrics</h3>'
        + '  <table class="val-table">'
        + '    <tr><td>Revenue per Employee</td><td class="highlight">' + revenuePerEmployeeStr + '</td></tr>'
        + '    <tr><td>Return on Incremental Capital</td><td class="' + (avgIncrementalROIC != null && avgIncrementalROIC > 0 ? 'positive' : avgIncrementalROIC != null && avgIncrementalROIC < 0 ? 'negative' : '') + '">'
              + (avgIncrementalROIC != null ? (avgIncrementalROIC * 100).toFixed(1) + '%' : 'N/A') + '</td></tr>'
        + '    <tr><td>Reinvestment Rate</td><td>' + (reinvestmentRate * 100).toFixed(1) + '%</td></tr>'
        + '    <tr><td>Debt-to-Equity</td><td>' + (negativeEquity ? 'N/A (negative equity)' : fmt(latestDE)) + '</td></tr>'
        + '    <tr><td>ROA (latest)</td><td>' + (latestROA * 100).toFixed(1) + '%</td></tr>'
        + '  </table>'
        + '</div>'

        // ---- Card 7: Assumptions Box ----
        + '<div class="result-card">'
        + '  <h3><i class="fas fa-info-circle"></i> Assumptions & Methodology</h3>'
        + '  <div class="assumptions-box" style="margin-top:0;">'
        + '    <ul>'
        + '      <li>WACC uses CAPM: risk-free rate ' + (riskFreeRate * 100).toFixed(1) + '%, ERP ' + (equityRiskPremium * 100).toFixed(1) + '%, beta ' + fmt(beta) + '</li>'
        + '      <li>Cost of Equity: ' + (costOfEquity * 100).toFixed(2) + '% | Cost of Debt: ' + (costOfDebt * 100).toFixed(1) + '% (assumed)</li>'
        + '      <li>Capital structure assumed: ' + (0.7 * 100).toFixed(0) + '% equity / ' + (0.3 * 100).toFixed(0) + '% debt at ' + (taxRate * 100).toFixed(0) + '% tax rate</li>'
        + '      <li>ROIC values from quarterly value-creation data (annualized by data provider)</li>'
        + '      <li>Margin trends use simple linear regression over available quarters</li>'
        + '      <li>Incremental ROIC: change in operating income / change in total assets between periods</li>'
        + '      <li>Reinvestment Rate = 1 - (Dividends / Net Income) for TTM period</li>'
        + '      <li>Score clamped between 1 and 10; each category independently assessed</li>'
        + '    </ul>'
        + '  </div>'
        + '</div>'

        // ---- Card 8: Download CSV Button ----
        + '<div class="result-card">'
        + '  <h3><i class="fas fa-download"></i> Export Data</h3>'
        + '  <p style="font-size:0.85rem;opacity:0.7;margin-bottom:1rem;">Download the full capital allocation analysis including scorecard, ROIC trends, margin data, and DuPont decomposition.</p>'
        + '  <button class="run-btn" onclick="downloadModelCSV(\'capital\')" style="background:linear-gradient(135deg,#28a745,#20c997);width:100%;">'
        + '    <i class="fas fa-download"></i> Download Analysis CSV'
        + '  </button>'
        + '</div>'

        + '</div>'; // close result-grid

    // ---- RENDER CHARTS ----
    setTimeout(function() {
        _renderCapROICChart(roicValues, roicLabels, wacc);
        _renderCapMarginChart(grossMargins, opMargins, netMargins, roicLabels);
    }, 100);
}


// ============================================================
// CHART RENDERING HELPERS
// ============================================================

/**
 * Card 3 - ROIC Trend Chart
 * Gold line for ROIC, red dashed horizontal for WACC.
 * Green fill when ROIC > WACC, red fill when ROIC < WACC.
 */
function _renderCapROICChart(roicValues, roicLabels, wacc) {
    var canvas = document.getElementById('capRoicChart');
    if (!canvas) return;

    var roicPct = roicValues.map(function(v) { return v * 100; });
    var waccPct = wacc * 100;
    var waccLine = roicValues.map(function() { return waccPct; });

    // Build separate datasets for above/below WACC fills
    // We'll use a custom plugin to fill the gap between ROIC and WACC
    if (chartInstances['cap_roic']) {
        try { chartInstances['cap_roic'].destroy(); } catch(e) {}
    }

    chartInstances['cap_roic'] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: roicLabels,
            datasets: [
                {
                    label: 'ROIC %',
                    data: roicPct,
                    borderColor: '#febc11',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointBackgroundColor: '#febc11',
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: false,
                    order: 1
                },
                {
                    label: 'WACC %',
                    data: waccLine,
                    borderColor: '#dc3545',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    tension: 0,
                    fill: false,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#e5e5e5' } },
                filler: { propagate: false }
            },
            scales: {
                x: {
                    ticks: { color: '#aaa', maxRotation: 45 },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#aaa',
                        callback: function(v) { return v.toFixed(1) + '%'; }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        },
        plugins: [{
            id: 'roicWaccFill',
            beforeDraw: function(chart) {
                var ctx = chart.ctx;
                var meta0 = chart.getDatasetMeta(0); // ROIC
                var meta1 = chart.getDatasetMeta(1); // WACC
                if (!meta0.data.length || !meta1.data.length) return;

                ctx.save();
                for (var i = 0; i < meta0.data.length - 1; i++) {
                    var p0a = meta0.data[i];
                    var p0b = meta0.data[i + 1];
                    var p1a = meta1.data[i];
                    var p1b = meta1.data[i + 1];

                    if (!p0a || !p0b || !p1a || !p1b) continue;

                    var roicAbove = (p0a.y <= p1a.y && p0b.y <= p1b.y);
                    var roicBelow = (p0a.y >= p1a.y && p0b.y >= p1b.y);

                    ctx.beginPath();
                    ctx.moveTo(p0a.x, p0a.y);
                    ctx.lineTo(p0b.x, p0b.y);
                    ctx.lineTo(p1b.x, p1b.y);
                    ctx.lineTo(p1a.x, p1a.y);
                    ctx.closePath();

                    if (roicAbove) {
                        ctx.fillStyle = 'rgba(40, 167, 69, 0.15)';
                    } else if (roicBelow) {
                        ctx.fillStyle = 'rgba(220, 53, 69, 0.15)';
                    } else {
                        // Mixed segment -- use average
                        var avgRoic = (p0a.y + p0b.y) / 2;
                        var avgWacc = (p1a.y + p1b.y) / 2;
                        ctx.fillStyle = avgRoic <= avgWacc
                            ? 'rgba(40, 167, 69, 0.10)'
                            : 'rgba(220, 53, 69, 0.10)';
                    }
                    ctx.fill();
                }
                ctx.restore();
            }
        }]
    });
}

/**
 * Card 4 - Margin Trend Chart
 * Three lines: Gross Margin (blue), Operating Margin (gold), Net Margin (green).
 */
function _renderCapMarginChart(grossMargins, opMargins, netMargins, labels) {
    var canvas = document.getElementById('capMarginChart');
    if (!canvas) return;

    if (chartInstances['cap_margins']) {
        try { chartInstances['cap_margins'].destroy(); } catch(e) {}
    }

    chartInstances['cap_margins'] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Gross Margin',
                    data: grossMargins.map(function(v) { return v * 100; }),
                    borderColor: '#4dabf7',
                    backgroundColor: 'rgba(77, 171, 247, 0.08)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#4dabf7',
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'Operating Margin',
                    data: opMargins.map(function(v) { return v * 100; }),
                    borderColor: '#febc11',
                    backgroundColor: 'rgba(254, 188, 17, 0.08)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#febc11',
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'Net Margin',
                    data: netMargins.map(function(v) { return v * 100; }),
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.08)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#28a745',
                    tension: 0.3,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#e5e5e5', boxWidth: 12 } }
            },
            scales: {
                x: {
                    ticks: { color: '#aaa', maxRotation: 45 },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#aaa',
                        callback: function(v) { return v.toFixed(1) + '%'; }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}
