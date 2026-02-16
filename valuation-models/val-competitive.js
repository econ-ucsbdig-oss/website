/**
 * val-competitive.js
 * Bain & Company Competitive Strategy Analysis
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
 *   GET {apiBaseURL}/api/stock/{symbol}/financials?limit=12
 *   GET {apiBaseURL}/api/stock/{symbol}/comprehensive
 */

// ============================================================
// SECTOR COMPETITORS CONSTANT
// ============================================================

const SECTOR_COMPETITORS = {
    'Information Technology': ['AAPL', 'MSFT', 'NVDA', 'CRM', 'ORCL', 'ADBE', 'IBM'],
    'Communication Services': ['META', 'GOOGL', 'NFLX', 'DIS', 'CMCSA', 'T', 'VZ'],
    'Consumer Discretionary':  ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'LOW'],
    'Financials':              ['JPM', 'BAC', 'GS', 'MS', 'BLK', 'AXP', 'WFC'],
    'Health Care':             ['JNJ', 'UNH', 'LLY', 'PFE', 'ABT', 'TMO', 'MRK'],
    'Industrials':             ['HON', 'CAT', 'UPS', 'RTX', 'LMT', 'DE', 'GE'],
    'Consumer Staples':        ['PG', 'KO', 'PEP', 'WMT', 'COST', 'CL', 'MDLZ'],
    'Energy':                  ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'VLO'],
    'Materials':               ['LIN', 'APD', 'ECL', 'NEM', 'NUE', 'DD', 'PPG'],
    'Real Estate':             ['AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'O', 'VICI'],
    'Utilities':               ['NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE']
};


// ============================================================
// SECTOR THREATS (hardcoded per sector for SWOT)
// ============================================================

var _COMP_SECTOR_THREATS = {
    'Information Technology': ['Rapid technological obsolescence and disruption', 'Intensifying regulatory scrutiny on big tech', 'Talent war driving up R&D costs'],
    'Communication Services': ['Cord-cutting eroding traditional media revenue', 'Regulatory pressure on content and data practices', 'Ad market cyclicality and competition'],
    'Consumer Discretionary': ['Consumer spending sensitivity to macro downturns', 'E-commerce disruption to legacy retail', 'Rising input costs and supply chain risk'],
    'Financials': ['Interest rate volatility compressing margins', 'Fintech disruption to traditional banking', 'Heightened regulatory capital requirements'],
    'Health Care': ['Drug pricing reform and government intervention', 'Patent cliffs on blockbuster drugs', 'Rising clinical trial costs and regulatory hurdles'],
    'Industrials': ['Cyclical demand tied to economic conditions', 'Supply chain disruptions and input cost inflation', 'Geopolitical risk in global operations'],
    'Consumer Staples': ['Private-label competition eroding brand premiums', 'Commodity cost inflation squeezing margins', 'Shifting consumer preferences to niche brands'],
    'Energy': ['Accelerating energy transition reducing fossil fuel demand', 'Commodity price volatility', 'Stricter environmental regulations and carbon taxes'],
    'Materials': ['Commodity price swings impacting profitability', 'Environmental regulation compliance costs', 'Substitution risk from alternative materials'],
    'Real Estate': ['Rising interest rates increasing cap rates', 'Remote work reducing office demand', 'Oversupply risk in key markets'],
    'Utilities': ['Regulatory rate caps limiting revenue growth', 'Extreme weather and infrastructure vulnerability', 'Competition from distributed energy and renewables']
};


// ============================================================
// HELPER: Safe fetch wrapper
// ============================================================

function _compFetch(url) {
    if (typeof cachedFetch === 'function') {
        return cachedFetch(url);
    }
    return fetch(url).then(function (r) { return r.json(); });
}


// ============================================================
// HELPER: Match sector name (partial/fuzzy) from SECTOR_COMPETITORS
// ============================================================

