/**
 * val-earnings-quality.js
 * Earnings Quality Assessment (Forensic Accounting Style) for the UCSB DIG Valuation Analysis Lab.
 * Loaded via <script> tag in valuation.html -- all functions are globally accessible.
 *
 * Global utilities expected from valuation.html:
 *   fmt(n, dec), fmtCur(n), fmtBig(n), fmtPct(n), clamp(v, lo, hi)
 *   apiBaseURL, chartInstances, storeAnalysisData(modelId, data)
 *
 * API endpoint:
 *   GET {apiBaseURL}/api/stock/{symbol}/financials?limit=12
 */

// ============================================================
// LOCAL CACHED FETCH (simple in-memory, session-scoped)
// ============================================================
(function () {
    if (!window._eqFetchCache) {
        window._eqFetchCache = {};
    }
})();

function _eqCachedFetch(url) {
    if (window._eqFetchCache[url]) {
        return Promise.resolve(window._eqFetchCache[url]);
    }
    return fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            window._eqFetchCache[url] = data;
            return data;
        });
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================
async function runEarningsQuality(symbol) {
    const output = document.getElementById('analysisOutput');
    output.innerHTML =
        '<div class="analysis-loading"><div class="spinner"></div><br>Analyzing earnings quality for ' +
        symbol + '...</div>';

    try {
        // Use cachedFetch if available globally, otherwise our local version
        const fetchFn = typeof cachedFetch === 'function' ? cachedFetch : _eqCachedFetch;

        const url = apiBaseURL + '/api/stock/' + symbol + '/financials?limit=12';
        const res = await fetchFn(url);
        const financials = res.financials || res || [];

        if (!financials.length) {
            output.innerHTML =
                '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
                'No financial data available for <strong>' + symbol + '</strong>. ' +
                'This ticker may be an ETF/fund or have no reported financials.</div>';
            return;
        }

        // Filter to quarterly periods only, sort ascending by date
        const quarterly = financials
            .filter(function (f) { return f.fiscalPeriod && f.fiscalPeriod !== 'FY'; })
            .sort(function (a, b) {
                var da = a.endDate || a.startDate || '';
                var db = b.endDate || b.startDate || '';
                return da < db ? -1 : da > db ? 1 : 0;
            });

        if (quarterly.length < 4) {
            output.innerHTML =
                '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
                'Insufficient quarterly data for <strong>' + symbol + '</strong>. ' +
                'Need at least 4 quarters; found ' + quarterly.length + '.</div>';
            return;
        }

        // ------------------------------------------------------------------
        // A) Accruals Ratio per quarter
        // ------------------------------------------------------------------
        const accruals = quarterly.map(function (q) {
            var ni = q.netIncome || 0;
            var cf = q.cashFlow || 0;
            var assets = q.assets || 0;
            if (assets === 0) return null;
            return (ni - cf) / assets;
        });

        // ------------------------------------------------------------------
        // B) Simplified Beneish M-Score
        // ------------------------------------------------------------------
        var beneishComponents = null;
        var mScore = null;

        // We need at least 2 consecutive quarters
        if (quarterly.length >= 2) {
            var t = quarterly.length - 1; // most recent
            var t1 = quarterly.length - 2; // prior period
            var qt = quarterly[t];
            var qt1 = quarterly[t1];

            try {
                // DSRI
                var recProxy_t = Math.max((qt.revenues || 0) - (qt.cashFlow || 0), 0);
                var recProxy_t1 = Math.max((qt1.revenues || 0) - (qt1.cashFlow || 0), 0);
                var DSRI = 1.0;
                if ((qt.revenues || 0) > 0 && (qt1.revenues || 0) > 0 && recProxy_t1 > 0) {
                    DSRI = (recProxy_t / qt.revenues) / (recProxy_t1 / qt1.revenues);
                }

                // GMI
                var gm_t = (qt.revenues || 0) > 0 ? (qt.grossProfit || 0) / qt.revenues : 0;
                var gm_t1 = (qt1.revenues || 0) > 0 ? (qt1.grossProfit || 0) / qt1.revenues : 0;
                var GMI = gm_t > 0 ? gm_t1 / gm_t : 1.0;

                // AQI
                var hardAssets_t = (qt.equity || 0) + (qt.liabilities || 0);
                var hardAssets_t1 = (qt1.equity || 0) + (qt1.liabilities || 0);
                var aqi_num_t = (qt.assets || 0) > 0 ? (1 - hardAssets_t / qt.assets) : 0;
                var aqi_num_t1 = (qt1.assets || 0) > 0 ? (1 - hardAssets_t1 / qt1.assets) : 0;
                var AQI = aqi_num_t1 !== 0 ? aqi_num_t / aqi_num_t1 : 1.0;
                // Guard: if both are ~0, set to 1
                if (Math.abs(aqi_num_t) < 0.001 && Math.abs(aqi_num_t1) < 0.001) AQI = 1.0;

                // SGI
                var SGI = (qt1.revenues || 0) > 0 ? (qt.revenues || 0) / qt1.revenues : 1.0;

                // SGAI
                var sgaProxy_t = 0;
                var sgaProxy_t1 = 0;
                if ((qt.revenues || 0) - (qt.grossProfit || 0) > 0 && (qt.revenues || 0) > 0) {
                    sgaProxy_t = ((qt.grossProfit || 0) - (qt.operatingIncome || 0)) / qt.revenues;
                }
                if ((qt1.revenues || 0) - (qt1.grossProfit || 0) > 0 && (qt1.revenues || 0) > 0) {
                    sgaProxy_t1 = ((qt1.grossProfit || 0) - (qt1.operatingIncome || 0)) / qt1.revenues;
                }
                var SGAI = sgaProxy_t1 > 0 ? sgaProxy_t / sgaProxy_t1 : 1.0;

                // TATA
                var TATA = (qt.assets || 0) > 0
                    ? ((qt.netIncome || 0) - (qt.cashFlow || 0)) / qt.assets
                    : 0;

                // LVGI
                var lev_t = (qt.assets || 0) > 0 ? (qt.liabilities || 0) / qt.assets : 0;
                var lev_t1 = (qt1.assets || 0) > 0 ? (qt1.liabilities || 0) / qt1.assets : 0;
                var LVGI = lev_t1 > 0 ? lev_t / lev_t1 : 1.0;

                // DEPI (default -- insufficient data for precise calc)
                var DEPI = 1.0;

                // M-Score
                mScore = -4.84
                    + 0.920 * DSRI
                    + 0.528 * GMI
                    + 0.404 * AQI
                    + 0.892 * SGI
                    + 0.115 * DEPI
                    - 0.172 * SGAI
                    + 4.679 * TATA
                    - 0.327 * LVGI;

                beneishComponents = {
                    DSRI: DSRI,
                    GMI: GMI,
                    AQI: AQI,
                    SGI: SGI,
                    SGAI: SGAI,
                    TATA: TATA,
                    LVGI: LVGI,
                    DEPI: DEPI
                };
            } catch (e) {
                console.warn('Beneish M-Score calculation error:', e);
            }
        }

        // ------------------------------------------------------------------
        // C) Cash Flow Divergence: CF / NI ratio per quarter + trend
        // ------------------------------------------------------------------
        var cfToNI = quarterly.map(function (q) {
            var ni = q.netIncome || 0;
            var cf = q.cashFlow || 0;
            if (ni === 0 || ni < 0) return null; // mark negative NI quarters as N/A
            return cf / ni;
        });

        // Simple linear regression slope of cfToNI over time
        var cfniSlope = null;
        (function () {
            var valid = [];
            for (var i = 0; i < cfToNI.length; i++) {
                if (cfToNI[i] !== null && isFinite(cfToNI[i])) {
                    valid.push({ x: i, y: cfToNI[i] });
                }
            }
            if (valid.length >= 3) {
                var n = valid.length;
                var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
                for (var i = 0; i < n; i++) {
                    sumX += valid[i].x;
                    sumY += valid[i].y;
                    sumXY += valid[i].x * valid[i].y;
                    sumX2 += valid[i].x * valid[i].x;
                }
                var denom = n * sumX2 - sumX * sumX;
                if (denom !== 0) {
                    cfniSlope = (n * sumXY - sumX * sumY) / denom;
                }
            }
        })();

        // ------------------------------------------------------------------
        // D) Revenue Quality
        // ------------------------------------------------------------------
        var revenueGrowths = [];
        var cfGrowths = [];
        for (var i = 1; i < quarterly.length; i++) {
            var prevRev = quarterly[i - 1].revenues || 0;
            var curRev = quarterly[i].revenues || 0;
            var prevCF = quarterly[i - 1].cashFlow || 0;
            var curCF = quarterly[i].cashFlow || 0;

            if (Math.abs(prevRev) > 0) {
                revenueGrowths.push((curRev - prevRev) / Math.abs(prevRev));
            }
            if (Math.abs(prevCF) > 0) {
                cfGrowths.push((curCF - prevCF) / Math.abs(prevCF));
            }
        }

        var avgRevGrowth = revenueGrowths.length > 0
            ? revenueGrowths.reduce(function (s, v) { return s + v; }, 0) / revenueGrowths.length
            : 0;
        var avgCFGrowth = cfGrowths.length > 0
            ? cfGrowths.reduce(function (s, v) { return s + v; }, 0) / cfGrowths.length
            : 0;
        var revenueQualityRatio = Math.abs(avgRevGrowth) > 0.001
            ? avgCFGrowth / avgRevGrowth
            : (avgCFGrowth >= 0 ? 1.0 : 0);

        // ------------------------------------------------------------------
        // E) Earnings Persistence (lag-1 autocorrelation of EPS)
        // ------------------------------------------------------------------
        var epsArr = quarterly.map(function (q) { return q.epsDiluted || q.eps || 0; });
        var persistence = null;
        if (epsArr.length >= 4) {
            var mean = epsArr.reduce(function (s, v) { return s + v; }, 0) / epsArr.length;
            var numerator = 0;
            var denominator = 0;
            for (var i = 1; i < epsArr.length; i++) {
                numerator += (epsArr[i] - mean) * (epsArr[i - 1] - mean);
            }
            for (var i = 0; i < epsArr.length; i++) {
                denominator += (epsArr[i] - mean) * (epsArr[i] - mean);
            }
            if (denominator > 0) {
                persistence = numerator / denominator;
            }
        }

        // ------------------------------------------------------------------
        // F) Overall Grade (A through F)
        // ------------------------------------------------------------------
        var validAccruals = accruals.filter(function (v) { return v !== null; });
        var avgAccruals = validAccruals.length > 0
            ? validAccruals.reduce(function (s, v) { return s + v; }, 0) / validAccruals.length
            : 0;
        var avgAbsAccruals = validAccruals.length > 0
            ? validAccruals.reduce(function (s, v) { return s + Math.abs(v); }, 0) / validAccruals.length
            : 0;

        var validCFNI = cfToNI.filter(function (v) { return v !== null && isFinite(v); });
        var avgCFNI = validCFNI.length > 0
            ? validCFNI.reduce(function (s, v) { return s + v; }, 0) / validCFNI.length
            : 0;

        var score = 0;

        // Accruals
        if (avgAbsAccruals < 0.05) score += 2;
        else if (avgAbsAccruals < 0.10) score += 1;

        // M-Score
        if (mScore !== null) {
            if (mScore < -2.22) score += 2;
            else if (mScore < -1.78) score += 1;
        }

        // CF/NI ratio
        if (avgCFNI > 1.0) score += 2;
        else if (avgCFNI > 0.7) score += 1;

        // Persistence
        if (persistence !== null) {
            if (persistence > 0.6) score += 2;
            else if (persistence > 0.3) score += 1;
        }

        // Revenue quality
        if (revenueQualityRatio > 0.8) score += 2;
        else if (revenueQualityRatio > 0.5) score += 1;

        var grade, gradeColor;
        if (score >= 9) { grade = 'A'; gradeColor = '#28a745'; }
        else if (score >= 7) { grade = 'B'; gradeColor = '#6fcf8b'; }
        else if (score >= 5) { grade = 'C'; gradeColor = '#ffc107'; }
        else if (score >= 3) { grade = 'D'; gradeColor = '#fd7e14'; }
        else { grade = 'F'; gradeColor = '#dc3545'; }

        // ------------------------------------------------------------------
        // Red Flags
        // ------------------------------------------------------------------
        var redFlags = [];
        if (avgAbsAccruals >= 0.10) {
            redFlags.push({
                severity: 'high',
                text: 'High accruals ratio (' + fmt(avgAbsAccruals) + ') suggests earnings not backed by cash'
            });
        }
        if (mScore !== null && mScore > -1.78) {
            redFlags.push({
                severity: 'high',
                text: 'Beneish M-Score (' + fmt(mScore) + ') above manipulation threshold (-1.78)'
            });
        }
        if (cfniSlope !== null && cfniSlope < -0.05) {
            redFlags.push({
                severity: 'medium',
                text: 'Cash flow diverging from net income (CF/NI trend declining, slope: ' + fmt(cfniSlope) + ')'
            });
        }
        if (persistence !== null && persistence < 0.3) {
            redFlags.push({
                severity: 'medium',
                text: 'Low earnings persistence (' + fmt(persistence) + ') indicates volatile, unreliable earnings'
            });
        }
        if (revenueQualityRatio < 0.5 && Math.abs(avgRevGrowth) > 0.01) {
            redFlags.push({
                severity: 'medium',
                text: 'Revenue growing faster than cash flow (quality ratio: ' + fmt(revenueQualityRatio) + ')'
            });
        }
        if (beneishComponents) {
            if (beneishComponents.DSRI > 1.5) {
                redFlags.push({
                    severity: 'low',
                    text: 'Elevated Days Sales Receivable Index (DSRI: ' + fmt(beneishComponents.DSRI) + ')'
                });
            }
            if (beneishComponents.GMI > 1.3) {
                redFlags.push({
                    severity: 'low',
                    text: 'Declining gross margins (GMI: ' + fmt(beneishComponents.GMI) + ')'
                });
            }
        }

        // ------------------------------------------------------------------
        // Render
        // ------------------------------------------------------------------
        renderEarningsQualityOutput(
            symbol, quarterly, accruals, beneishComponents, mScore,
            cfToNI, revenueQualityRatio, persistence, grade, gradeColor,
            score, avgAbsAccruals, avgCFNI, cfniSlope, redFlags,
            avgRevGrowth, avgCFGrowth
        );

        // ------------------------------------------------------------------
        // Store CSV data
        // ------------------------------------------------------------------
        storeAnalysisData('earnings', {
            modelName: 'Earnings Quality Assessment',
            firmStyle: 'Forensic Accounting',
            runDate: new Date().toISOString(),
            ticker: symbol,
            sections: _buildEarningsCSVSections(
                symbol, quarterly, accruals, beneishComponents, mScore,
                cfToNI, revenueQualityRatio, persistence, grade, score,
                avgAbsAccruals, avgCFNI, redFlags
            )
        });

    } catch (err) {
        console.error('Earnings Quality Error:', err);
        output.innerHTML =
            '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
            'Error analyzing earnings quality for ' + symbol + ': ' + err.message + '</div>';
    }
}


