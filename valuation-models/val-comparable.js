/**
 * val-comparable.js
 * Comparable Company Analysis (Goldman Sachs Style)
 * Loaded via <script> tag in valuation.html -- all functions are globally accessible.
 *
 * Dependencies available from valuation.html:
 *   fmt(n, dec), fmtCur(n), fmtBig(n), fmtPct(n), clamp(v, lo, hi)
 *   apiBaseURL, cachedFetch (if defined), chartInstances, storeAnalysisData(), downloadModelCSV()
 *   equityHoldings - array of { symbol, description, gicsSector, quantity, lastPrice }
 *   Chart.js available globally
 *
 * API endpoints:
 *   GET {apiBaseURL}/api/stock/{symbol}/details
 *   GET {apiBaseURL}/api/stock/{symbol}/financials?limit=4
 *   GET {apiBaseURL}/api/stock/{symbol}/comprehensive
 */

// ============================================================
// SECTOR PEERS CONSTANT
// ============================================================

const SECTOR_PEERS = {
    'Information Technology': ['AAPL', 'NVDA', 'CRM', 'ORCL', 'INTC', 'ADBE', 'IBM'],
    'Communication Services': ['META', 'NFLX', 'DIS', 'CMCSA', 'T', 'VZ', 'SPOT'],
    'Consumer Discretionary': ['TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'TJX', 'LOW'],
    'Financials': ['BAC', 'GS', 'MS', 'BLK', 'AXP', 'C', 'WFC'],
    'Health Care': ['JNJ', 'UNH', 'LLY', 'PFE', 'ABT', 'TMO', 'MRK'],
    'Industrials': ['HON', 'CAT', 'UPS', 'RTX', 'LMT', 'DE', 'MMM'],
    'Consumer Staples': ['PG', 'KO', 'PEP', 'WMT', 'CL', 'MDLZ', 'MO'],
    'Energy': ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'VLO'],
    'Materials': ['LIN', 'APD', 'ECL', 'NEM', 'NUE', 'DD', 'PPG'],
    'Real Estate': ['AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'O', 'VICI'],
    'Utilities': ['NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE']
};


// ============================================================
// HELPER: Safe fetch wrapper
// ============================================================

function _compsFetch(url) {
    if (typeof cachedFetch === 'function') {
        return cachedFetch(url);
    }
    return fetch(url).then(function (r) { return r.json(); });
}


// ============================================================
// HELPER: Compute valuation multiples for a single company
// ============================================================

function _computeMultiples(details, financials, quote) {
    var result = {
        name: details.name || details.ticker || '?',
        ticker: details.ticker || '?',
        marketCap: details.marketCap || 0,
        sharesOut: details.weightedSharesOutstanding || details.shareClassSharesOutstanding || 0,
        price: 0,
        ttmRevenue: 0,
        ttmNetIncome: 0,
        ttmOperatingIncome: 0,
        ttmEPS: 0,
        ttmGrossProfit: 0,
        ttmEBITDA: 0,
        latestEquity: 0,
        latestLiabilities: 0,
        latestAssets: 0,
        netDebt: 0,
        ev: 0,
        pe: null,
        ps: null,
        pb: null,
        evToRevenue: null,
        evToEBITDA: null
    };

    // Determine current price
    if (quote) {
        var rawPrice = quote.price || 0;
        result.price = (rawPrice > 0 ? rawPrice : (quote.prevClose || quote.prev_close || 0));
    }
    if ((!result.price || result.price <= 0) && result.marketCap > 0 && result.sharesOut > 0) {
        result.price = result.marketCap / result.sharesOut;
    }

    if (!financials || financials.length === 0) {
        return result;
    }

    // TTM financials from last 4 quarters (or annualize available)
    var numQ = Math.min(financials.length, 4);
    var annFactor = 4 / numQ;

    var sumRevenue = 0, sumNetIncome = 0, sumOpIncome = 0, sumEPS = 0, sumGrossProfit = 0;
    for (var i = 0; i < numQ; i++) {
        var q = financials[i];
        sumRevenue += (q.revenues || 0);
        sumNetIncome += (q.netIncome || 0);
        sumOpIncome += (q.operatingIncome || 0);
        sumEPS += (q.epsDiluted || q.eps || 0);
        sumGrossProfit += (q.grossProfit || 0);
    }

    result.ttmRevenue = sumRevenue * annFactor;
    result.ttmNetIncome = sumNetIncome * annFactor;
    result.ttmOperatingIncome = sumOpIncome * annFactor;
    result.ttmEPS = sumEPS * annFactor;
    result.ttmGrossProfit = sumGrossProfit * annFactor;

    // EBITDA proxy: Operating Income + rough D&A add-back (30% of gross-to-operating gap)
    var daProxy = (result.ttmGrossProfit - result.ttmOperatingIncome) * 0.3;
    result.ttmEBITDA = result.ttmOperatingIncome + Math.max(daProxy, 0);

    // Latest balance sheet
    result.latestEquity = financials[0].equity || 0;
    result.latestLiabilities = financials[0].liabilities || 0;
    result.latestAssets = financials[0].assets || 0;
    result.latestCurrentAssets = financials[0].currentAssets || 0;
    result.latestNonCurrentLiabilities = financials[0].nonCurrentLiabilities || 0;
    result.latestLongTermDebt = financials[0].longTermDebt || 0;

    // Enterprise Value: use financial debt (not total liabilities) for net debt
    var financialDebt = result.latestLongTermDebt > 0 ? result.latestLongTermDebt :
                        result.latestNonCurrentLiabilities > 0 ? result.latestNonCurrentLiabilities * 0.70 :
                        result.latestLiabilities * 0.40;
    var estCash = result.latestCurrentAssets > 0
        ? result.latestCurrentAssets * 0.50
        : result.latestAssets * 0.10;
    result.netDebt = financialDebt - estCash;
    result.ev = result.marketCap + result.netDebt;

    // Multiples
    if (result.ttmEPS > 0 && result.price > 0) {
        result.pe = result.price / result.ttmEPS;
    }
    if (result.ttmRevenue > 0 && result.marketCap > 0) {
        result.ps = result.marketCap / result.ttmRevenue;
    }
    if (result.latestEquity > 0 && result.marketCap > 0) {
        result.pb = result.marketCap / result.latestEquity;
    }
    if (result.ttmRevenue > 0 && result.ev > 0) {
        result.evToRevenue = result.ev / result.ttmRevenue;
    }
    if (result.ttmEBITDA > 0 && result.ev > 0) {
        result.evToEBITDA = result.ev / result.ttmEBITDA;
    }

    return result;
}


// ============================================================
// HELPER: Compute median of an array (ignoring nulls)
// ============================================================

function _median(arr) {
    var valid = arr.filter(function (v) { return v !== null && v !== undefined && isFinite(v) && v > 0; });
    if (valid.length === 0) return null;
    valid.sort(function (a, b) { return a - b; });
    var mid = Math.floor(valid.length / 2);
    if (valid.length % 2 === 0) {
        return (valid[mid - 1] + valid[mid]) / 2;
    }
    return valid[mid];
}


// ============================================================
// HELPER: Match sector name (partial/fuzzy)
// ============================================================

function _matchSector(sectorName) {
    if (!sectorName) return null;
    var lower = sectorName.toLowerCase().trim();

    // Exact match first
    for (var key in SECTOR_PEERS) {
        if (key.toLowerCase() === lower) return key;
    }

    // Partial match
    for (var key in SECTOR_PEERS) {
        if (lower.indexOf(key.toLowerCase()) !== -1 || key.toLowerCase().indexOf(lower) !== -1) {
            return key;
        }
    }

    // Word-based match
    var words = lower.split(/\s+/);
    for (var key in SECTOR_PEERS) {
        var keyWords = key.toLowerCase().split(/\s+/);
        for (var w = 0; w < words.length; w++) {
            for (var kw = 0; kw < keyWords.length; kw++) {
                if (words[w] === keyWords[kw] && words[w].length > 3) {
                    return key;
                }
            }
        }
    }

    return null;
}


// ============================================================
// MAIN ANALYSIS FUNCTION
// ============================================================

async function runComparableAnalysis(symbol, overrides) {
    overrides = overrides || {};
    var output = document.getElementById('analysisOutput');
    output.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><br>Fetching data for ' + symbol + ' and selecting peer companies...</div>';

    try {
        // --- Step 1-2: Fetch target company data ---
        var [comprehensiveRes, detailsRes] = await Promise.all([
            _compsFetch(apiBaseURL + '/api/stock/' + symbol + '/comprehensive'),
            _compsFetch(apiBaseURL + '/api/stock/' + symbol + '/details')
        ]);

        var targetDetails = detailsRes || {};
        targetDetails.ticker = symbol;
        var targetQuote = comprehensiveRes.quote || comprehensiveRes || {};
        var targetFinancials = comprehensiveRes.financials || [];

        // If comprehensive didn't return financials, fetch separately
        if (!targetFinancials.length) {
            var finRes = await _compsFetch(apiBaseURL + '/api/stock/' + symbol + '/financials?limit=4');
            targetFinancials = finRes.financials || finRes || [];
        }

        // Filter to quarterly
        var targetQuarterly = targetFinancials.filter(function (f) {
            return f.fiscalPeriod !== 'FY';
        });
        if (targetQuarterly.length === 0) {
            targetQuarterly = targetFinancials; // use whatever we have
        }

        if (!targetQuarterly.length || targetQuarterly.length < 1) {
            output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
                'Insufficient financial data for ' + symbol + '. This stock may be an ETF or have no quarterly filings available.</div>';
            return;
        }

        // --- Step 3: Determine sector ---
        var rawSector = targetDetails.sicDescription || '';
        var gicsSector = null;

        // Try to find from equityHoldings first
        if (typeof equityHoldings !== 'undefined') {
            for (var h = 0; h < equityHoldings.length; h++) {
                if (equityHoldings[h].symbol === symbol) {
                    gicsSector = equityHoldings[h].gicsSector;
                    break;
                }
            }
        }

        // Fallback: match from SIC description
        if (!gicsSector || gicsSector === 'N/A') {
            gicsSector = _matchSector(rawSector);
        }

        // Fallback: try common SIC code ranges
        if (!gicsSector && targetDetails.sicCode) {
            var sic = parseInt(targetDetails.sicCode, 10);
            if (sic >= 3570 && sic <= 3599 || sic >= 7370 && sic <= 7379 || sic >= 3670 && sic <= 3679) {
                gicsSector = 'Information Technology';
            } else if (sic >= 6000 && sic <= 6799) {
                gicsSector = 'Financials';
            } else if (sic >= 2000 && sic <= 2099 || sic >= 5400 && sic <= 5499) {
                gicsSector = 'Consumer Staples';
            } else if (sic >= 2800 && sic <= 2899 || sic >= 3841 && sic <= 3851) {
                gicsSector = 'Health Care';
            } else if (sic >= 4900 && sic <= 4999) {
                gicsSector = 'Utilities';
            } else if (sic >= 1300 && sic <= 1399 || sic >= 2900 && sic <= 2999) {
                gicsSector = 'Energy';
            } else if (sic >= 6500 && sic <= 6599) {
                gicsSector = 'Real Estate';
            } else if (sic >= 3400 && sic <= 3599 || sic >= 3700 && sic <= 3799) {
                gicsSector = 'Industrials';
            } else if (sic >= 4800 && sic <= 4899) {
                gicsSector = 'Communication Services';
            }
        }

        // Ultimate fallback
        if (!gicsSector) {
            gicsSector = 'Information Technology';
        }

        // --- Step 4: Select peers ---
        var peerSymbols = [];
        var fromBenchmark = 0;
        var usingCustomPeers = false;

        // Check for user-provided custom peers
        if (overrides.customPeers && typeof overrides.customPeers === 'string' && overrides.customPeers.trim().length > 0) {
            usingCustomPeers = true;
            var customList = overrides.customPeers.split(',').map(function(t) { return t.trim().toUpperCase(); })
                .filter(function(t) { return t.length > 0 && t !== symbol; });
            for (var ci = 0; ci < customList.length && peerSymbols.length < 7; ci++) {
                if (peerSymbols.indexOf(customList[ci]) === -1) {
                    peerSymbols.push(customList[ci]);
                }
            }
            fromBenchmark = peerSymbols.length;
        } else {
            // Use SECTOR_PEERS for representative sector comps
            var sectorPeerList = SECTOR_PEERS[gicsSector] || [];
            for (var j = 0; j < sectorPeerList.length; j++) {
                var sp = sectorPeerList[j];
                if (sp !== symbol && peerSymbols.indexOf(sp) === -1) {
                    peerSymbols.push(sp);
                    fromBenchmark++;
                }
                if (peerSymbols.length >= 5) break;
            }
        }

        // Trim to max 7 for custom, 5 for auto
        peerSymbols = peerSymbols.slice(0, usingCustomPeers ? 7 : 5);
        fromBenchmark = peerSymbols.length;

        if (peerSymbols.length < 2) {
            output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
                'Unable to find enough comparable companies for ' + symbol + ' in the ' + gicsSector + ' sector. Need at least 2 peers.</div>';
            return;
        }

        // --- Step 5: Update loading ---
        output.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><br>Analyzing ' + symbol +
            ' against ' + peerSymbols.length + ' comparable companies...</div>';

        // --- Step 6: Fetch peer data in parallel ---
        var peerPromises = peerSymbols.map(function (ps) {
            return Promise.all([
                _compsFetch(apiBaseURL + '/api/stock/' + ps + '/details').catch(function () { return null; }),
                _compsFetch(apiBaseURL + '/api/stock/' + ps + '/financials?limit=4').catch(function () { return null; }),
                _compsFetch(apiBaseURL + '/api/stock/' + ps + '/comprehensive').catch(function () { return null; })
            ]).then(function (results) {
                return { symbol: ps, details: results[0], financialsRes: results[1], comprehensive: results[2] };
            }).catch(function () {
                return { symbol: ps, details: null, financialsRes: null, comprehensive: null };
            });
        });

        var peerResults = await Promise.all(peerPromises);

        // --- Step 7: Compute multiples for target ---
        var targetMultiples = _computeMultiples(targetDetails, targetQuarterly, targetQuote);
        targetMultiples.ticker = symbol;
        targetMultiples.name = targetDetails.name || symbol;

        // Compute multiples for each peer
        var peersData = [];
        for (var k = 0; k < peerResults.length; k++) {
            var pr = peerResults[k];
            if (!pr.details) continue;

            pr.details.ticker = pr.symbol;
            var peerFinancials = [];
            if (pr.financialsRes) {
                peerFinancials = pr.financialsRes.financials || pr.financialsRes || [];
                if (!Array.isArray(peerFinancials)) peerFinancials = [];
            }
            // Filter to quarterly
            var peerQ = peerFinancials.filter(function (f) { return f.fiscalPeriod !== 'FY'; });
            if (peerQ.length === 0) peerQ = peerFinancials;

            var peerQuote = pr.comprehensive ? (pr.comprehensive.quote || {}) : {};

            var peerMult = _computeMultiples(pr.details, peerQ, peerQuote);
            peerMult.ticker = pr.symbol;
            peerMult.name = pr.details.name || pr.symbol;

            // Only include if we got meaningful data
            if (peerMult.marketCap > 0) {
                peersData.push(peerMult);
            }
        }

        if (peersData.length < 2) {
            output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
                'Unable to find comparable companies with sufficient data for ' + symbol + '. Only ' + peersData.length +
                ' peers returned valid data. Minimum 2 required.</div>';
            return;
        }

        // --- Step 8: Peer medians ---
        var medianPE = _median(peersData.map(function (p) { return p.pe; }));
        var medianPS = _median(peersData.map(function (p) { return p.ps; }));
        var medianPB = _median(peersData.map(function (p) { return p.pb; }));
        var medianEVRev = _median(peersData.map(function (p) { return p.evToRevenue; }));
        var medianEVEBITDA = _median(peersData.map(function (p) { return p.evToEBITDA; }));

        var medians = {
            pe: medianPE,
            ps: medianPS,
            pb: medianPB,
            evToRevenue: medianEVRev,
            evToEBITDA: medianEVEBITDA
        };

        // --- Step 9: Implied fair values ---
        var impliedValues = [];

        // P/E implied
        if (medianPE !== null && targetMultiples.ttmEPS > 0) {
            var impliedPE = medianPE * targetMultiples.ttmEPS;
            // Also compute min/max from peers for football field
            var peerPEs = peersData.map(function (p) { return p.pe; }).filter(function (v) { return v !== null && v > 0; });
            impliedValues.push({
                method: 'P/E',
                peerMedian: medianPE,
                targetMetricLabel: 'EPS',
                targetMetric: targetMultiples.ttmEPS,
                implied: impliedPE,
                min: peerPEs.length > 0 ? Math.min.apply(null, peerPEs) * targetMultiples.ttmEPS : impliedPE * 0.8,
                max: peerPEs.length > 0 ? Math.max.apply(null, peerPEs) * targetMultiples.ttmEPS : impliedPE * 1.2
            });
        }

        // EV/EBITDA implied
        if (medianEVEBITDA !== null && targetMultiples.ttmEBITDA > 0 && targetMultiples.sharesOut > 0) {
            var impliedEV = medianEVEBITDA * targetMultiples.ttmEBITDA;
            var impliedEVEBITDA = (impliedEV - targetMultiples.netDebt) / targetMultiples.sharesOut;
            var peerEVEBITDAs = peersData.map(function (p) { return p.evToEBITDA; }).filter(function (v) { return v !== null && v > 0; });
            impliedValues.push({
                method: 'EV/EBITDA',
                peerMedian: medianEVEBITDA,
                targetMetricLabel: 'EBITDA',
                targetMetric: targetMultiples.ttmEBITDA,
                implied: impliedEVEBITDA,
                min: peerEVEBITDAs.length > 0 ? (Math.min.apply(null, peerEVEBITDAs) * targetMultiples.ttmEBITDA - targetMultiples.netDebt) / targetMultiples.sharesOut : impliedEVEBITDA * 0.8,
                max: peerEVEBITDAs.length > 0 ? (Math.max.apply(null, peerEVEBITDAs) * targetMultiples.ttmEBITDA - targetMultiples.netDebt) / targetMultiples.sharesOut : impliedEVEBITDA * 1.2
            });
        }

        // P/S implied
        if (medianPS !== null && targetMultiples.ttmRevenue > 0 && targetMultiples.sharesOut > 0) {
            var impliedPSVal = (medianPS * targetMultiples.ttmRevenue) / targetMultiples.sharesOut;
            var peerPSs = peersData.map(function (p) { return p.ps; }).filter(function (v) { return v !== null && v > 0; });
            impliedValues.push({
                method: 'P/S',
                peerMedian: medianPS,
                targetMetricLabel: 'Revenue',
                targetMetric: targetMultiples.ttmRevenue,
                implied: impliedPSVal,
                min: peerPSs.length > 0 ? (Math.min.apply(null, peerPSs) * targetMultiples.ttmRevenue) / targetMultiples.sharesOut : impliedPSVal * 0.8,
                max: peerPSs.length > 0 ? (Math.max.apply(null, peerPSs) * targetMultiples.ttmRevenue) / targetMultiples.sharesOut : impliedPSVal * 1.2
            });
        }

        // P/B implied
        if (medianPB !== null && targetMultiples.latestEquity > 0 && targetMultiples.sharesOut > 0) {
            var impliedPBVal = (medianPB * targetMultiples.latestEquity) / targetMultiples.sharesOut;
            var peerPBs = peersData.map(function (p) { return p.pb; }).filter(function (v) { return v !== null && v > 0; });
            impliedValues.push({
                method: 'P/B',
                peerMedian: medianPB,
                targetMetricLabel: 'Book Value',
                targetMetric: targetMultiples.latestEquity,
                implied: impliedPBVal,
                min: peerPBs.length > 0 ? (Math.min.apply(null, peerPBs) * targetMultiples.latestEquity) / targetMultiples.sharesOut : impliedPBVal * 0.8,
                max: peerPBs.length > 0 ? (Math.max.apply(null, peerPBs) * targetMultiples.latestEquity) / targetMultiples.sharesOut : impliedPBVal * 1.2
            });
        }

        // EV/Revenue implied
        if (medianEVRev !== null && targetMultiples.ttmRevenue > 0 && targetMultiples.sharesOut > 0) {
            var impliedEVRev = (medianEVRev * targetMultiples.ttmRevenue - targetMultiples.netDebt) / targetMultiples.sharesOut;
            var peerEVRevs = peersData.map(function (p) { return p.evToRevenue; }).filter(function (v) { return v !== null && v > 0; });
            impliedValues.push({
                method: 'EV/Revenue',
                peerMedian: medianEVRev,
                targetMetricLabel: 'Revenue',
                targetMetric: targetMultiples.ttmRevenue,
                implied: impliedEVRev,
                min: peerEVRevs.length > 0 ? (Math.min.apply(null, peerEVRevs) * targetMultiples.ttmRevenue - targetMultiples.netDebt) / targetMultiples.sharesOut : impliedEVRev * 0.8,
                max: peerEVRevs.length > 0 ? (Math.max.apply(null, peerEVRevs) * targetMultiples.ttmRevenue - targetMultiples.netDebt) / targetMultiples.sharesOut : impliedEVRev * 1.2
            });
        }

        // Filter out nonsensical implied values (negative, zero, extreme outliers)
        impliedValues = impliedValues.filter(function (iv) {
            return iv.implied > 0 && isFinite(iv.implied) && iv.implied < targetMultiples.price * 10;
        });

        if (impliedValues.length === 0) {
            output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
                'Unable to compute implied fair values for ' + symbol + '. The company may have negative earnings or insufficient comparable data.</div>';
            return;
        }

        // --- Step 10: Average implied value ---
        var avgImplied = impliedValues.reduce(function (s, iv) { return s + iv.implied; }, 0) / impliedValues.length;

        // --- Step 11: Verdict ---
        var currentPrice = targetMultiples.price;
        var upside = currentPrice > 0 ? ((avgImplied - currentPrice) / currentPrice) * 100 : 0;

        var verdict, verdictClass;
        if (upside > 15) {
            verdict = 'UNDERVALUED';
            verdictClass = 'undervalued';
        } else if (upside > -15) {
            verdict = 'FAIRLY VALUED';
            verdictClass = 'fairly-valued';
        } else {
            verdict = 'OVERVALUED';
            verdictClass = 'overvalued';
        }

        // --- Step 12: Render ---
        renderComparableOutput(
            symbol, targetMultiples, peersData, medians, impliedValues,
            currentPrice, avgImplied, upside, verdict, verdictClass,
            gicsSector, fromBenchmark, usingCustomPeers
        );

        // --- Store CSV data ---
        var csvData = {
            modelName: 'Comparable Company Analysis',
            firmStyle: 'Goldman Sachs Style',
            runDate: new Date().toISOString(),
            ticker: symbol,
            sections: [
                {
                    title: 'Valuation Verdict',
                    type: 'metrics',
                    rows: [
                        { label: 'Symbol', value: symbol },
                        { label: 'Company', value: targetMultiples.name },
                        { label: 'Current Price', formatted: fmtCur(currentPrice) },
                        { label: 'Comp-Implied Fair Value', formatted: fmtCur(avgImplied) },
                        { label: 'Upside / Downside', formatted: fmtPct(upside) },
                        { label: 'Verdict', value: verdict },
                        { label: 'Sector', value: gicsSector },
                        { label: 'Number of Peers', formatted: String(peersData.length) }
                    ]
                },
                {
                    title: 'Target Company Metrics',
                    type: 'metrics',
                    rows: [
                        { label: 'Market Cap', formatted: fmtBig(targetMultiples.marketCap) },
                        { label: 'Enterprise Value', formatted: fmtBig(targetMultiples.ev) },
                        { label: 'TTM Revenue', formatted: fmtBig(targetMultiples.ttmRevenue) },
                        { label: 'TTM EBITDA (proxy)', formatted: fmtBig(targetMultiples.ttmEBITDA) },
                        { label: 'TTM EPS', formatted: fmtCur(targetMultiples.ttmEPS) },
                        { label: 'Shares Outstanding', formatted: fmtBig(targetMultiples.sharesOut) }
                    ]
                },
                {
                    title: 'Comparable Companies Multiples',
                    type: 'table',
                    headers: ['Company', 'Ticker', 'Mkt Cap', 'P/E', 'EV/EBITDA', 'P/S', 'P/B', 'EV/Rev'],
                    rows: (function () {
                        var rows = [];
                        rows.push([
                            targetMultiples.name + ' (Target)', symbol,
                            fmtBig(targetMultiples.marketCap),
                            targetMultiples.pe !== null ? fmt(targetMultiples.pe, 1) : 'N/A',
                            targetMultiples.evToEBITDA !== null ? fmt(targetMultiples.evToEBITDA, 1) : 'N/A',
                            targetMultiples.ps !== null ? fmt(targetMultiples.ps, 1) : 'N/A',
                            targetMultiples.pb !== null ? fmt(targetMultiples.pb, 1) : 'N/A',
                            targetMultiples.evToRevenue !== null ? fmt(targetMultiples.evToRevenue, 1) : 'N/A'
                        ]);
                        for (var p = 0; p < peersData.length; p++) {
                            var pd = peersData[p];
                            rows.push([
                                pd.name, pd.ticker,
                                fmtBig(pd.marketCap),
                                pd.pe !== null ? fmt(pd.pe, 1) : 'N/A',
                                pd.evToEBITDA !== null ? fmt(pd.evToEBITDA, 1) : 'N/A',
                                pd.ps !== null ? fmt(pd.ps, 1) : 'N/A',
                                pd.pb !== null ? fmt(pd.pb, 1) : 'N/A',
                                pd.evToRevenue !== null ? fmt(pd.evToRevenue, 1) : 'N/A'
                            ]);
                        }
                        rows.push([
                            'Peer Median', '-', '-',
                            medians.pe !== null ? fmt(medians.pe, 1) : 'N/A',
                            medians.evToEBITDA !== null ? fmt(medians.evToEBITDA, 1) : 'N/A',
                            medians.ps !== null ? fmt(medians.ps, 1) : 'N/A',
                            medians.pb !== null ? fmt(medians.pb, 1) : 'N/A',
                            medians.evToRevenue !== null ? fmt(medians.evToRevenue, 1) : 'N/A'
                        ]);
                        return rows;
                    })()
                },
                {
                    title: 'Implied Fair Value by Method',
                    type: 'table',
                    headers: ['Method', 'Peer Median Multiple', 'Target Metric', 'Implied Price', 'vs Current'],
                    rows: (function () {
                        var rows = [];
                        for (var v = 0; v < impliedValues.length; v++) {
                            var iv = impliedValues[v];
                            var diff = currentPrice > 0 ? ((iv.implied - currentPrice) / currentPrice) * 100 : 0;
                            rows.push([
                                iv.method,
                                fmt(iv.peerMedian, 1) + 'x',
                                iv.targetMetricLabel + ': ' + (iv.targetMetric > 1e6 ? fmtBig(iv.targetMetric) : fmtCur(iv.targetMetric)),
                                fmtCur(iv.implied),
                                fmtPct(diff)
                            ]);
                        }
                        rows.push(['Average', '', '', fmtCur(avgImplied), fmtPct(upside)]);
                        return rows;
                    })()
                },
                {
                    title: 'Peer Selection',
                    type: 'metrics',
                    rows: [
                        { label: 'Sector', value: gicsSector },
                        { label: 'Sector Benchmark Peers', formatted: String(fromBenchmark) },
                        { label: 'Total Peers', formatted: String(peersData.length) }
                    ]
                },
                {
                    title: 'Raw Financial Data — All Companies',
                    type: 'table',
                    headers: ['Ticker', 'Market Cap', 'Enterprise Value', 'TTM Revenue', 'TTM EBITDA', 'TTM EPS', 'Book Equity', 'P/E', 'EV/EBITDA', 'P/S', 'P/B'],
                    rows: (function () {
                        var allCompanies = [targetMultiples].concat(peersData);
                        return allCompanies.map(function (c) {
                            return [
                                c.ticker,
                                c.marketCap,
                                c.ev,
                                c.ttmRevenue,
                                c.ttmEBITDA,
                                c.ttmEPS,
                                c.latestEquity,
                                c.pe !== null ? c.pe : '',
                                c.evToEBITDA !== null ? c.evToEBITDA : '',
                                c.ps !== null ? c.ps : '',
                                c.pb !== null ? c.pb : ''
                            ];
                        });
                    })()
                }
            ]
        };
        storeAnalysisData('comps', csvData);

    } catch (err) {
        console.error('Comparable Analysis Error:', err);
        output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
            'Error running comparable analysis for ' + symbol + ': ' + err.message + '</div>';
    }
}


// ============================================================
// RENDER FUNCTION
// ============================================================

function renderComparableOutput(
    symbol, targetData, peersData, medians, impliedValues,
    currentPrice, avgImplied, upside, verdict, verdictClass,
    gicsSector, fromBenchmark, usingCustomPeers
) {
    var output = document.getElementById('analysisOutput');

    // Destroy previous chart instances
    if (chartInstances['comps_football']) {
        try { chartInstances['comps_football'].destroy(); } catch (e) {}
        delete chartInstances['comps_football'];
    }

    // Helper: format multiple or N/A
    function fmtMult(val) {
        if (val === null || val === undefined || !isFinite(val)) return '<span style="opacity:0.4;">N/A</span>';
        return fmt(val, 1) + 'x';
    }

    // Helper: color-code target vs median
    function colorMultiple(targetVal, medianVal) {
        if (targetVal === null || medianVal === null || !isFinite(targetVal) || !isFinite(medianVal)) {
            return '<span style="opacity:0.4;">N/A</span>';
        }
        var pct = ((targetVal - medianVal) / medianVal) * 100;
        var color = '';
        // Lower multiple = cheaper = green; higher = expensive = red
        if (pct < -10) color = 'color:#28a745;'; // significantly cheaper
        else if (pct < -2) color = 'color:#6fcf8b;'; // slightly cheaper
        else if (pct > 10) color = 'color:#dc3545;'; // significantly more expensive
        else if (pct > 2) color = 'color:#fd7e14;'; // slightly more expensive
        else color = 'color:rgba(255,255,255,0.85);'; // roughly in line
        return '<span style="' + color + 'font-weight:600;">' + fmt(targetVal, 1) + 'x</span>';
    }

    // Build comp table rows
    var compTableRows = '';

    // Target row (highlighted)
    compTableRows += '<tr style="background:rgba(254,188,17,0.08);border-left:3px solid #febc11;">' +
        '<td style="font-weight:700;color:#febc11;">' + (targetData.name || symbol) + ' <span style="font-size:0.7rem;">&#9733;</span></td>' +
        '<td>' + fmtBig(targetData.marketCap) + '</td>' +
        '<td>' + colorMultiple(targetData.pe, medians.pe) + '</td>' +
        '<td>' + colorMultiple(targetData.evToEBITDA, medians.evToEBITDA) + '</td>' +
        '<td>' + colorMultiple(targetData.ps, medians.ps) + '</td>' +
        '<td>' + colorMultiple(targetData.pb, medians.pb) + '</td>' +
        '<td>' + colorMultiple(targetData.evToRevenue, medians.evToRevenue) + '</td>' +
        '</tr>';

    // Peer rows
    for (var i = 0; i < peersData.length; i++) {
        var pd = peersData[i];
        compTableRows += '<tr>' +
            '<td>' + (pd.name || pd.ticker) + ' <span style="opacity:0.4;font-size:0.75rem;">(' + pd.ticker + ')</span></td>' +
            '<td>' + fmtBig(pd.marketCap) + '</td>' +
            '<td>' + fmtMult(pd.pe) + '</td>' +
            '<td>' + fmtMult(pd.evToEBITDA) + '</td>' +
            '<td>' + fmtMult(pd.ps) + '</td>' +
            '<td>' + fmtMult(pd.pb) + '</td>' +
            '<td>' + fmtMult(pd.evToRevenue) + '</td>' +
            '</tr>';
    }

    // Median row
    compTableRows += '<tr style="border-top:2px solid rgba(255,255,255,0.15);font-weight:700;">' +
        '<td style="font-weight:700;">Peer Median</td>' +
        '<td style="opacity:0.4;">-</td>' +
        '<td class="highlight">' + fmtMult(medians.pe) + '</td>' +
        '<td class="highlight">' + fmtMult(medians.evToEBITDA) + '</td>' +
        '<td class="highlight">' + fmtMult(medians.ps) + '</td>' +
        '<td class="highlight">' + fmtMult(medians.pb) + '</td>' +
        '<td class="highlight">' + fmtMult(medians.evToRevenue) + '</td>' +
        '</tr>';

    // Build implied values table
    var impliedTableRows = '';
    for (var v = 0; v < impliedValues.length; v++) {
        var iv = impliedValues[v];
        var diff = currentPrice > 0 ? ((iv.implied - currentPrice) / currentPrice) * 100 : 0;
        var diffClass = diff >= 0 ? 'positive' : 'negative';
        var arrow = diff >= 0 ? ' &#8593;' : ' &#8595;';
        var metricDisplay = iv.targetMetric > 1e6 ? fmtBig(iv.targetMetric) : fmtCur(iv.targetMetric);

        impliedTableRows += '<tr>' +
            '<td style="font-weight:600;">' + iv.method + '</td>' +
            '<td>' + fmt(iv.peerMedian, 1) + 'x</td>' +
            '<td>' + iv.targetMetricLabel + ': ' + metricDisplay + '</td>' +
            '<td class="highlight">' + fmtCur(iv.implied) + '</td>' +
            '<td class="' + diffClass + '">' + fmtPct(diff) + arrow + '</td>' +
            '</tr>';
    }

    // Average row
    var avgDiffClass = upside >= 0 ? 'positive' : 'negative';
    var avgArrow = upside >= 0 ? ' &#8593;' : ' &#8595;';
    impliedTableRows += '<tr style="border-top:2px solid rgba(255,255,255,0.15);font-weight:700;">' +
        '<td style="font-weight:800;">Average</td>' +
        '<td></td>' +
        '<td></td>' +
        '<td class="highlight" style="font-size:1.05rem;">' + fmtCur(avgImplied) + '</td>' +
        '<td class="' + avgDiffClass + '" style="font-weight:800;">' + fmtPct(upside) + avgArrow + '</td>' +
        '</tr>';

    // Build peer selection list
    var peerListHtml = '';
    for (var p = 0; p < peersData.length; p++) {
        var pd = peersData[p];
        var badge = usingCustomPeers
            ? '<span style="background:rgba(254,188,17,0.15);color:#febc11;padding:0.15rem 0.5rem;border-radius:8px;font-size:0.7rem;font-weight:700;margin-left:0.5rem;">CUSTOM</span>'
            : '<span style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:0.15rem 0.5rem;border-radius:8px;font-size:0.7rem;font-weight:700;margin-left:0.5rem;">SECTOR COMP</span>';
        peerListHtml += '<div style="padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:space-between;">' +
            '<span><strong style="color:#febc11;">' + pd.ticker + '</strong> &mdash; ' + (pd.name || pd.ticker) + '</span>' +
            badge +
            '</div>';
    }

    // Render
    output.innerHTML =
        // CARD 1 - Verdict (span-2)
        '<div class="result-card span-2 verdict-card">' +
            '<div class="verdict-badge ' + verdictClass + '">' + verdict + '</div>' +
            '<div class="verdict-price" style="color:' + (upside >= 0 ? '#28a745' : '#dc3545') + ';">' + fmtCur(avgImplied) + '</div>' +
            '<div class="verdict-detail">Comp-Implied Fair Value vs Current Price of ' + fmtCur(currentPrice) +
                ' &mdash; ' + fmtPct(upside) + ' ' + (upside >= 0 ? 'Upside' : 'Downside') + '</div>' +
            '<div style="font-size:0.85rem;opacity:0.6;margin-top:0.5rem;">Based on median multiples of ' +
                peersData.length + ' comparable companies in ' + gicsSector + '</div>' +
        '</div>' +

        '<div class="result-grid">' +

            // CARD 2 - Target Company Overview
            '<div class="result-card">' +
                '<h3><i class="fas fa-building"></i> Target Company Overview</h3>' +
                '<div class="metrics-row">' +
                    '<div class="metric-item"><div class="metric-label">Ticker</div><div class="metric-value">' + symbol + '</div></div>' +
                    '<div class="metric-item"><div class="metric-label">Price</div><div class="metric-value">' + fmtCur(currentPrice) + '</div></div>' +
                    '<div class="metric-item"><div class="metric-label">Market Cap</div><div class="metric-value">' + fmtBig(targetData.marketCap) + '</div></div>' +
                '</div>' +
                '<table class="val-table">' +
                    '<tr><td>Company</td><td class="highlight">' + (targetData.name || symbol) + '</td></tr>' +
                    '<tr><td>Enterprise Value</td><td>' + fmtBig(targetData.ev) + '</td></tr>' +
                    '<tr><td>TTM Revenue</td><td>' + fmtBig(targetData.ttmRevenue) + '</td></tr>' +
                    '<tr><td>TTM EBITDA (proxy)</td><td>' + fmtBig(targetData.ttmEBITDA) + '</td></tr>' +
                    '<tr><td>TTM EPS (diluted)</td><td>' + fmtCur(targetData.ttmEPS) + '</td></tr>' +
                    '<tr><td>Shares Outstanding</td><td>' + fmtBig(targetData.sharesOut) + '</td></tr>' +
                    '<tr><td>Book Equity</td><td>' + fmtBig(targetData.latestEquity) + '</td></tr>' +
                '</table>' +
            '</div>' +

            // CARD 3 - Comp Table (span-2)
            '<div class="result-card span-2">' +
                '<h3><i class="fas fa-table"></i> Comparable Companies Multiples</h3>' +
                '<div style="overflow-x:auto;">' +
                    '<table class="val-table">' +
                        '<thead><tr>' +
                            '<th>Company</th><th>Mkt Cap</th><th>P/E</th><th>EV/EBITDA</th><th>P/S</th><th>P/B</th><th>EV/Rev</th>' +
                        '</tr></thead>' +
                        '<tbody>' + compTableRows + '</tbody>' +
                    '</table>' +
                '</div>' +
            '</div>' +

            // CARD 4 - Football Field Chart (span-2)
            '<div class="result-card span-2">' +
                '<h3><i class="fas fa-chart-bar"></i> Valuation Football Field</h3>' +
                '<div class="chart-box" style="height:280px;"><canvas id="compsFootballChart"></canvas></div>' +
            '</div>' +

            // CARD 5 - Implied Values Table
            '<div class="result-card span-2">' +
                '<h3><i class="fas fa-calculator"></i> Implied Fair Value by Method</h3>' +
                '<table class="val-table">' +
                    '<thead><tr>' +
                        '<th>Method</th><th>Peer Median</th><th>Target Metric</th><th>Implied Value</th><th>vs Current Price</th>' +
                    '</tr></thead>' +
                    '<tbody>' + impliedTableRows + '</tbody>' +
                '</table>' +
            '</div>' +

            // CARD 6 - Peer Selection Methodology
            '<div class="result-card">' +
                '<h3><i class="fas fa-users"></i> Peer Selection</h3>' +
                '<div style="font-size:0.85rem;color:rgba(255,255,255,0.7);margin-bottom:1rem;">' +
                    (usingCustomPeers
                        ? 'Using <strong style="color:#febc11;">custom user-selected</strong> peer companies. ' +
                          fromBenchmark + ' peers analyzed. '
                        : 'Peers selected from representative <strong style="color:#febc11;">' + gicsSector + '</strong> sector companies. ' +
                          fromBenchmark + ' large-cap sector benchmarks used for comparison. ' +
                          'Selection criteria: same GICS sector classification, large-cap sector leaders.') +
                '</div>' +
                peerListHtml +
            '</div>' +

            // CARD 7 - Assumptions
            '<div class="result-card">' +
                '<div class="assumptions-box" style="margin-top:0;">' +
                    '<h4><i class="fas fa-info-circle"></i> Methodology & Assumptions</h4>' +
                    '<ul>' +
                        '<li>TTM (Trailing Twelve Months) financials computed from up to 4 most recent quarterly filings</li>' +
                        '<li>EBITDA is a proxy estimate: Operating Income + 30% of (Gross Profit - Operating Income) as D&A add-back</li>' +
                        '<li>Enterprise Value = Market Cap + Net Debt, where Net Debt = Total Liabilities - 10% of Total Assets (cash proxy)</li>' +
                        '<li>Peer medians exclude companies with negative or unavailable metrics for each multiple</li>' +
                        '<li>Implied fair values are per-share and derived by applying peer median multiples to the target company metrics</li>' +
                        '<li>Comparable analysis provides relative valuation only; does not account for growth differential or qualitative factors</li>' +
                        '<li>Undervalued: >15% upside | Fairly Valued: -15% to +15% | Overvalued: >15% downside</li>' +
                    '</ul>' +
                '</div>' +
            '</div>' +

        '</div>' + // close result-grid

        // CARD 8 - Download CSV
        '<button class="run-btn" onclick="downloadModelCSV(\'comps\')" style="margin-top:1rem;background:linear-gradient(135deg,#28a745,#20c997);width:100%;">' +
            '<i class="fas fa-download"></i> Download Analysis CSV' +
        '</button>';

    // --- Render Football Field Chart ---
    setTimeout(function () {
        _renderCompsFootballChart(impliedValues, currentPrice, avgImplied);
    }, 100);
}


// ============================================================
// FOOTBALL FIELD CHART
// ============================================================

function _renderCompsFootballChart(impliedValues, currentPrice, avgImplied) {
    var canvas = document.getElementById('compsFootballChart');
    if (!canvas) return;

    // Prepare data for horizontal floating bars
    var labels = impliedValues.map(function (iv) { return iv.method + ' Implied'; });
    var barData = impliedValues.map(function (iv) { return [iv.min, iv.max]; });
    var medianData = impliedValues.map(function (iv) { return iv.implied; });

    // Determine x-axis range
    var allValues = [];
    impliedValues.forEach(function (iv) {
        allValues.push(iv.min, iv.max, iv.implied);
    });
    allValues.push(currentPrice, avgImplied);
    var xMin = Math.min.apply(null, allValues) * 0.85;
    var xMax = Math.max.apply(null, allValues) * 1.15;

    chartInstances['comps_football'] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Valuation Range',
                    data: barData,
                    backgroundColor: 'rgba(254,188,17,0.25)',
                    borderColor: 'rgba(254,188,17,0.6)',
                    borderWidth: 1,
                    borderSkipped: false,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8
                },
                {
                    label: 'Median Implied',
                    type: 'scatter',
                    data: medianData.map(function (v, i) { return { x: v, y: i }; }),
                    backgroundColor: '#febc11',
                    borderColor: '#febc11',
                    pointRadius: 7,
                    pointStyle: 'rectRot',
                    showLine: false
                },
                {
                    label: 'Current Price (' + fmtCur(currentPrice) + ')',
                    type: 'scatter',
                    data: labels.map(function (_, i) { return { x: currentPrice, y: i }; }),
                    backgroundColor: '#ffffff',
                    borderColor: '#ffffff',
                    pointRadius: 6,
                    pointStyle: 'line',
                    borderWidth: 2,
                    showLine: false
                }
            ]
        },
        plugins: [{
            id: 'currentPriceLine',
            beforeDatasetsDraw: function (chart) {
                var ctx = chart.ctx;
                var xAxis = chart.scales.x;
                var yAxis = chart.scales.y;
                var xPixel = xAxis.getPixelForValue(currentPrice);

                if (xPixel >= xAxis.left && xPixel <= xAxis.right) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                    ctx.lineWidth = 2;
                    ctx.moveTo(xPixel, yAxis.top);
                    ctx.lineTo(xPixel, yAxis.bottom);
                    ctx.stroke();

                    // Label
                    ctx.fillStyle = 'rgba(255,255,255,0.8)';
                    ctx.font = 'bold 10px Segoe UI, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('Current: ' + fmtCur(currentPrice), xPixel, yAxis.top - 6);
                    ctx.restore();
                }
            }
        }],
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e5e5e5',
                        boxWidth: 12,
                        font: { size: 10 },
                        filter: function (item) {
                            return item.text !== 'Current Price (' + fmtCur(currentPrice) + ')' || item.datasetIndex === 2;
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,20,25,0.9)',
                    titleColor: '#febc11',
                    bodyColor: '#e5e5e5',
                    borderColor: 'rgba(254,188,17,0.3)',
                    borderWidth: 1,
                    callbacks: {
                        label: function (ctx) {
                            if (ctx.datasetIndex === 0) {
                                var raw = ctx.raw;
                                if (Array.isArray(raw)) {
                                    return 'Range: ' + fmtCur(raw[0]) + ' - ' + fmtCur(raw[1]);
                                }
                            } else if (ctx.datasetIndex === 1) {
                                return 'Median Implied: ' + fmtCur(ctx.raw.x);
                            } else if (ctx.datasetIndex === 2) {
                                return 'Current Price: ' + fmtCur(ctx.raw.x);
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    min: xMin,
                    max: xMax,
                    ticks: {
                        color: '#aaa',
                        callback: function (v) { return '$' + v.toFixed(0); }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    title: {
                        display: true,
                        text: 'Implied Share Price ($)',
                        color: 'rgba(255,255,255,0.5)',
                        font: { size: 11 }
                    }
                },
                y: {
                    ticks: {
                        color: '#e5e5e5',
                        font: { size: 11, weight: '600' }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}