function _compMatchSector(sectorName) {
    if (!sectorName) return null;
    var lower = sectorName.toLowerCase().trim();

    // Exact match
    for (var key in SECTOR_COMPETITORS) {
        if (key.toLowerCase() === lower) return key;
    }
    // Partial match
    for (var key in SECTOR_COMPETITORS) {
        if (lower.indexOf(key.toLowerCase()) !== -1 || key.toLowerCase().indexOf(lower) !== -1) {
            return key;
        }
    }
    // Word-based match
    var words = lower.split(/\s+/);
    for (var key in SECTOR_COMPETITORS) {
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
// HELPER: Compute competitive metrics for a single company
// ============================================================

function _compComputeMetrics(details, financials) {
    var result = {
        ticker: details.ticker || '?',
        name: details.name || details.ticker || '?',
        marketCap: details.marketCap || 0,
        employees: details.totalEmployees || 0,
        ttmRevenue: 0,
        ttmNetIncome: 0,
        ttmOperatingIncome: 0,
        ttmGrossProfit: 0,
        grossMargin: null,
        operatingMargin: null,
        netMargin: null,
        revenueGrowthYoY: null,
        rdProxy: 0,
        revenuePerEmployee: null,
        roe: null,
        roa: null,
        debtToEquity: null,
        latestEquity: 0,
        latestAssets: 0,
        latestLiabilities: 0,
        pe: null,
        price: 0,
        ttmEPS: 0,
        valid: false
    };

    if (!financials || financials.length === 0) return result;

    // TTM from up to 4 most recent quarters
    var numQ = Math.min(financials.length, 4);
    var annFactor = 4 / numQ;

    var sumRev = 0, sumNI = 0, sumOI = 0, sumGP = 0, sumEPS = 0;
    for (var i = 0; i < numQ; i++) {
        var q = financials[i];
        sumRev += (q.revenues || 0);
        sumNI += (q.netIncome || 0);
        sumOI += (q.operatingIncome || 0);
        sumGP += (q.grossProfit || 0);
        sumEPS += (q.epsDiluted || q.eps || 0);
    }

    result.ttmRevenue = sumRev * annFactor;
    result.ttmNetIncome = sumNI * annFactor;
    result.ttmOperatingIncome = sumOI * annFactor;
    result.ttmGrossProfit = sumGP * annFactor;
    result.ttmEPS = sumEPS * annFactor;

    // Margins
    if (result.ttmRevenue > 0) {
        result.grossMargin = result.ttmGrossProfit / result.ttmRevenue;
        result.operatingMargin = result.ttmOperatingIncome / result.ttmRevenue;
        result.netMargin = result.ttmNetIncome / result.ttmRevenue;
    }

    // R&D proxy: gross profit minus operating income (SGA + R&D estimate)
    result.rdProxy = Math.max(result.ttmGrossProfit - result.ttmOperatingIncome, 0);

    // Revenue per employee
    if (result.employees > 0 && result.ttmRevenue > 0) {
        result.revenuePerEmployee = result.ttmRevenue / result.employees;
    }

    // Balance sheet from latest quarter
    result.latestEquity = financials[0].equity || 0;
    result.latestAssets = financials[0].assets || 0;
    result.latestLiabilities = financials[0].liabilities || 0;

    // ROE, ROA
    if (result.latestEquity > 0) {
        result.roe = result.ttmNetIncome / result.latestEquity;
    }
    if (result.latestAssets > 0) {
        result.roa = result.ttmNetIncome / result.latestAssets;
    }

    // Debt-to-Equity
    if (result.latestEquity > 0) {
        result.debtToEquity = result.latestLiabilities / result.latestEquity;
    }

    // P/E
    if (result.ttmEPS > 0 && result.marketCap > 0) {
        var sharesOut = details.weightedSharesOutstanding || details.shareClassSharesOutstanding || 0;
        if (sharesOut > 0) {
            result.price = result.marketCap / sharesOut;
            result.pe = result.price / result.ttmEPS;
        }
    }

    // Revenue Growth YoY: compare sum of latest 4 quarters vs prior 4
    if (financials.length >= 8) {
        var recentRev = 0, priorRev = 0;
        for (var r = 0; r < 4; r++) {
            recentRev += (financials[r].revenues || 0);
        }
        for (var r = 4; r < 8; r++) {
            priorRev += (financials[r].revenues || 0);
        }
        if (priorRev > 0) {
            result.revenueGrowthYoY = (recentRev - priorRev) / priorRev;
        }
    } else if (financials.length >= 5) {
        // Approximate from available quarters
        var first = financials[financials.length - 1].revenues || 0;
        var last = financials[0].revenues || 0;
        if (first > 0) {
            result.revenueGrowthYoY = (last - first) / first;
        }
    }

    result.valid = result.marketCap > 0 && result.ttmRevenue > 0;
    return result;
}


// ============================================================
// HELPER: Compute moat scores for a company
// ============================================================

function _compComputeMoat(metrics, sectorMedianOpMargin) {
    var moat = {
        brandPower: 1,
        costAdvantage: 1,
        networkEffects: 1,
        switchingCosts: 1,
        overall: 0,
        label: 'None'
    };

    // Brand Power: based on gross margin
    var gm = metrics.grossMargin;
    if (gm !== null) {
        if (gm > 0.60) moat.brandPower = 5;
        else if (gm > 0.50) moat.brandPower = 4;
        else if (gm > 0.40) moat.brandPower = 3;
        else if (gm > 0.25) moat.brandPower = 2;
        else moat.brandPower = 1;
    }

    // Cost Advantage: operating margin relative to sector median
    if (metrics.operatingMargin !== null && sectorMedianOpMargin !== null && sectorMedianOpMargin > 0) {
        var ratio = metrics.operatingMargin / sectorMedianOpMargin;
        if (ratio > 1.5) moat.costAdvantage = 5;
        else if (ratio > 1.25) moat.costAdvantage = 4;
        else if (ratio > 1.0) moat.costAdvantage = 3;
        else if (ratio > 0.75) moat.costAdvantage = 2;
        else moat.costAdvantage = 1;
    }

    // Network Effects: revenue per employee (higher = more leverage)
    var rpe = metrics.revenuePerEmployee;
    if (rpe !== null) {
        if (rpe > 1000000) moat.networkEffects = 5;
        else if (rpe > 600000) moat.networkEffects = 4;
        else if (rpe > 400000) moat.networkEffects = 3;
        else if (rpe > 200000) moat.networkEffects = 2;
        else moat.networkEffects = 1;
    }

    // Switching Costs: revenue growth stability + scale
    var growthStable = (metrics.revenueGrowthYoY !== null && metrics.revenueGrowthYoY > -0.05);
    var large = metrics.marketCap > 50e9;
    var medium = metrics.marketCap > 10e9;
    if (growthStable && large) moat.switchingCosts = 5;
    else if (growthStable && medium) moat.switchingCosts = 4;
    else if (growthStable) moat.switchingCosts = 3;
    else if (medium) moat.switchingCosts = 2;
    else moat.switchingCosts = 1;

    // Overall
    moat.overall = (moat.brandPower + moat.costAdvantage + moat.networkEffects + moat.switchingCosts) / 4;

    if (moat.overall >= 4.0) moat.label = 'Wide';
    else if (moat.overall >= 2.5) moat.label = 'Narrow';
    else moat.label = 'None';

    return moat;
}


// ============================================================
// HELPER: Compute management quality score (1-10)
// ============================================================

function _compManagementScore(metrics) {
    var score = 0;

    // Capital allocation: ROE
    if (metrics.roe !== null) {
        if (metrics.roe > 0.20) score += 3;
        else if (metrics.roe > 0.15) score += 2;
        else if (metrics.roe > 0.10) score += 1;
    }

    // Margin quality: operating margin
    if (metrics.operatingMargin !== null) {
        if (metrics.operatingMargin > 0.25) score += 2;
        else if (metrics.operatingMargin > 0.15) score += 1;
    }

    // Revenue growth
    if (metrics.revenueGrowthYoY !== null) {
        if (metrics.revenueGrowthYoY > 0.15) score += 2;
        else if (metrics.revenueGrowthYoY > 0.05) score += 1;
    }

    // Debt management
    if (metrics.debtToEquity !== null) {
        if (metrics.debtToEquity < 0.5) score += 2;
        else if (metrics.debtToEquity < 1.0) score += 1;
    }

    // Revenue per employee efficiency
    if (metrics.revenuePerEmployee !== null) {
        if (metrics.revenuePerEmployee > 500000) score += 1;
    }

    return Math.min(score, 10);
}


// ============================================================
// HELPER: Generate SWOT for a company
// ============================================================

function _compGenerateSWOT(metrics, moat, mgmtScore, allMetrics, sectorName) {
    var strengths = [];
    var weaknesses = [];
    var opportunities = [];
    var threats = (_COMP_SECTOR_THREATS[sectorName] || ['Macroeconomic uncertainty', 'Competitive pressure from new entrants', 'Regulatory changes']).slice();

    // Strengths
    if (moat.overall >= 4.0) strengths.push('Wide competitive moat with strong defensibility');
    if (moat.brandPower >= 4) strengths.push('Strong brand power reflected in premium gross margins');
    if (metrics.grossMargin !== null && metrics.grossMargin > 0.50) strengths.push('Industry-leading gross margin of ' + fmtPct(metrics.grossMargin * 100));
    if (metrics.revenueGrowthYoY !== null && metrics.revenueGrowthYoY > 0.10) strengths.push('Robust revenue growth of ' + fmtPct(metrics.revenueGrowthYoY * 100) + ' YoY');
    if (metrics.marketCap > 100e9) strengths.push('Dominant market position with ' + fmtBig(metrics.marketCap) + ' market cap');
    if (mgmtScore >= 7) strengths.push('High-quality management team (score: ' + mgmtScore + '/10)');
    if (metrics.roe !== null && metrics.roe > 0.20) strengths.push('Exceptional capital efficiency with ' + fmtPct(metrics.roe * 100) + ' ROE');

    // Weaknesses
    if (metrics.grossMargin !== null && metrics.grossMargin < 0.30) weaknesses.push('Below-average gross margins (' + fmtPct(metrics.grossMargin * 100) + ') limiting pricing power');
    if (metrics.revenueGrowthYoY !== null && metrics.revenueGrowthYoY < 0) weaknesses.push('Revenue decline of ' + fmtPct(metrics.revenueGrowthYoY * 100) + ' signals demand weakness');
    if (metrics.debtToEquity !== null && metrics.debtToEquity > 2.0) weaknesses.push('High leverage (D/E: ' + fmt(metrics.debtToEquity, 1) + 'x) constraining financial flexibility');
    if (moat.networkEffects <= 2) weaknesses.push('Limited network effects or scale economies');
    if (mgmtScore < 4) weaknesses.push('Below-average management quality score (' + mgmtScore + '/10)');
    if (metrics.operatingMargin !== null && metrics.operatingMargin < 0.10) weaknesses.push('Thin operating margins (' + fmtPct(metrics.operatingMargin * 100) + ') vulnerable to cost pressure');

    // Opportunities
    if (metrics.revenueGrowthYoY !== null && metrics.revenueGrowthYoY > 0.05) opportunities.push('Continued market share gains in growing addressable market');
    if (metrics.marketCap > 50e9) opportunities.push('Scale advantages to fund international expansion and M&A');
    if (metrics.operatingMargin !== null && metrics.grossMargin !== null && (metrics.grossMargin - metrics.operatingMargin) > 0.20) {
        opportunities.push('Significant margin expansion potential through operating leverage');
    }
    opportunities.push('Strategic investments in AI, automation, and digital transformation');

    // Ensure minimum 2 items per category
    if (strengths.length < 2) strengths.push('Established market presence and brand recognition');
    if (weaknesses.length < 2) weaknesses.push('Exposure to macroeconomic headwinds');
    if (opportunities.length < 2) opportunities.push('Expansion into adjacent markets and product lines');

    // Trim to max 4 per category
    strengths = strengths.slice(0, 4);
    weaknesses = weaknesses.slice(0, 4);
    opportunities = opportunities.slice(0, 4);
    threats = threats.slice(0, 4);

    return { strengths: strengths, weaknesses: weaknesses, opportunities: opportunities, threats: threats };
}


// ============================================================
// HELPER: Compute median of an array (ignoring nulls)
// ============================================================

function _compMedian(arr) {
    var valid = arr.filter(function (v) { return v !== null && v !== undefined && isFinite(v); });
    if (valid.length === 0) return null;
    valid.sort(function (a, b) { return a - b; });
    var mid = Math.floor(valid.length / 2);
    if (valid.length % 2 === 0) {
        return (valid[mid - 1] + valid[mid]) / 2;
    }
    return valid[mid];
}


// ============================================================
// MAIN ANALYSIS FUNCTION
// ============================================================

async function runCompetitiveAnalysis(symbol) {
    var output = document.getElementById('analysisOutput');
    output.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><br>Fetching data for ' +
        symbol + ' and identifying competitors...</div>';

    try {
        // -------------------------------------------------------
        // Step 1: Fetch target company data
        // -------------------------------------------------------
        var targetResults = await Promise.all([
            _compFetch(apiBaseURL + '/api/stock/' + symbol + '/details').catch(function () { return {}; }),
            _compFetch(apiBaseURL + '/api/stock/' + symbol + '/financials?limit=12').catch(function () { return {}; }),
            _compFetch(apiBaseURL + '/api/stock/' + symbol + '/comprehensive').catch(function () { return {}; })
        ]);

        var targetDetails = targetResults[0] || {};
        targetDetails.ticker = symbol;
        var targetFinancialsRes = targetResults[1];
        var targetComprehensive = targetResults[2] || {};

        var targetFinancials = targetFinancialsRes.financials || targetFinancialsRes || [];
        if (!Array.isArray(targetFinancials)) targetFinancials = [];

        // If comprehensive returned financials and we got nothing from direct call
        if (targetFinancials.length === 0 && targetComprehensive.financials) {
            targetFinancials = targetComprehensive.financials;
        }

        // Filter to quarterly
        var targetQuarterly = targetFinancials.filter(function (f) {
            return f.fiscalPeriod !== 'FY';
        });
        if (targetQuarterly.length === 0) targetQuarterly = targetFinancials;

        if (!targetQuarterly.length) {
            output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
                'No financial data available for <strong>' + symbol + '</strong>. ' +
                'This ticker may be an ETF or have no reported financials.</div>';
            return;
        }

        // Merge price from comprehensive if available
        if (targetComprehensive.quote) {
            var q = targetComprehensive.quote;
            if (!targetDetails.marketCap && q.marketCap) targetDetails.marketCap = q.marketCap;
        }

        // -------------------------------------------------------
        // Step 2: Determine sector
        // -------------------------------------------------------
        var gicsSector = null;

        // Try equityHoldings first
        if (typeof equityHoldings !== 'undefined') {
            for (var h = 0; h < equityHoldings.length; h++) {
                if (equityHoldings[h].symbol === symbol) {
                    gicsSector = equityHoldings[h].gicsSector;
                    break;
                }
            }
        }

        // Fallback: SIC description
        if (!gicsSector || gicsSector === 'N/A') {
            gicsSector = _compMatchSector(targetDetails.sicDescription || '');
        }

        // Fallback: SIC code ranges
        if (!gicsSector && targetDetails.sicCode) {
            var sic = parseInt(targetDetails.sicCode, 10);
            if ((sic >= 3570 && sic <= 3599) || (sic >= 7370 && sic <= 7379) || (sic >= 3670 && sic <= 3679)) {
                gicsSector = 'Information Technology';
            } else if (sic >= 6000 && sic <= 6799) {
                gicsSector = 'Financials';
            } else if ((sic >= 2000 && sic <= 2099) || (sic >= 5400 && sic <= 5499)) {
                gicsSector = 'Consumer Staples';
            } else if ((sic >= 2800 && sic <= 2899) || (sic >= 3841 && sic <= 3851)) {
                gicsSector = 'Health Care';
            } else if (sic >= 4900 && sic <= 4999) {
                gicsSector = 'Utilities';
            } else if ((sic >= 1300 && sic <= 1399) || (sic >= 2900 && sic <= 2999)) {
                gicsSector = 'Energy';
            } else if (sic >= 6500 && sic <= 6599) {
                gicsSector = 'Real Estate';
            } else if ((sic >= 3400 && sic <= 3599) || (sic >= 3700 && sic <= 3799)) {
                gicsSector = 'Industrials';
            } else if (sic >= 4800 && sic <= 4899) {
                gicsSector = 'Communication Services';
            }
        }

        // Ultimate fallback
        if (!gicsSector) gicsSector = 'Information Technology';

        // -------------------------------------------------------
        // Step 3: Select 5-7 competitor companies
        // -------------------------------------------------------
        var sectorList = SECTOR_COMPETITORS[gicsSector] || [];
        var compSymbols = [];
        for (var j = 0; j < sectorList.length; j++) {
            if (sectorList[j] !== symbol && compSymbols.indexOf(sectorList[j]) === -1) {
                compSymbols.push(sectorList[j]);
            }
            if (compSymbols.length >= 6) break;
        }

        output.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><br>Analyzing ' + symbol +
            ' against ' + compSymbols.length + ' competitors in ' + gicsSector + '...</div>';

        // -------------------------------------------------------
        // Step 4: Fetch competitor data in parallel
        // -------------------------------------------------------
        var compPromises = compSymbols.map(function (cs) {
            return Promise.all([
                _compFetch(apiBaseURL + '/api/stock/' + cs + '/details').catch(function () { return null; }),
                _compFetch(apiBaseURL + '/api/stock/' + cs + '/financials?limit=12').catch(function () { return null; })
            ]).then(function (results) {
                return { symbol: cs, details: results[0], financialsRes: results[1] };
            }).catch(function () {
                return { symbol: cs, details: null, financialsRes: null };
            });
        });

        var compResults = await Promise.all(compPromises);

        // -------------------------------------------------------
        // Step 5: Compute metrics for target + all competitors
        // -------------------------------------------------------
        var targetMetrics = _compComputeMetrics(targetDetails, targetQuarterly);
        targetMetrics.ticker = symbol;
        targetMetrics.name = targetDetails.name || symbol;

        var allCompanyMetrics = [targetMetrics]; // target is first

        for (var k = 0; k < compResults.length; k++) {
            var cr = compResults[k];
            if (!cr.details) continue;

            cr.details.ticker = cr.symbol;
            var compFin = [];
            if (cr.financialsRes) {
                compFin = cr.financialsRes.financials || cr.financialsRes || [];
                if (!Array.isArray(compFin)) compFin = [];
            }
            // Filter quarterly
            var compQ = compFin.filter(function (f) { return f.fiscalPeriod !== 'FY'; });
            if (compQ.length === 0) compQ = compFin;

            var compMetrics = _compComputeMetrics(cr.details, compQ);
            compMetrics.ticker = cr.symbol;
            compMetrics.name = cr.details.name || cr.symbol;

            if (compMetrics.valid) {
                allCompanyMetrics.push(compMetrics);
            }
        }

        // Need at least 3 successful competitors + target
        var competitorMetrics = allCompanyMetrics.filter(function (m) { return m.ticker !== symbol; });
        if (competitorMetrics.length < 3) {
            output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
                'Unable to find enough competitors with sufficient data for ' + symbol + '. Only ' +
                competitorMetrics.length + ' competitors returned valid data. Minimum 3 required.</div>';
            return;
        }

        // -------------------------------------------------------
        // Step 6: Compute moat scores
        // -------------------------------------------------------
        var sectorMedianOpMargin = _compMedian(allCompanyMetrics.map(function (m) { return m.operatingMargin; }));

        for (var m = 0; m < allCompanyMetrics.length; m++) {
            allCompanyMetrics[m].moat = _compComputeMoat(allCompanyMetrics[m], sectorMedianOpMargin);
            allCompanyMetrics[m].mgmtScore = _compManagementScore(allCompanyMetrics[m]);
        }

        // -------------------------------------------------------
        // Step 7: Market share analysis
        // -------------------------------------------------------
        var totalRevenue = allCompanyMetrics.reduce(function (s, c) { return s + c.ttmRevenue; }, 0);
        for (var m = 0; m < allCompanyMetrics.length; m++) {
            allCompanyMetrics[m].marketShare = totalRevenue > 0 ? (allCompanyMetrics[m].ttmRevenue / totalRevenue) : 0;
        }

        // -------------------------------------------------------
        // Step 8: Best stock pick — composite score
        // -------------------------------------------------------
        // Normalize scores to 0-1 for each dimension
        var maxMoat = Math.max.apply(null, allCompanyMetrics.map(function (c) { return c.moat.overall; }));
        var maxMgmt = Math.max.apply(null, allCompanyMetrics.map(function (c) { return c.mgmtScore; }));
        var maxGrowth = Math.max.apply(null, allCompanyMetrics.map(function (c) {
            return c.revenueGrowthYoY !== null ? c.revenueGrowthYoY : -1;
        }));
        var minGrowth = Math.min.apply(null, allCompanyMetrics.map(function (c) {
            return c.revenueGrowthYoY !== null ? c.revenueGrowthYoY : 1;
        }));

        // For valuation: inverse P/E (lower P/E = higher score). Collect valid PEs.
        var validPEs = allCompanyMetrics.filter(function (c) { return c.pe !== null && c.pe > 0; }).map(function (c) { return c.pe; });
        var maxPE = validPEs.length > 0 ? Math.max.apply(null, validPEs) : 30;
        var minPE = validPEs.length > 0 ? Math.min.apply(null, validPEs) : 5;

        for (var m = 0; m < allCompanyMetrics.length; m++) {
            var c = allCompanyMetrics[m];

            // Moat component (30%)
            var moatNorm = maxMoat > 0 ? c.moat.overall / maxMoat : 0;

            // Management component (25%)
            var mgmtNorm = maxMgmt > 0 ? c.mgmtScore / maxMgmt : 0;

            // Valuation component (25%) — inverse P/E normalized
            var valNorm = 0.5; // default if no P/E
            if (c.pe !== null && c.pe > 0 && maxPE > minPE) {
                valNorm = 1 - ((c.pe - minPE) / (maxPE - minPE));
                valNorm = Math.max(0, Math.min(1, valNorm));
            }

            // Growth component (20%)
            var growthNorm = 0.5;
            if (c.revenueGrowthYoY !== null && maxGrowth > minGrowth) {
                growthNorm = (c.revenueGrowthYoY - minGrowth) / (maxGrowth - minGrowth);
                growthNorm = Math.max(0, Math.min(1, growthNorm));
            }

            c.compositeScore = (moatNorm * 0.30 + mgmtNorm * 0.25 + valNorm * 0.25 + growthNorm * 0.20) * 100;
        }

        // Sort by composite score descending
        var ranked = allCompanyMetrics.slice().sort(function (a, b) { return b.compositeScore - a.compositeScore; });
        var winner = ranked[0];

        // -------------------------------------------------------
        // Step 9: Generate SWOT for top 2 companies by market cap
        // -------------------------------------------------------
        var byMarketCap = allCompanyMetrics.slice().sort(function (a, b) { return b.marketCap - a.marketCap; });
        var top2 = byMarketCap.slice(0, 2);
        var swotData = [];
        for (var s = 0; s < top2.length; s++) {
            swotData.push({
                company: top2[s],
                swot: _compGenerateSWOT(top2[s], top2[s].moat, top2[s].mgmtScore, allCompanyMetrics, gicsSector)
            });
        }

        // -------------------------------------------------------
        // Step 10: Generate catalysts for winner
        // -------------------------------------------------------
        var catalysts = [];
        if (winner.operatingMargin !== null && winner.grossMargin !== null && (winner.grossMargin - winner.operatingMargin) > 0.15) {
            catalysts.push('Margin expansion driven by operating leverage as fixed costs are amortized across growing revenue base');
        }
        if (winner.revenueGrowthYoY !== null && winner.revenueGrowthYoY > 0.05) {
            catalysts.push('Sustained market share gains in the ' + gicsSector + ' sector through competitive differentiation');
        }
        if (winner.moat.brandPower >= 4) {
            catalysts.push('Premium pricing power from strong brand positioning supports durable revenue growth');
        }
        if (winner.roe !== null && winner.roe > 0.15) {
            catalysts.push('Superior capital allocation with ' + fmtPct(winner.roe * 100) + ' ROE enabling value-accretive reinvestment');
        }
        if (winner.moat.networkEffects >= 4) {
            catalysts.push('Network effects and scale advantages creating a flywheel of increasing returns');
        }
        catalysts.push('Potential for strategic M&A or partnerships to accelerate growth trajectory');
        if (winner.debtToEquity !== null && winner.debtToEquity < 1.0) {
            catalysts.push('Strong balance sheet (D/E: ' + fmt(winner.debtToEquity, 1) + 'x) provides flexibility for shareholder returns');
        }
        catalysts = catalysts.slice(0, 5);

        // -------------------------------------------------------
        // Step 11: Build verdict rationale
        // -------------------------------------------------------
        var rationale = winner.name + ' ranks #1 with a composite score of ' + fmt(winner.compositeScore, 1) +
            '/100, driven by ';
        var reasons = [];
        if (winner.moat.overall >= 3.5) reasons.push('a ' + winner.moat.label.toLowerCase() + ' competitive moat');
        if (winner.mgmtScore >= 7) reasons.push('high management quality');
        if (winner.revenueGrowthYoY !== null && winner.revenueGrowthYoY > 0.10) reasons.push('strong revenue growth');
        if (winner.pe !== null && winner.pe < _compMedian(validPEs)) reasons.push('attractive valuation');
        if (reasons.length === 0) reasons.push('balanced performance across all categories');
        rationale += reasons.join(', ') + '.';

        // -------------------------------------------------------
        // Render
        // -------------------------------------------------------
        renderCompetitiveOutput(
            symbol, gicsSector, allCompanyMetrics, ranked, winner,
            swotData, catalysts, rationale, totalRevenue, targetMetrics
        );

        // -------------------------------------------------------
        // Store CSV data
        // -------------------------------------------------------
        var csvSections = [];

        // Section 1: Competitive Overview
        csvSections.push({
            title: 'Competitive Overview',
            type: 'metrics',
            rows: [
                { label: 'Target Company', value: symbol + ' - ' + targetMetrics.name },
                { label: 'Sector', value: gicsSector },
                { label: 'Companies Analyzed', formatted: String(allCompanyMetrics.length) },
                { label: 'Best Pick', value: winner.ticker + ' - ' + winner.name },
                { label: 'Composite Score', formatted: fmt(winner.compositeScore, 1) + '/100' },
                { label: 'Rationale', value: rationale }
            ]
        });

        // Section 2: Full Comparison Table
        csvSections.push({
            title: 'Full Competitive Comparison',
            type: 'table',
            headers: ['Ticker', 'Company', 'Market Cap', 'TTM Revenue', 'Op Margin', 'Net Margin', 'Rev Growth YoY', 'Moat Score', 'Moat Label', 'Mgmt Score', 'Composite'],
            rows: ranked.map(function (c) {
                return [
                    c.ticker, c.name, c.marketCap,
                    c.ttmRevenue,
                    c.operatingMargin !== null ? (c.operatingMargin * 100).toFixed(1) + '%' : 'N/A',
                    c.netMargin !== null ? (c.netMargin * 100).toFixed(1) + '%' : 'N/A',
                    c.revenueGrowthYoY !== null ? (c.revenueGrowthYoY * 100).toFixed(1) + '%' : 'N/A',
                    fmt(c.moat.overall, 1),
                    c.moat.label,
                    c.mgmtScore,
                    fmt(c.compositeScore, 1)
                ];
            })
        });

        // Section 3: Moat Scores
        csvSections.push({
            title: 'Moat Score Breakdown',
            type: 'table',
            headers: ['Ticker', 'Brand Power', 'Cost Advantage', 'Network Effects', 'Switching Costs', 'Overall', 'Label'],
            rows: allCompanyMetrics.map(function (c) {
                return [c.ticker, c.moat.brandPower, c.moat.costAdvantage, c.moat.networkEffects, c.moat.switchingCosts, fmt(c.moat.overall, 1), c.moat.label];
            })
        });

        // Section 4: Market Share
        csvSections.push({
            title: 'Market Share (Revenue)',
            type: 'table',
            headers: ['Ticker', 'TTM Revenue', 'Market Share %'],
            rows: allCompanyMetrics.map(function (c) {
                return [c.ticker, c.ttmRevenue, (c.marketShare * 100).toFixed(1) + '%'];
            })
        });

        // Section 5: SWOT Analysis
        for (var sw = 0; sw < swotData.length; sw++) {
            csvSections.push({
                title: 'SWOT Analysis - ' + swotData[sw].company.ticker,
                type: 'table',
                headers: ['Category', 'Item'],
                rows: [].concat(
                    swotData[sw].swot.strengths.map(function (s) { return ['Strength', s]; }),
                    swotData[sw].swot.weaknesses.map(function (w) { return ['Weakness', w]; }),
                    swotData[sw].swot.opportunities.map(function (o) { return ['Opportunity', o]; }),
                    swotData[sw].swot.threats.map(function (t) { return ['Threat', t]; })
                )
            });
        }

        // Section 6: Best Pick Rationale
        csvSections.push({
            title: 'Best Pick Rationale',
            type: 'metrics',
            rows: [
                { label: 'Recommended Stock', value: winner.ticker },
                { label: 'Company', value: winner.name },
                { label: 'Composite Score', formatted: fmt(winner.compositeScore, 1) + '/100' },
                { label: 'Moat', value: winner.moat.label + ' (' + fmt(winner.moat.overall, 1) + '/5)' },
                { label: 'Management Score', formatted: winner.mgmtScore + '/10' },
                { label: 'Rationale', value: rationale },
                { label: 'Key Catalysts', value: catalysts.join('; ') }
            ]
        });

        // Section 7: Raw Financial Data
        csvSections.push({
            title: 'Raw Financial Data',
            type: 'table',
            headers: ['Ticker', 'Market Cap', 'TTM Revenue', 'TTM Net Income', 'TTM Op Income', 'Gross Margin', 'Op Margin', 'Net Margin', 'ROE', 'ROA', 'D/E', 'Employees', 'Rev/Employee', 'P/E'],
            rows: allCompanyMetrics.map(function (c) {
                return [
                    c.ticker, c.marketCap, c.ttmRevenue, c.ttmNetIncome, c.ttmOperatingIncome,
                    c.grossMargin !== null ? c.grossMargin : '',
                    c.operatingMargin !== null ? c.operatingMargin : '',
                    c.netMargin !== null ? c.netMargin : '',
                    c.roe !== null ? c.roe : '',
                    c.roa !== null ? c.roa : '',
                    c.debtToEquity !== null ? c.debtToEquity : '',
                    c.employees,
                    c.revenuePerEmployee !== null ? c.revenuePerEmployee : '',
                    c.pe !== null ? c.pe : ''
                ];
            })
        });

        storeAnalysisData('competitive', {
            modelName: 'Bain & Company Competitive Strategy Analysis',
            firmStyle: 'Bain & Company',
            runDate: new Date().toISOString(),
            ticker: symbol,
            sections: csvSections
        });

    } catch (err) {
        console.error('Competitive Analysis Error:', err);
        output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>' +
            'Error running competitive analysis for ' + symbol + ': ' + err.message + '</div>';
    }
}


// ============================================================
// RENDER FUNCTION
// ============================================================

function renderCompetitiveOutput(
    symbol, gicsSector, allCompanies, ranked, winner,
    swotData, catalysts, rationale, totalRevenue, targetMetrics
) {
    var output = document.getElementById('analysisOutput');

    // Destroy previous chart instances
    var chartKeys = ['comp_marketshare', 'comp_moat'];
    for (var ci = 0; ci < chartKeys.length; ci++) {
        if (chartInstances[chartKeys[ci]]) {
            try { chartInstances[chartKeys[ci]].destroy(); } catch (e) {}
            delete chartInstances[chartKeys[ci]];
        }
    }

    // Helper: format margin or N/A
    function fmtMargin(val) {
        if (val === null || val === undefined || !isFinite(val)) return '<span style="opacity:0.4;">N/A</span>';
        var color = val > 0.20 ? '#28a745' : val > 0.10 ? '#6fcf8b' : val > 0 ? '#ffc107' : '#dc3545';
        return '<span style="color:' + color + ';font-weight:600;">' + fmtPct(val * 100) + '</span>';
    }

    function fmtGrowth(val) {
        if (val === null || val === undefined || !isFinite(val)) return '<span style="opacity:0.4;">N/A</span>';
        var color = val > 0.10 ? '#28a745' : val > 0 ? '#6fcf8b' : '#dc3545';
        var arrow = val > 0 ? ' &#8593;' : ' &#8595;';
        return '<span style="color:' + color + ';font-weight:600;">' + fmtPct(val * 100) + arrow + '</span>';
    }

    function fmtMoatBadge(label) {
        var bg, color;
        if (label === 'Wide') { bg = 'rgba(40,167,69,0.15)'; color = '#28a745'; }
        else if (label === 'Narrow') { bg = 'rgba(255,193,7,0.15)'; color = '#ffc107'; }
        else { bg = 'rgba(220,53,69,0.15)'; color = '#dc3545'; }
        return '<span style="background:' + bg + ';color:' + color + ';padding:0.15rem 0.6rem;border-radius:8px;font-size:0.75rem;font-weight:700;">' + label + '</span>';
    }

    var html = '';

    // -------------------------------------------------------
    // CARD 1: Best-in-Class Pick (span-2)
    // -------------------------------------------------------
    var winnerIsTarget = (winner.ticker === symbol);
    var pickColor = winnerIsTarget ? '#febc11' : '#28a745';
    html += '<div class="result-card span-2 verdict-card">' +
        '<div class="verdict-badge undervalued" style="font-size:1.6rem;letter-spacing:2px;">BEST-IN-CLASS PICK</div>' +
        '<div style="margin-top:0.75rem;font-size:1.8rem;font-weight:800;color:' + pickColor + ';">' +
            winner.name + ' <span style="font-size:1.2rem;opacity:0.7;">(' + winner.ticker + ')</span></div>' +
        '<div style="font-size:1.1rem;margin-top:0.3rem;">Composite Score: <strong style="color:#febc11;">' +
            fmt(winner.compositeScore, 1) + '/100</strong></div>' +
        '<div style="font-size:0.9rem;opacity:0.7;margin-top:0.5rem;max-width:700px;margin-left:auto;margin-right:auto;line-height:1.5;">' +
            rationale + '</div>' +
        '</div>';

    // -------------------------------------------------------
    // CARD 2: Competitive Landscape Table (span-2)
    // -------------------------------------------------------
    html += '<div class="result-card span-2">' +
        '<h3><i class="fas fa-table"></i> Competitive Landscape</h3>' +
        '<div style="overflow-x:auto;">' +
        '<table class="val-table">' +
        '<thead><tr>' +
            '<th>Ticker</th><th>Company</th><th>Market Cap</th><th>Revenue</th>' +
            '<th>Op Margin</th><th>Net Margin</th><th>Rev Growth</th>' +
            '<th>Moat</th><th>Mgmt</th><th>Score</th>' +
        '</tr></thead><tbody>';

    for (var r = 0; r < ranked.length; r++) {
        var rc = ranked[r];
        var isTarget = (rc.ticker === symbol);
        var isWinner = (rc.ticker === winner.ticker);
        var rowStyle = '';
        if (isTarget && isWinner) {
            rowStyle = 'background:rgba(254,188,17,0.08);border-left:3px solid #febc11;';
        } else if (isTarget) {
            rowStyle = 'background:rgba(254,188,17,0.06);border-left:3px solid #febc11;';
        } else if (isWinner) {
            rowStyle = 'background:rgba(40,167,69,0.06);border-left:3px solid #28a745;';
        }

        var tickerStyle = isTarget ? 'color:#febc11;font-weight:700;' : (isWinner ? 'color:#28a745;font-weight:700;' : '');

        html += '<tr style="' + rowStyle + '">' +
            '<td style="' + tickerStyle + '">' + rc.ticker +
                (isTarget ? ' <span style="font-size:0.65rem;opacity:0.6;">TARGET</span>' : '') +
                (isWinner ? ' <span style="font-size:0.65rem;color:#28a745;">&#9733;</span>' : '') +
            '</td>' +
            '<td>' + rc.name + '</td>' +
            '<td>' + fmtBig(rc.marketCap) + '</td>' +
            '<td>' + fmtBig(rc.ttmRevenue) + '</td>' +
            '<td>' + fmtMargin(rc.operatingMargin) + '</td>' +
            '<td>' + fmtMargin(rc.netMargin) + '</td>' +
            '<td>' + fmtGrowth(rc.revenueGrowthYoY) + '</td>' +
            '<td>' + fmtMoatBadge(rc.moat.label) + ' <span style="opacity:0.5;font-size:0.75rem;">' + fmt(rc.moat.overall, 1) + '</span></td>' +
            '<td style="font-weight:600;">' + rc.mgmtScore + '<span style="opacity:0.4;">/10</span></td>' +
            '<td class="highlight" style="font-weight:700;">' + fmt(rc.compositeScore, 1) + '</td>' +
            '</tr>';
    }

    html += '</tbody></table></div></div>';

    // -------------------------------------------------------
    // CARD 3: Market Share Chart
    // -------------------------------------------------------
    html += '<div class="result-card">' +
        '<h3><i class="fas fa-chart-bar"></i> Market Share (Revenue)</h3>' +
        '<div class="chart-box" style="height:' + Math.max(200, allCompanies.length * 38) + 'px;">' +
            '<canvas id="compMarketShareChart"></canvas>' +
        '</div></div>';

    // -------------------------------------------------------
    // CARD 4: Moat Comparison Chart
    // -------------------------------------------------------
    html += '<div class="result-card">' +
        '<h3><i class="fas fa-shield-alt"></i> Moat Score Comparison</h3>' +
        '<div class="chart-box" style="height:' + Math.max(220, allCompanies.length * 40) + 'px;">' +
            '<canvas id="compMoatChart"></canvas>' +
        '</div></div>';

    // -------------------------------------------------------
    // CARD 5: SWOT Analysis (span-2)
    // -------------------------------------------------------
    html += '<div class="result-card span-2">' +
        '<h3><i class="fas fa-th-large"></i> SWOT Analysis &mdash; Top Companies by Market Cap</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">';

    for (var sw = 0; sw < swotData.length; sw++) {
        var sd = swotData[sw];
        html += '<div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:1rem;border:1px solid rgba(255,255,255,0.06);">' +
            '<div style="text-align:center;margin-bottom:0.75rem;font-weight:700;color:#febc11;font-size:1rem;">' +
                sd.company.ticker + ' &mdash; ' + sd.company.name + '</div>';

        // Strengths
        html += '<div style="margin-bottom:0.75rem;">' +
            '<div style="font-weight:700;color:#28a745;font-size:0.85rem;margin-bottom:0.3rem;"><i class="fas fa-arrow-up"></i> Strengths</div>' +
            '<ul style="margin:0;padding-left:1.2rem;font-size:0.8rem;line-height:1.6;color:#e5e5e5;">';
        for (var si = 0; si < sd.swot.strengths.length; si++) {
            html += '<li>' + sd.swot.strengths[si] + '</li>';
        }
        html += '</ul></div>';

        // Weaknesses
        html += '<div style="margin-bottom:0.75rem;">' +
            '<div style="font-weight:700;color:#dc3545;font-size:0.85rem;margin-bottom:0.3rem;"><i class="fas fa-arrow-down"></i> Weaknesses</div>' +
            '<ul style="margin:0;padding-left:1.2rem;font-size:0.8rem;line-height:1.6;color:#e5e5e5;">';
        for (var wi = 0; wi < sd.swot.weaknesses.length; wi++) {
            html += '<li>' + sd.swot.weaknesses[wi] + '</li>';
        }
        html += '</ul></div>';

        // Opportunities
        html += '<div style="margin-bottom:0.75rem;">' +
            '<div style="font-weight:700;color:#4dabf7;font-size:0.85rem;margin-bottom:0.3rem;"><i class="fas fa-lightbulb"></i> Opportunities</div>' +
            '<ul style="margin:0;padding-left:1.2rem;font-size:0.8rem;line-height:1.6;color:#e5e5e5;">';
        for (var oi = 0; oi < sd.swot.opportunities.length; oi++) {
            html += '<li>' + sd.swot.opportunities[oi] + '</li>';
        }
        html += '</ul></div>';

        // Threats
        html += '<div>' +
            '<div style="font-weight:700;color:#fd7e14;font-size:0.85rem;margin-bottom:0.3rem;"><i class="fas fa-exclamation-triangle"></i> Threats</div>' +
            '<ul style="margin:0;padding-left:1.2rem;font-size:0.8rem;line-height:1.6;color:#e5e5e5;">';
        for (var ti = 0; ti < sd.swot.threats.length; ti++) {
            html += '<li>' + sd.swot.threats[ti] + '</li>';
        }
        html += '</ul></div>';

        html += '</div>'; // close SWOT card for this company
    }

    html += '</div></div>'; // close grid + card

    // -------------------------------------------------------
    // CARD 6: Key Catalysts
    // -------------------------------------------------------
    html += '<div class="result-card">' +
        '<h3><i class="fas fa-rocket"></i> Key Catalysts for ' + winner.ticker + '</h3>' +
        '<div style="display:flex;flex-direction:column;gap:0.6rem;">';

    var catalystIcons = ['<i class="fas fa-chart-line" style="color:#28a745;"></i>',
        '<i class="fas fa-trophy" style="color:#febc11;"></i>',
        '<i class="fas fa-star" style="color:#4dabf7;"></i>',
        '<i class="fas fa-bolt" style="color:#fd7e14;"></i>',
        '<i class="fas fa-gem" style="color:#e83e8c;"></i>'];

    for (var cat = 0; cat < catalysts.length; cat++) {
        var icon = catalystIcons[cat % catalystIcons.length];
        html += '<div style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.5rem 0.75rem;' +
            'background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.05);">' +
            '<span style="flex-shrink:0;margin-top:2px;">' + icon + '</span>' +
            '<span style="font-size:0.85rem;color:#e5e5e5;line-height:1.5;">' + catalysts[cat] + '</span></div>';
    }

    html += '</div></div>';

    // -------------------------------------------------------
    // CARD 7: Methodology & Assumptions (span-2)
    // -------------------------------------------------------
    html += '<div class="result-card span-2">' +
        '<div class="assumptions-box" style="margin:0;">' +
        '<h4><i class="fas fa-info-circle"></i> Methodology & Assumptions</h4>' +
        '<ul>' +
            '<li>Analysis inspired by Bain & Company competitive strategy frameworks: moat analysis, market positioning, and management quality assessment.</li>' +
            '<li>TTM (Trailing Twelve Months) financials computed from up to 4 most recent quarterly filings, annualized if fewer quarters available.</li>' +
            '<li>R&D proxy approximated as Gross Profit minus Operating Income (captures SGA + R&D combined, not pure R&D).</li>' +
            '<li>Moat scoring (1-5 per category): Brand Power (gross margin tiers), Cost Advantage (operating margin vs sector median), ' +
                'Network Effects (revenue per employee), Switching Costs (growth stability + scale). Overall moat is the average.</li>' +
            '<li>Management Quality Score (0-10) based on ROE, operating margin, revenue growth, debt management, and efficiency metrics.</li>' +
            '<li>Composite Score weighting: 30% Moat + 25% Management + 25% Valuation (inverse P/E) + 20% Revenue Growth.</li>' +
            '<li>Market share calculated as company revenue relative to the sum of all analyzed competitors — represents relative share within this peer group only, not total addressable market.</li>' +
            '<li>SWOT analysis auto-generated from quantitative metrics. Threats are sector-specific qualitative factors.</li>' +
            '<li>Revenue Growth YoY computed from 8 quarters where available; approximate from available data otherwise.</li>' +
        '</ul>' +
        '</div></div>';

    // -------------------------------------------------------
    // CARD 8: Download CSV
    // -------------------------------------------------------
    html += '<button class="run-btn" onclick="downloadModelCSV(\'competitive\')" ' +
        'style="margin-top:1rem;background:linear-gradient(135deg,#28a745,#20c997);width:100%;">' +
        '<i class="fas fa-download"></i> Download Competitive Analysis CSV</button>';

    output.innerHTML = html;

    // -------------------------------------------------------
    // Render Charts
    // -------------------------------------------------------
    setTimeout(function () {
        _renderCompMarketShareChart(allCompanies, symbol, winner.ticker);
        _renderCompMoatChart(allCompanies, symbol, winner.ticker);
    }, 100);
}


// ============================================================
// CHART: Market Share (Horizontal Bar)
// ============================================================

function _renderCompMarketShareChart(companies, targetTicker, winnerTicker) {
    var canvas = document.getElementById('compMarketShareChart');
    if (!canvas) return;

    if (chartInstances['comp_marketshare']) {
        try { chartInstances['comp_marketshare'].destroy(); } catch (e) {}
    }

    // Sort by market share descending
    var sorted = companies.slice().sort(function (a, b) { return b.marketShare - a.marketShare; });

    var labels = sorted.map(function (c) { return c.ticker; });
    var data = sorted.map(function (c) { return +(c.marketShare * 100).toFixed(1); });
    var bgColors = sorted.map(function (c) {
        if (c.ticker === targetTicker) return 'rgba(254,188,17,0.7)';
        if (c.ticker === winnerTicker) return 'rgba(40,167,69,0.7)';
        return 'rgba(77,171,247,0.5)';
    });
    var borderColors = sorted.map(function (c) {
        if (c.ticker === targetTicker) return '#febc11';
        if (c.ticker === winnerTicker) return '#28a745';
        return '#4dabf7';
    });

    chartInstances['comp_marketshare'] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Revenue Share (%)',
                data: data,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1,
                barPercentage: 0.7,
                categoryPercentage: 0.85
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,20,25,0.9)',
                    titleColor: '#febc11',
                    bodyColor: '#e5e5e5',
                    borderColor: 'rgba(254,188,17,0.3)',
                    borderWidth: 1,
                    callbacks: {
                        label: function (ctx) {
                            return ctx.raw.toFixed(1) + '% of group revenue';
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#aaa',
                        callback: function (v) { return v + '%'; }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    title: {
                        display: true,
                        text: 'Revenue Share (%)',
                        color: 'rgba(255,255,255,0.5)',
                        font: { size: 11 }
                    }
                },
                y: {
                    ticks: {
                        color: function (ctx) {
                            var label = ctx.tick.label;
                            if (label === targetTicker) return '#febc11';
                            if (label === winnerTicker) return '#28a745';
                            return '#e5e5e5';
                        },
                        font: { size: 11, weight: '600' }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}


// ============================================================
// CHART: Moat Score Comparison (Grouped Horizontal Bar)
// ============================================================

function _renderCompMoatChart(companies, targetTicker, winnerTicker) {
    var canvas = document.getElementById('compMoatChart');
    if (!canvas) return;

    if (chartInstances['comp_moat']) {
        try { chartInstances['comp_moat'].destroy(); } catch (e) {}
    }

    // Sort by overall moat descending
    var sorted = companies.slice().sort(function (a, b) { return b.moat.overall - a.moat.overall; });

    var labels = sorted.map(function (c) { return c.ticker; });

    chartInstances['comp_moat'] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Brand Power',
                    data: sorted.map(function (c) { return c.moat.brandPower; }),
                    backgroundColor: 'rgba(254,188,17,0.6)',
                    borderColor: '#febc11',
                    borderWidth: 1
                },
                {
                    label: 'Cost Advantage',
                    data: sorted.map(function (c) { return c.moat.costAdvantage; }),
                    backgroundColor: 'rgba(40,167,69,0.6)',
                    borderColor: '#28a745',
                    borderWidth: 1
                },
                {
                    label: 'Network Effects',
                    data: sorted.map(function (c) { return c.moat.networkEffects; }),
                    backgroundColor: 'rgba(77,171,247,0.6)',
                    borderColor: '#4dabf7',
                    borderWidth: 1
                },
                {
                    label: 'Switching Costs',
                    data: sorted.map(function (c) { return c.moat.switchingCosts; }),
                    backgroundColor: 'rgba(232,62,140,0.6)',
                    borderColor: '#e83e8c',
                    borderWidth: 1
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#e5e5e5',
                        boxWidth: 12,
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,20,25,0.9)',
                    titleColor: '#febc11',
                    bodyColor: '#e5e5e5',
                    borderColor: 'rgba(254,188,17,0.3)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    min: 0,
                    max: 5,
                    ticks: {
                        color: '#aaa',
                        stepSize: 1
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    title: {
                        display: true,
                        text: 'Score (1-5)',
                        color: 'rgba(255,255,255,0.5)',
                        font: { size: 11 }
                    }
                },
                y: {
                    ticks: {
                        color: function (ctx) {
                            var label = ctx.tick.label;
                            if (label === targetTicker) return '#febc11';
                            if (label === winnerTicker) return '#28a745';
                            return '#e5e5e5';
                        },
                        font: { size: 11, weight: '600' }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}