// ============================================================
// RENDER FUNCTION
// ============================================================
function renderEarningsQualityOutput(
    symbol, quarters, accruals, beneishComponents, mScore,
    cfToNI, revenueQualityRatio, persistence, grade, gradeColor,
    totalScore, avgAbsAccruals, avgCFNI, cfniSlope, redFlags,
    avgRevGrowth, avgCFGrowth
) {
    const output = document.getElementById('analysisOutput');

    // Quarter labels
    var qLabels = quarters.map(function (q) {
        return (q.fiscalPeriod || '') + ' ' + (q.fiscalYear || '');
    });

    // ------------------------------------------------------------------
    // Build HTML
    // ------------------------------------------------------------------
    var html = '';

    // Card 1 - Verdict (span-2)
    html += '<div class="result-grid">';
    html += '<div class="result-card span-2 verdict-card">';
    html += '<div class="verdict-badge" style="background: ' + _eqHexAlpha(gradeColor, 0.2) +
        '; color: ' + gradeColor + '; border: 2px solid ' + gradeColor +
        '; font-size: 2.5rem; letter-spacing: 4px;">' + grade + '</div>';
    html += '<div style="font-size: 1.1rem; opacity: 0.9; margin-top: 0.5rem;">Earnings Quality Assessment for <strong style="color:#febc11;">' + symbol + '</strong></div>';
    html += '<div style="font-size: 0.85rem; opacity: 0.6; margin-top: 0.3rem;">Composite Score: ' + totalScore + ' / 10</div>';
    html += '</div>';

    // Card 2 - Accruals Trend Chart
    html += '<div class="result-card">';
    html += '<h3><i class="fas fa-chart-line"></i> Accruals Ratio Trend</h3>';
    html += '<div style="font-size:0.8rem;opacity:0.6;margin-bottom:0.5rem;">Avg Accruals: ' +
        fmt(avgAbsAccruals) + ' &mdash; ' +
        (avgAbsAccruals < 0.05 ? '<span class="positive">Low (Good)</span>'
            : avgAbsAccruals < 0.10 ? '<span style="color:#ffc107;">Moderate</span>'
                : '<span class="negative">High (Concerning)</span>') + '</div>';
    html += '<div style="position:relative;height:220px;"><canvas id="eqAccrualsChart"></canvas></div>';
    html += '</div>';

    // Card 3 - Beneish M-Score Components
    html += '<div class="result-card">';
    html += '<h3><i class="fas fa-search-dollar"></i> Beneish M-Score Components</h3>';
    if (beneishComponents && mScore !== null) {
        var mVerdict = mScore > -1.78 ? 'LIKELY MANIPULATOR' : 'UNLIKELY MANIPULATOR';
        var mColor = mScore > -1.78 ? '#dc3545' : '#28a745';
        html += '<div style="text-align:center;margin-bottom:1rem;">' +
            '<span style="font-size:1.8rem;font-weight:800;color:' + mColor + ';">' + fmt(mScore) + '</span>' +
            '<div style="font-size:0.8rem;font-weight:700;color:' + mColor + ';">' + mVerdict + '</div>' +
            '<div style="font-size:0.7rem;opacity:0.5;">Threshold: -1.78</div></div>';
        html += '<table class="val-table">';
        html += '<thead><tr><th>Component</th><th>Value</th><th>Threshold</th><th>Flag</th></tr></thead><tbody>';

        var components = [
            { key: 'DSRI', label: 'DSRI', val: beneishComponents.DSRI, threshold: '>1.0 suspicious', isBad: beneishComponents.DSRI > 1.0 },
            { key: 'GMI', label: 'GMI', val: beneishComponents.GMI, threshold: '>1.0 suspicious', isBad: beneishComponents.GMI > 1.0 },
            { key: 'AQI', label: 'AQI', val: beneishComponents.AQI, threshold: '>1.0 suspicious', isBad: beneishComponents.AQI > 1.0 },
            { key: 'SGI', label: 'SGI', val: beneishComponents.SGI, threshold: '>1.0 suspicious', isBad: beneishComponents.SGI > 1.0 },
            { key: 'SGAI', label: 'SGAI', val: beneishComponents.SGAI, threshold: '<1.0 suspicious', isBad: beneishComponents.SGAI < 1.0 },
            { key: 'TATA', label: 'TATA', val: beneishComponents.TATA, threshold: '>0.025 suspicious', isBad: beneishComponents.TATA > 0.025 },
            { key: 'LVGI', label: 'LVGI', val: beneishComponents.LVGI, threshold: '>1.0 suspicious', isBad: beneishComponents.LVGI > 1.0 }
        ];

        components.forEach(function (c) {
            var flagStr = c.isBad
                ? '<span style="color:#dc3545;font-weight:700;">&#x1F6A9; Suspicious</span>'
                : '<span style="color:#28a745;font-weight:700;">&#x2705; Normal</span>';
            html += '<tr><td>' + c.label + '</td>' +
                '<td style="color:' + (c.isBad ? '#dc3545' : '#28a745') + ';font-weight:700;">' + fmt(c.val) + '</td>' +
                '<td style="font-size:0.75rem;opacity:0.6;">' + c.threshold + '</td>' +
                '<td>' + flagStr + '</td></tr>';
        });

        // M-Score row
        var mBad = mScore > -1.78;
        html += '<tr style="border-top:2px solid rgba(255,255,255,0.15);">' +
            '<td style="font-weight:800;">M-Score</td>' +
            '<td style="font-weight:800;color:' + (mBad ? '#dc3545' : '#28a745') + ';">' + fmt(mScore) + '</td>' +
            '<td style="font-size:0.75rem;opacity:0.6;">&gt;-1.78 manipulator</td>' +
            '<td>' + (mBad
                ? '<span style="color:#dc3545;font-weight:700;">&#x1F6A9; Flag</span>'
                : '<span style="color:#28a745;font-weight:700;">&#x2705; Clear</span>') + '</td></tr>';
        html += '</tbody></table>';
    } else {
        html += '<div class="analysis-info" style="padding:1rem;">Insufficient data to compute Beneish M-Score (need at least 2 quarters).</div>';
    }
    html += '</div>';

    // Card 4 - Cash Flow vs Net Income Chart (span-2)
    html += '<div class="result-card span-2">';
    html += '<h3><i class="fas fa-exchange-alt"></i> Cash Flow vs Net Income</h3>';
    html += '<div style="font-size:0.8rem;opacity:0.6;margin-bottom:0.5rem;">' +
        'Avg CF/NI: ' + fmt(avgCFNI) + ' &mdash; ' +
        (avgCFNI > 1.0 ? '<span class="positive">Strong cash backing</span>'
            : avgCFNI > 0.7 ? '<span style="color:#ffc107;">Adequate</span>'
                : '<span class="negative">Weak cash backing</span>') +
        (cfniSlope !== null ? ' | Trend: ' + (cfniSlope >= 0 ? '<span class="positive">Improving</span>' : '<span class="negative">Declining</span>') : '') +
        '</div>';
    html += '<div style="position:relative;height:250px;"><canvas id="eqCFNIChart"></canvas></div>';
    html += '</div>';

    // Card 5 - Revenue Quality & Persistence
    html += '<div class="result-card">';
    html += '<h3><i class="fas fa-gem"></i> Revenue Quality</h3>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">';

    // Revenue Quality metric
    var rqInterp = revenueQualityRatio > 0.8 ? 'Strong' : revenueQualityRatio > 0.5 ? 'Moderate' : 'Weak';
    var rqColor = revenueQualityRatio > 0.8 ? '#28a745' : revenueQualityRatio > 0.5 ? '#ffc107' : '#dc3545';
    html += '<div class="metric-item">' +
        '<div class="metric-label">Revenue Quality Ratio</div>' +
        '<div class="metric-value" style="color:' + rqColor + ';">' + fmt(revenueQualityRatio) + '</div>' +
        '<div class="metric-sub" style="color:' + rqColor + ';">' + rqInterp + '</div>' +
        '</div>';

    // Persistence metric
    var pInterp, pColor;
    if (persistence === null) { pInterp = 'N/A'; pColor = 'rgba(255,255,255,0.5)'; }
    else if (persistence > 0.6) { pInterp = 'Highly Persistent'; pColor = '#28a745'; }
    else if (persistence > 0.3) { pInterp = 'Moderate'; pColor = '#ffc107'; }
    else { pInterp = 'Low'; pColor = '#dc3545'; }
    html += '<div class="metric-item">' +
        '<div class="metric-label">Earnings Persistence</div>' +
        '<div class="metric-value" style="color:' + pColor + ';">' + (persistence !== null ? fmt(persistence) : 'N/A') + '</div>' +
        '<div class="metric-sub" style="color:' + pColor + ';">' + pInterp + '</div>' +
        '</div>';

    html += '</div>'; // close grid
    html += '<div style="margin-top:1rem;">';
    html += '<table class="val-table">';
    html += '<tr><td>Avg Revenue Growth (QoQ)</td><td>' + fmtPct(avgRevGrowth * 100) + '</td></tr>';
    html += '<tr><td>Avg Cash Flow Growth (QoQ)</td><td>' + fmtPct(avgCFGrowth * 100) + '</td></tr>';
    html += '<tr><td>CF Growth / Revenue Growth</td><td class="highlight">' + fmt(revenueQualityRatio) + '</td></tr>';
    html += '</table>';
    html += '</div>';
    html += '</div>';

    // Card 6 - Red Flags Summary (span-2)
    html += '<div class="result-card span-2">';
    html += '<h3><i class="fas fa-flag"></i> Red Flags Summary</h3>';
    if (redFlags.length === 0) {
        html += '<div style="display:flex;align-items:center;gap:0.75rem;padding:1rem;' +
            'background:rgba(40,167,69,0.1);border:1px solid rgba(40,167,69,0.3);border-radius:10px;">' +
            '<span style="font-size:1.5rem;">&#x2705;</span>' +
            '<span style="color:#28a745;font-weight:700;font-size:1rem;">No significant red flags detected</span></div>';
    } else {
        html += '<div style="display:flex;flex-direction:column;gap:0.75rem;">';
        redFlags.forEach(function (flag) {
            var bgColor, borderColor, iconColor;
            if (flag.severity === 'high') {
                bgColor = 'rgba(220,53,69,0.1)';
                borderColor = 'rgba(220,53,69,0.3)';
                iconColor = '#dc3545';
            } else if (flag.severity === 'medium') {
                bgColor = 'rgba(253,126,20,0.1)';
                borderColor = 'rgba(253,126,20,0.3)';
                iconColor = '#fd7e14';
            } else {
                bgColor = 'rgba(255,193,7,0.1)';
                borderColor = 'rgba(255,193,7,0.3)';
                iconColor = '#ffc107';
            }
            html += '<div style="display:flex;align-items:center;gap:0.75rem;padding:0.8rem 1rem;' +
                'background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:10px;">' +
                '<span style="font-size:1.2rem;">&#x1F6A9;</span>' +
                '<span style="color:' + iconColor + ';font-weight:600;font-size:0.9rem;">' + flag.text + '</span></div>';
        });
        html += '</div>';
    }
    html += '</div>';

    // Card 7 - Assumptions
    html += '<div class="result-card span-2">';
    html += '<div class="assumptions-box" style="margin:0;">';
    html += '<h4><i class="fas fa-info-circle"></i> Methodology & Assumptions</h4>';
    html += '<ul>';
    html += '<li>Beneish M-Score uses proxied values from available quarterly financial data, not full balance sheet detail (e.g., receivables, depreciation).</li>';
    html += '<li>Days Sales Receivable Index (DSRI) is approximated using the gap between revenue and operating cash flow as a proxy for receivables.</li>';
    html += '<li>Asset Quality Index (AQI) uses the accounting identity (assets = equity + liabilities) to estimate intangible asset growth.</li>';
    html += '<li>Depreciation Index (DEPI) defaults to 1.0 due to insufficient granularity in the available data.</li>';
    html += '<li>Accruals ratio is computed as (Net Income - Operating Cash Flow) / Total Assets per quarter.</li>';
    html += '<li>Earnings persistence is the lag-1 autocorrelation of diluted EPS across available quarters.</li>';
    html += '<li>Revenue quality ratio compares average cash flow growth to average revenue growth over consecutive quarters.</li>';
    html += '<li>All data sourced from Polygon.io quarterly financial reports. Results should be independently verified.</li>';
    html += '</ul>';
    html += '</div>';
    html += '</div>';

    // Card 8 - Download CSV
    html += '<div class="result-card span-2" style="text-align:center;padding:1.5rem;">';
    html += '<button class="run-btn" onclick="downloadModelCSV(\'earnings\')" style="background:linear-gradient(135deg,#28a745,#20c997);">' +
        '<i class="fas fa-download"></i> Download CSV Report</button>';
    html += '</div>';

    html += '</div>'; // close result-grid

    output.innerHTML = html;

    // ------------------------------------------------------------------
    // Render Charts
    // ------------------------------------------------------------------
    setTimeout(function () {
        _renderAccrualsChart(qLabels, accruals);
        _renderCFNIChart(qLabels, quarters);
    }, 100);
}


// ============================================================
// CHART: Accruals Trend
// ============================================================
function _renderAccrualsChart(labels, accruals) {
    var ctx = document.getElementById('eqAccrualsChart');
    if (!ctx) return;

    // Destroy existing
    if (chartInstances['eq_accruals']) {
        try { chartInstances['eq_accruals'].destroy(); } catch (e) { }
    }

    var accrualData = accruals.map(function (v) { return v !== null ? v : null; });

    chartInstances['eq_accruals'] = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Accruals Ratio',
                data: accrualData,
                borderColor: '#febc11',
                backgroundColor: 'rgba(254,188,17,0.1)',
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: accrualData.map(function (v) {
                    if (v === null) return 'transparent';
                    if (v > 0.10) return '#dc3545';
                    if (v < 0) return '#28a745';
                    return '#febc11';
                }),
                fill: false,
                spanGaps: true
            }]
        },
        plugins: [{
            id: 'accrualZones',
            beforeDraw: function (chart) {
                var yAxis = chart.scales.y;
                var xAxis = chart.scales.x;
                var ctxDraw = chart.ctx;

                // Red zone above 0.10
                var y010 = yAxis.getPixelForValue(0.10);
                var yTop = yAxis.top;
                if (y010 > yTop) {
                    ctxDraw.save();
                    ctxDraw.fillStyle = 'rgba(220, 53, 69, 0.08)';
                    ctxDraw.fillRect(xAxis.left, yTop, xAxis.width, y010 - yTop);
                    ctxDraw.restore();
                }

                // Green zone below 0
                var y0 = yAxis.getPixelForValue(0);
                var yBottom = yAxis.bottom;
                if (y0 < yBottom) {
                    ctxDraw.save();
                    ctxDraw.fillStyle = 'rgba(40, 167, 69, 0.08)';
                    ctxDraw.fillRect(xAxis.left, y0, xAxis.width, yBottom - y0);
                    ctxDraw.restore();
                }
            }
        }],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#e5e5e5' } },
                annotation: undefined
            },
            scales: {
                x: {
                    ticks: { color: '#aaa', maxRotation: 45 },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#aaa',
                        callback: function (v) { return v.toFixed(2); }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });

    // Draw reference lines manually after chart is rendered
    var yAxis = chartInstances['eq_accruals'].scales.y;
    if (yAxis) {
        // We use the annotation-like approach via a plugin for the dashed lines
        var origPlugin = chartInstances['eq_accruals'].config.plugins.find(function (p) { return p.id === 'accrualZones'; });
        if (origPlugin) {
            var origBeforeDraw = origPlugin.beforeDraw;
            origPlugin.afterDraw = function (chart) {
                var yA = chart.scales.y;
                var xA = chart.scales.x;
                var c = chart.ctx;

                // Dashed red line at 0.10
                var y010 = yA.getPixelForValue(0.10);
                c.save();
                c.setLineDash([6, 4]);
                c.strokeStyle = 'rgba(220, 53, 69, 0.6)';
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(xA.left, y010);
                c.lineTo(xA.right, y010);
                c.stroke();
                c.fillStyle = 'rgba(220, 53, 69, 0.6)';
                c.font = '10px sans-serif';
                c.fillText('High Accruals (0.10)', xA.right - 110, y010 - 4);
                c.restore();

                // Dashed white line at 0
                var y0 = yA.getPixelForValue(0);
                c.save();
                c.setLineDash([6, 4]);
                c.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(xA.left, y0);
                c.lineTo(xA.right, y0);
                c.stroke();
                c.restore();
            };
        }
        chartInstances['eq_accruals'].update();
    }
}


// ============================================================
// CHART: Cash Flow vs Net Income
// ============================================================
function _renderCFNIChart(labels, quarters) {
    var ctx = document.getElementById('eqCFNIChart');
    if (!ctx) return;

    // Destroy existing
    if (chartInstances['eq_cfni']) {
        try { chartInstances['eq_cfni'].destroy(); } catch (e) { }
    }

    var niData = quarters.map(function (q) { return q.netIncome || 0; });
    var cfData = quarters.map(function (q) { return q.cashFlow || 0; });

    chartInstances['eq_cfni'] = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Net Income',
                    data: niData,
                    borderColor: '#4dabf7',
                    backgroundColor: 'rgba(77, 171, 247, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#4dabf7',
                    fill: false
                },
                {
                    label: 'Operating Cash Flow',
                    data: cfData,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#28a745',
                    fill: false
                }
            ]
        },
        plugins: [{
            id: 'cfniDivergence',
            afterDatasetsDraw: function (chart) {
                var meta0 = chart.getDatasetMeta(0); // NI
                var meta1 = chart.getDatasetMeta(1); // CF
                var c = chart.ctx;

                if (!meta0.data.length || !meta1.data.length) return;

                for (var i = 0; i < meta0.data.length - 1; i++) {
                    var niPt1 = meta0.data[i];
                    var niPt2 = meta0.data[i + 1];
                    var cfPt1 = meta1.data[i];
                    var cfPt2 = meta1.data[i + 1];

                    if (!niPt1 || !niPt2 || !cfPt1 || !cfPt2) continue;

                    c.save();
                    c.beginPath();
                    c.moveTo(niPt1.x, niPt1.y);
                    c.lineTo(niPt2.x, niPt2.y);
                    c.lineTo(cfPt2.x, cfPt2.y);
                    c.lineTo(cfPt1.x, cfPt1.y);
                    c.closePath();

                    // Determine fill color: CF > NI is healthy (green), NI > CF is concerning (red)
                    var avgNI = (niData[i] + niData[i + 1]) / 2;
                    var avgCF = (cfData[i] + cfData[i + 1]) / 2;
                    if (avgCF >= avgNI) {
                        c.fillStyle = 'rgba(40, 167, 69, 0.12)';
                    } else {
                        c.fillStyle = 'rgba(220, 53, 69, 0.12)';
                    }
                    c.fill();
                    c.restore();
                }
            }
        }],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#e5e5e5' } }
            },
            scales: {
                x: {
                    ticks: { color: '#aaa', maxRotation: 45 },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#aaa',
                        callback: function (v) { return fmtBig(v); }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}


// ============================================================
// HELPER: Hex color to rgba with alpha
// ============================================================
function _eqHexAlpha(hex, alpha) {
    // Simple conversion for known hex colors
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}


// ============================================================
// CSV DATA BUILDER
// ============================================================
function _buildEarningsCSVSections(
    symbol, quarters, accruals, beneishComponents, mScore,
    cfToNI, revenueQualityRatio, persistence, grade, totalScore,
    avgAbsAccruals, avgCFNI, redFlags
) {
    var sections = [];

    // Section: Summary
    sections.push({
        title: 'Earnings Quality Summary',
        type: 'metrics',
        rows: [
            { label: 'Symbol', value: symbol },
            { label: 'Grade', value: grade, formatted: grade + ' (' + totalScore + '/10)' },
            { label: 'Avg Accruals Ratio', value: avgAbsAccruals, formatted: fmt(avgAbsAccruals) },
            { label: 'Beneish M-Score', value: mScore, formatted: mScore !== null ? fmt(mScore) : 'N/A' },
            { label: 'M-Score Verdict', value: mScore !== null ? (mScore > -1.78 ? 'LIKELY MANIPULATOR' : 'UNLIKELY MANIPULATOR') : 'N/A' },
            { label: 'Avg CF/NI Ratio', value: avgCFNI, formatted: fmt(avgCFNI) },
            { label: 'Revenue Quality Ratio', value: revenueQualityRatio, formatted: fmt(revenueQualityRatio) },
            { label: 'Earnings Persistence', value: persistence, formatted: persistence !== null ? fmt(persistence) : 'N/A' }
        ]
    });

    // Section: Accruals by Quarter
    var accHeaders = ['Quarter', 'Net Income', 'Cash Flow', 'Assets', 'Accruals Ratio'];
    var accRows = quarters.map(function (q, i) {
        return [
            (q.fiscalPeriod || '') + ' ' + (q.fiscalYear || ''),
            q.netIncome || 0,
            q.cashFlow || 0,
            q.assets || 0,
            accruals[i] !== null ? accruals[i].toFixed(4) : 'N/A'
        ];
    });
    sections.push({ title: 'Accruals by Quarter', type: 'table', headers: accHeaders, rows: accRows });

    // Section: Beneish M-Score Components
    if (beneishComponents) {
        sections.push({
            title: 'Beneish M-Score Components',
            type: 'metrics',
            rows: [
                { label: 'DSRI (Days Sales Receivable Index)', value: beneishComponents.DSRI, formatted: fmt(beneishComponents.DSRI) },
                { label: 'GMI (Gross Margin Index)', value: beneishComponents.GMI, formatted: fmt(beneishComponents.GMI) },
                { label: 'AQI (Asset Quality Index)', value: beneishComponents.AQI, formatted: fmt(beneishComponents.AQI) },
                { label: 'SGI (Sales Growth Index)', value: beneishComponents.SGI, formatted: fmt(beneishComponents.SGI) },
                { label: 'SGAI (SGA Expense Index)', value: beneishComponents.SGAI, formatted: fmt(beneishComponents.SGAI) },
                { label: 'TATA (Total Accruals / Total Assets)', value: beneishComponents.TATA, formatted: fmt(beneishComponents.TATA, 4) },
                { label: 'LVGI (Leverage Index)', value: beneishComponents.LVGI, formatted: fmt(beneishComponents.LVGI) },
                { label: 'DEPI (Depreciation Index)', value: beneishComponents.DEPI, formatted: fmt(beneishComponents.DEPI) + ' (default)' },
                { label: 'M-Score', value: mScore, formatted: fmt(mScore) }
            ]
        });
    }

    // Section: CF/NI Ratio by Quarter
    var cfniHeaders = ['Quarter', 'Net Income', 'Cash Flow', 'CF/NI Ratio'];
    var cfniRows = quarters.map(function (q, i) {
        return [
            (q.fiscalPeriod || '') + ' ' + (q.fiscalYear || ''),
            q.netIncome || 0,
            q.cashFlow || 0,
            cfToNI[i] !== null ? cfToNI[i].toFixed(4) : 'N/A'
        ];
    });
    sections.push({ title: 'Cash Flow to Net Income Ratio', type: 'table', headers: cfniHeaders, rows: cfniRows });

    // Section: Red Flags
    if (redFlags.length > 0) {
        sections.push({
            title: 'Red Flags',
            type: 'table',
            headers: ['Severity', 'Description'],
            rows: redFlags.map(function (f) { return [f.severity.toUpperCase(), f.text]; })
        });
    } else {
        sections.push({
            title: 'Red Flags',
            type: 'metrics',
            rows: [{ label: 'Status', value: 'No significant red flags detected' }]
        });
    }

    // Section: Raw Financial Data
    sections.push({
        title: 'Raw Financial Data — Quarterly',
        type: 'table',
        headers: ['Period', 'Date', 'Revenue', 'Gross Profit', 'Operating Income', 'Net Income', 'Cash Flow', 'Assets', 'Equity', 'Liabilities'],
        rows: quarters.map(function (q) {
            return [
                (q.fiscalPeriod || '') + ' ' + (q.fiscalYear || ''),
                q.endDate || q.startDate || '',
                q.revenues || 0,
                q.grossProfit || 0,
                q.operatingIncome || 0,
                q.netIncome || 0,
                q.cashFlow || 0,
                q.assets || 0,
                q.equity || 0,
                q.liabilities || 0
            ];
        })
    });

    return sections;
}
