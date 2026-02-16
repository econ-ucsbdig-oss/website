/**
 * val-macro.js
 * Macro Sensitivity Analysis (Bridgewater Style)
 * Loaded via <script> tag in valuation.html -- all functions are globally accessible.
 *
 * Dependencies available from valuation.html:
 *   fmt(n, dec), fmtCur(n), fmtBig(n), fmtPct(n), clamp(v, lo, hi)
 *   apiBaseURL, cachedFetch(url), chartInstances, storeAnalysisData(), downloadModelCSV()
 *   equityHoldings - array of {symbol, description, gicsSector, quantity, lastPrice}
 *   Chart.js available globally
 *
 * API endpoint:
 *   GET {apiBaseURL}/api/stock/{symbol}/analytics -> { analytics: { beta, volatility, ... } }
 */

// ============================================================
// MACRO SENSITIVITY COEFFICIENTS (Research-Based)
// ============================================================

// Sensitivity coefficients: -2 (very negative) to +2 (very positive)
// Represents how a sector responds to each macro factor INCREASING
const MACRO_SENSITIVITIES = {
    interestRates: {
        'Financials': 1.5, 'Information Technology': -1, 'Consumer Discretionary': -1.5,
        'Real Estate': -2, 'Utilities': -1.5, 'Health Care': -0.5, 'Consumer Staples': -0.5,
        'Communication Services': -1, 'Industrials': 0, 'Energy': 0.5, 'Materials': 0
    },
    inflation: {
        'Energy': 2, 'Materials': 1.5, 'Financials': 0.5, 'Consumer Staples': -0.5,
        'Consumer Discretionary': -1.5, 'Information Technology': -1, 'Utilities': -1,
        'Health Care': -0.5, 'Communication Services': -1, 'Industrials': 0.5, 'Real Estate': -1
    },
    gdpGrowth: {
        'Consumer Discretionary': 2, 'Industrials': 1.5, 'Information Technology': 1.5,
        'Financials': 1, 'Materials': 1, 'Communication Services': 1,
        'Energy': 1, 'Health Care': 0, 'Consumer Staples': -0.5, 'Utilities': -1, 'Real Estate': 0.5
    },
    usdStrength: {
        'Information Technology': -1, 'Materials': -1.5, 'Energy': -1,
        'Industrials': -0.5, 'Consumer Staples': -0.5, 'Health Care': -0.5,
        'Financials': 0.5, 'Consumer Discretionary': 0, 'Communication Services': 0,
        'Utilities': 0.5, 'Real Estate': 0.5
    },
    commodityPrices: {
        'Energy': 2, 'Materials': 2, 'Industrials': 0.5,
        'Consumer Staples': -1, 'Consumer Discretionary': -1.5,
        'Information Technology': 0, 'Financials': 0, 'Health Care': 0,
        'Communication Services': 0, 'Utilities': -0.5, 'Real Estate': 0
    }
};

// Special international exposure adjustment (extra USD sensitivity)
const INTERNATIONAL_TICKERS = ['TSM', 'ASML', 'FLUT', 'NVO'];

const MACRO_FACTOR_LABELS = {
    interestRates: { name: 'Interest Rates', icon: '\ud83d\udcc8', unit: 'bps' },
    inflation:     { name: 'Inflation',      icon: '\ud83d\udcb0', unit: '%' },
    gdpGrowth:     { name: 'GDP Growth',     icon: '\ud83c\udfed', unit: '%' },
    usdStrength:   { name: 'USD Strength',   icon: '\ud83d\udcb5', unit: '%' },
    commodityPrices: { name: 'Commodity Prices', icon: '\u26cf\ufe0f', unit: '%' }
};


// ============================================================
// MACRO SCENARIO DEFINITIONS
// ============================================================

const MACRO_SCENARIOS = {
    bull: {
        name: 'Bull Case \u2014 Goldilocks',
        description: 'Strong growth, moderate inflation, easing rates',
        assumptions: { interestRates: -0.5, inflation: -0.3, gdpGrowth: 1.5, usdStrength: 0, commodityPrices: 0.5 }
    },
    base: {
        name: 'Base Case \u2014 Steady State',
        description: 'Moderate growth, stable inflation, rates on hold',
        assumptions: { interestRates: 0, inflation: 0, gdpGrowth: 0, usdStrength: 0, commodityPrices: 0 }
    },
    bear: {
        name: 'Bear Case \u2014 Recession',
        description: 'Contraction, rising rates, strong dollar',
        assumptions: { interestRates: 1.0, inflation: 0.5, gdpGrowth: -2.0, usdStrength: 1.0, commodityPrices: -1.0 }
    },
    stagflation: {
        name: 'Stagflation',
        description: 'Low growth, high inflation, rising rates',
        assumptions: { interestRates: 1.5, inflation: 2.0, gdpGrowth: -1.0, usdStrength: 0, commodityPrices: 1.5 }
    }
};


// ============================================================
// MAIN ANALYSIS FUNCTION
// ============================================================

async function runMacroSensitivity(overrides) {
    overrides = overrides || {};
    var output = document.getElementById('analysisOutput');
    var holdings = equityHoldings.slice(); // shallow copy
    var N = holdings.length;

    output.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><br>Analyzing macro sensitivity across ' + N + ' holdings...</div>';

    try {
        // -----------------------------------------------------------
        // 1) Fetch analytics (for beta) in batched waves of 5
        // -----------------------------------------------------------
        var fetchFn = typeof cachedFetch === 'function' ? cachedFetch : function(url) {
            return fetch(url).then(function(r) { return r.json(); });
        };

        var analyticsMap = {};
        var batchSize = 5;
        for (var batchStart = 0; batchStart < N; batchStart += batchSize) {
            var batch = holdings.slice(batchStart, batchStart + batchSize);
            var batchResults = await Promise.all(
                batch.map(function(h) {
                    return fetchFn(apiBaseURL + '/api/stock/' + h.symbol + '/analytics')
                        .catch(function() { return {}; });
                })
            );
            batch.forEach(function(h, i) {
                var res = batchResults[i] || {};
                analyticsMap[h.symbol] = res.analytics || res || {};
            });
            // Small delay between batches to avoid rate limiting
            if (batchStart + batchSize < N) {
                await new Promise(function(resolve) { setTimeout(resolve, 200); });
            }
        }

        // -----------------------------------------------------------
        // 2) Compute per-holding sensitivities
        // -----------------------------------------------------------
        // Check for sector concentration
        var sectorCounts = {};
        holdings.forEach(function(h) {
            var sector = h.gicsSector || 'Information Technology';
            sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
        });
        var uniqueSectors = Object.keys(sectorCounts).length;
        var concentrationWarning = (uniqueSectors === 1)
            ? 'All holdings are in the ' + Object.keys(sectorCounts)[0] + ' sector. Concentration risk amplifies macro exposure significantly.'
            : null;

        // Compute average sensitivities across all sectors (for unknown sector fallback)
        var avgSensitivities = {};
        for (var factor in MACRO_SENSITIVITIES) {
            var coeffs = MACRO_SENSITIVITIES[factor];
            var vals = Object.values(coeffs);
            avgSensitivities[factor] = vals.reduce(function(s, v) { return s + v; }, 0) / vals.length;
        }

        holdings.forEach(function(h) {
            var sector = h.gicsSector || 'Information Technology';
            var beta = analyticsMap[h.symbol] ? (analyticsMap[h.symbol].beta || 1.0) : 1.0;
            var betaAdj = 0.5 + 0.5 * clamp(beta, 0.5, 2.0); // beta amplifier: 0.75 to 1.5

            h.beta = beta;
            h.betaAdj = betaAdj;
            h.sensitivities = {};

            for (var factorKey in MACRO_SENSITIVITIES) {
                var sectorCoeffs = MACRO_SENSITIVITIES[factorKey];
                var baseSensitivity = sectorCoeffs[sector];
                // If sector is unknown, use average
                if (baseSensitivity === undefined) {
                    baseSensitivity = avgSensitivities[factorKey];
                }
                var sensitivity = baseSensitivity * betaAdj;
                // International exposure adjustment
                if (factorKey === 'usdStrength' && INTERNATIONAL_TICKERS.indexOf(h.symbol) !== -1) {
                    sensitivity -= 0.5;
                }
                h.sensitivities[factorKey] = clamp(sensitivity, -3, 3);
            }
        });

        // -----------------------------------------------------------
        // 3) Compute portfolio-level sensitivities
        // -----------------------------------------------------------
        var totalValue = holdings.reduce(function(s, h) { return s + h.quantity * h.lastPrice; }, 0);
        var portfolioSensitivities = {};

        for (var factorKey in MACRO_SENSITIVITIES) {
            portfolioSensitivities[factorKey] = holdings.reduce(function(s, h) {
                var weight = (h.quantity * h.lastPrice) / totalValue;
                return s + weight * h.sensitivities[factorKey];
            }, 0);
        }

        // -----------------------------------------------------------
        // 4) Compute scenario impacts (including custom scenario if provided)
        // -----------------------------------------------------------
        // Build combined scenarios: the 4 defaults + optional custom
        var allScenarios = {};
        for (var sKey in MACRO_SCENARIOS) {
            allScenarios[sKey] = MACRO_SCENARIOS[sKey];
        }

        // Check for custom scenario from overrides
        var hasCustomScenario = false;
        if (overrides.customRates != null || overrides.customInflation != null ||
            overrides.customGDP != null || overrides.customUSD != null ||
            overrides.customCommodity != null) {
            hasCustomScenario = true;
            var customName = overrides.customScenarioName || 'Custom Scenario';
            allScenarios['custom'] = {
                name: customName,
                description: 'User-defined macro scenario',
                assumptions: {
                    interestRates:   overrides.customRates     != null ? overrides.customRates     : 0,
                    inflation:       overrides.customInflation  != null ? overrides.customInflation  : 0,
                    gdpGrowth:       overrides.customGDP        != null ? overrides.customGDP        : 0,
                    usdStrength:     overrides.customUSD        != null ? overrides.customUSD        : 0,
                    commodityPrices: overrides.customCommodity  != null ? overrides.customCommodity  : 0
                }
            };
        }

        var scenarioResults = {};
        for (var scenarioId in allScenarios) {
            var scenario = allScenarios[scenarioId];
            var totalImpact = 0;
            var factorImpacts = {};

            for (var factorKey in scenario.assumptions) {
                var change = scenario.assumptions[factorKey];
                var impact = portfolioSensitivities[factorKey] * change;
                factorImpacts[factorKey] = impact;
                totalImpact += impact;
            }

            scenarioResults[scenarioId] = {
                name: scenario.name,
                description: scenario.description,
                assumptions: scenario.assumptions,
                factorImpacts: factorImpacts,
                totalImpact: totalImpact * 3 // scale to approximate % portfolio impact
            };
        }

        // -----------------------------------------------------------
        // 5) Identify dominant exposures and hedging recommendations
        // -----------------------------------------------------------
        var sortedFactors = Object.entries(portfolioSensitivities)
            .sort(function(a, b) { return Math.abs(b[1]) - Math.abs(a[1]); });

        var hedgingRecs = [];

        // Interest rate sensitivity
        if (Math.abs(portfolioSensitivities.interestRates) > 0.5) {
            if (portfolioSensitivities.interestRates < 0) {
                hedgingRecs.push({
                    factor: 'Interest Rates',
                    recommendation: 'Consider adding financial sector exposure (XLF) or short-duration bonds (SHV) to hedge rate sensitivity.',
                    severity: 'medium'
                });
            } else {
                hedgingRecs.push({
                    factor: 'Interest Rates',
                    recommendation: 'Portfolio benefits from rising rates. Risk: rate cuts could underperform. Consider adding rate-sensitive sectors (REITs, Utilities) for balance.',
                    severity: 'low'
                });
            }
        }

        // USD strength sensitivity
        if (portfolioSensitivities.usdStrength < -0.5) {
            hedgingRecs.push({
                factor: 'USD Strength',
                recommendation: 'Significant international revenue exposure. Consider UUP (US Dollar Index ETF) or reducing international holdings to hedge currency risk.',
                severity: 'medium'
            });
        }

        // Commodity sensitivity
        if (portfolioSensitivities.commodityPrices > 0.5) {
            hedgingRecs.push({
                factor: 'Commodity Prices',
                recommendation: 'Portfolio positively exposed to commodities. Consider put options on commodity ETFs (DBC) for downside protection.',
                severity: 'low'
            });
        }

        // Inflation sensitivity
        if (portfolioSensitivities.inflation > 0.5) {
            hedgingRecs.push({
                factor: 'Inflation',
                recommendation: 'Consider TIPS (TIP) or inflation-hedged equity strategies.',
                severity: 'low'
            });
        }

        // GDP growth sensitivity
        if (portfolioSensitivities.gdpGrowth > 0.8) {
            hedgingRecs.push({
                factor: 'GDP Growth',
                recommendation: 'Portfolio is cyclically exposed. Add defensive sectors (XLP, XLU) or low-beta equities for recession protection.',
                severity: 'high'
            });
        }

        // If no significant exposures
        if (hedgingRecs.length === 0) {
            hedgingRecs.push({
                factor: 'General',
                recommendation: 'Portfolio shows balanced macro exposure. No significant hedging action required.',
                severity: 'low'
            });
        }

        // -----------------------------------------------------------
        // 6) Render output
        // -----------------------------------------------------------
        renderMacroOutput(holdings, portfolioSensitivities, scenarioResults, hedgingRecs, sortedFactors, totalValue, concentrationWarning);

        // -----------------------------------------------------------
        // 7) Store CSV data
        // -----------------------------------------------------------
        var csvSections = [
            {
                title: 'Portfolio Macro Sensitivities',
                type: 'table',
                headers: ['Factor', 'Sensitivity', 'Direction'],
                rows: sortedFactors.map(function(entry) {
                    var factorKey = entry[0];
                    var val = entry[1];
                    var label = MACRO_FACTOR_LABELS[factorKey] ? MACRO_FACTOR_LABELS[factorKey].name : factorKey;
                    return [label, fmt(val, 3), val > 0.1 ? 'Positive' : val < -0.1 ? 'Negative' : 'Neutral'];
                })
            },
            {
                title: 'Scenario Analysis',
                type: 'table',
                headers: ['Scenario', 'GDP', 'Inflation', 'Int Rates', 'USD', 'Commodities', 'Portfolio Impact %'],
                rows: Object.keys(scenarioResults).map(function(id) {
                    var sc = scenarioResults[id];
                    return [
                        sc.name,
                        fmt(sc.assumptions.gdpGrowth, 1),
                        fmt(sc.assumptions.inflation, 1),
                        fmt(sc.assumptions.interestRates, 1),
                        fmt(sc.assumptions.usdStrength, 1),
                        fmt(sc.assumptions.commodityPrices, 1),
                        fmt(sc.totalImpact, 2) + '%'
                    ];
                })
            },
            {
                title: 'Holding-Level Sensitivities',
                type: 'table',
                headers: ['Symbol', 'Description', 'Sector', 'Weight %', 'Beta', 'Int Rates', 'Inflation', 'GDP', 'USD', 'Commodities'],
                rows: holdings
                    .sort(function(a, b) { return (b.quantity * b.lastPrice) - (a.quantity * a.lastPrice); })
                    .map(function(h) {
                        var w = (h.quantity * h.lastPrice) / totalValue * 100;
                        return [
                            h.symbol, h.description, h.gicsSector || 'N/A',
                            fmt(w, 1), fmt(h.beta, 2),
                            fmt(h.sensitivities.interestRates, 2),
                            fmt(h.sensitivities.inflation, 2),
                            fmt(h.sensitivities.gdpGrowth, 2),
                            fmt(h.sensitivities.usdStrength, 2),
                            fmt(h.sensitivities.commodityPrices, 2)
                        ];
                    })
            },
            {
                title: 'Hedging Recommendations',
                type: 'table',
                headers: ['Factor', 'Severity', 'Recommendation'],
                rows: hedgingRecs.map(function(r) {
                    return [r.factor, r.severity.toUpperCase(), r.recommendation];
                })
            },
            {
                title: 'Raw Financial Data — Sector Sensitivity Coefficients',
                type: 'table',
                headers: ['Sector', 'Interest Rates', 'Inflation', 'GDP Growth', 'USD Strength', 'Commodity Prices'],
                rows: Object.keys(MACRO_SENSITIVITIES.interestRates).map(function(sector) {
                    return [
                        sector,
                        MACRO_SENSITIVITIES.interestRates[sector],
                        MACRO_SENSITIVITIES.inflation[sector],
                        MACRO_SENSITIVITIES.gdpGrowth[sector],
                        MACRO_SENSITIVITIES.usdStrength[sector],
                        MACRO_SENSITIVITIES.commodityPrices[sector]
                    ];
                })
            },
            {
                title: 'Raw Financial Data — Per-Holding',
                type: 'table',
                headers: ['Symbol', 'Sector', 'Beta', 'Weight'],
                rows: holdings.map(function(h) {
                    var w = totalValue > 0 ? (h.quantity * h.lastPrice) / totalValue : 0;
                    return [
                        h.symbol,
                        h.gicsSector || '',
                        h.beta,
                        w
                    ];
                })
            }
        ];

        storeAnalysisData('macro', {
            modelName: 'Macro Sensitivity Analysis',
            firmStyle: 'Bridgewater Style',
            runDate: new Date().toISOString(),
            ticker: 'PORTFOLIO',
            sections: csvSections
        });

    } catch (err) {
        console.error('Macro Sensitivity Error:', err);
        output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>Error running macro sensitivity analysis: ' + err.message + '</div>';
    }
}


// ============================================================
// RENDER FUNCTION
// ============================================================

function renderMacroOutput(holdings, portfolioSensitivities, scenarioResults, hedgingRecs, sortedFactors, totalValue, concentrationWarning) {
    var output = document.getElementById('analysisOutput');

    // Destroy previous chart instances
    ['macro_radar'].forEach(function(key) {
        if (chartInstances[key]) {
            try { chartInstances[key].destroy(); } catch (e) {}
            delete chartInstances[key];
        }
    });

    // Sort holdings by weight descending
    var sortedHoldings = holdings.slice().sort(function(a, b) {
        return (b.quantity * b.lastPrice) - (a.quantity * a.lastPrice);
    });

    // -----------------------------------------------------------
    // Helper: color for sensitivity value
    // -----------------------------------------------------------
    function sensitivityColor(val) {
        if (val > 1.0) return 'color:#28a745;font-weight:700;';
        if (val > 0.5) return 'color:#6fcf8b;';
        if (val > -0.5) return 'color:rgba(255,255,255,0.5);';
        if (val > -1.0) return 'color:#e88;';
        return 'color:#dc3545;font-weight:700;';
    }

    function sensitivityBg(val) {
        if (val > 1.0) return 'background:rgba(40,167,69,0.25);color:#28a745;';
        if (val > 0.5) return 'background:rgba(40,167,69,0.12);color:#6fcf8b;';
        if (val > -0.5) return 'color:rgba(255,255,255,0.5);';
        if (val > -1.0) return 'background:rgba(220,53,69,0.12);color:#e88;';
        return 'background:rgba(220,53,69,0.25);color:#dc3545;';
    }

    function fmtSensitivity(val) {
        if (val == null || isNaN(val)) return 'N/A';
        return (val >= 0 ? '+' : '') + val.toFixed(2);
    }

    function portfolioSensColor(val) {
        var abs = Math.abs(val);
        if (abs < 0.2) return 'color:rgba(255,255,255,0.4);';
        if (val > 0) return 'color:#28a745;';
        return 'color:#dc3545;';
    }

    // Find the most exposed factor
    var mostExposedFactor = sortedFactors[0];
    var mostExposedLabel = MACRO_FACTOR_LABELS[mostExposedFactor[0]] ? MACRO_FACTOR_LABELS[mostExposedFactor[0]].name : mostExposedFactor[0];

    // -----------------------------------------------------------
    // CARD 1 - Portfolio Macro Overview (span-2)
    // -----------------------------------------------------------
    var factorKeys = ['interestRates', 'inflation', 'gdpGrowth', 'usdStrength', 'commodityPrices'];
    var metricsHTML = factorKeys.map(function(key) {
        var label = MACRO_FACTOR_LABELS[key];
        var val = portfolioSensitivities[key];
        return '<div class="metric-item">' +
            '<div class="metric-label">' + label.icon + ' ' + label.name + '</div>' +
            '<div class="metric-value" style="' + portfolioSensColor(val) + '">' + fmtSensitivity(val) + '</div>' +
            '</div>';
    }).join('');

    var overviewCard = '<div class="result-card span-2">' +
        '<h3><i class="fas fa-globe"></i> Portfolio Macro Sensitivity Overview</h3>' +
        '<div class="metrics-row">' + metricsHTML + '</div>' +
        '<div style="text-align:center;margin-top:0.5rem;padding:0.6rem;background:rgba(254,188,17,0.08);border-radius:8px;">' +
            '<span style="font-size:0.85rem;color:rgba(255,255,255,0.6);">Most Exposed To: </span>' +
            '<strong style="color:#febc11;font-size:1rem;">' + mostExposedLabel + ' (' + fmtSensitivity(mostExposedFactor[1]) + ')</strong>' +
        '</div>' +
        (concentrationWarning
            ? '<div style="margin-top:0.75rem;padding:0.6rem;background:rgba(220,53,69,0.1);border:1px solid rgba(220,53,69,0.3);border-radius:8px;font-size:0.8rem;color:#dc3545;"><i class="fas fa-exclamation-triangle" style="margin-right:0.5rem;"></i>' + concentrationWarning + '</div>'
            : '') +
        '</div>';

    // -----------------------------------------------------------
    // CARD 2 - Sensitivity Heat Map (span-2)
    // -----------------------------------------------------------
    var heatHeaderRow = '<tr><th style="text-align:left;">Symbol</th><th>Wt%</th>' +
        factorKeys.map(function(key) {
            var label = MACRO_FACTOR_LABELS[key];
            return '<th>' + label.icon + ' ' + label.name.replace(' Prices', '').replace(' Strength', '') + '</th>';
        }).join('') +
        '</tr>';

    var heatBodyRows = sortedHoldings.map(function(h) {
        var weight = (h.quantity * h.lastPrice) / totalValue * 100;
        var cells = factorKeys.map(function(key) {
            var val = h.sensitivities[key];
            return '<td style="' + sensitivityBg(val) + 'font-weight:600;text-align:center;">' + fmtSensitivity(val) + '</td>';
        }).join('');
        return '<tr>' +
            '<td style="font-weight:700;color:#e5e5e5;">' + h.symbol + ' <span style="font-size:0.7rem;color:rgba(255,255,255,0.4);">' + (h.gicsSector || '').replace('Information Technology', 'IT').replace('Consumer Discretionary', 'Cons Disc').replace('Consumer Staples', 'Cons Stpl').replace('Communication Services', 'Comm Svc') + '</span></td>' +
            '<td style="text-align:center;color:rgba(255,255,255,0.6);">' + fmt(weight, 1) + '%</td>' +
            cells +
            '</tr>';
    }).join('');

    // Portfolio row
    var portfolioRowCells = factorKeys.map(function(key) {
        var val = portfolioSensitivities[key];
        return '<td style="' + sensitivityBg(val) + 'font-weight:800;text-align:center;">' + fmtSensitivity(val) + '</td>';
    }).join('');
    var portfolioRow = '<tr style="border-top:2px solid rgba(254,188,17,0.4);">' +
        '<td style="font-weight:800;color:#febc11;">PORTFOLIO</td>' +
        '<td style="text-align:center;color:#febc11;font-weight:700;">100%</td>' +
        portfolioRowCells +
        '</tr>';

    var heatMapCard = '<div class="result-card span-2">' +
        '<h3><i class="fas fa-th"></i> Sensitivity Heat Map</h3>' +
        '<div class="heat-map-container">' +
            '<table class="heat-map">' +
            '<thead>' + heatHeaderRow + '</thead>' +
            '<tbody>' + heatBodyRows + portfolioRow + '</tbody>' +
            '</table>' +
        '</div>' +
        '</div>';

    // -----------------------------------------------------------
    // CARD 3 - Portfolio Macro Radar Chart
    // -----------------------------------------------------------
    var radarCard = '<div class="result-card">' +
        '<h3><i class="fas fa-spider"></i> Portfolio Macro Radar</h3>' +
        '<div style="position:relative;height:300px;"><canvas id="macroRadarChart"></canvas></div>' +
        '</div>';

    // -----------------------------------------------------------
    // CARD 4 - Scenario Analysis Table (span-2)
    // -----------------------------------------------------------
    var scenarioIcons = { bull: '\ud83d\udc02', base: '\u2696\ufe0f', bear: '\ud83d\udc3b', stagflation: '\ud83d\udd25', custom: '\ud83c\udfaf' };
    var scenarioOrder = ['bull', 'base', 'bear', 'stagflation'];
    // If a custom scenario exists, add it to the display order
    if (scenarioResults['custom']) {
        scenarioOrder.push('custom');
    }

    var scenarioHeaderRow = '<tr><th style="text-align:left;">Scenario</th><th>GDP</th><th>Inflation</th><th>Rates</th><th>USD</th><th>Commodities</th><th>Portfolio Impact</th></tr>';

    var scenarioBodyRows = scenarioOrder.map(function(id) {
        var sc = scenarioResults[id];
        var icon = scenarioIcons[id] || '';
        var impactVal = sc.totalImpact;
        var impactColor = impactVal > 0.5 ? '#28a745' : impactVal < -0.5 ? '#dc3545' : 'rgba(255,255,255,0.6)';
        var arrow = impactVal > 0.5 ? ' \u2191' : impactVal < -0.5 ? ' \u2193' : ' \u2192';

        // Format assumptions with units
        function fmtAssumption(key, val) {
            if (key === 'interestRates') {
                return (val >= 0 ? '+' : '') + (val * 100).toFixed(0) + 'bps';
            }
            return (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
        }

        var isCustom = (id === 'custom');
        var rowStyle = isCustom ? 'background:rgba(254,188,17,0.08);border:1px solid rgba(254,188,17,0.3);' : '';
        return '<tr style="' + rowStyle + '">' +
            '<td style="text-align:left;">' +
                '<div style="font-weight:700;color:' + (isCustom ? '#febc11' : '#e5e5e5') + ';">' + icon + ' ' + sc.name + '</div>' +
                '<div style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-top:0.15rem;">' + sc.description + '</div>' +
            '</td>' +
            '<td style="text-align:center;">' + fmtAssumption('gdpGrowth', sc.assumptions.gdpGrowth) + '</td>' +
            '<td style="text-align:center;">' + fmtAssumption('inflation', sc.assumptions.inflation) + '</td>' +
            '<td style="text-align:center;">' + fmtAssumption('interestRates', sc.assumptions.interestRates) + '</td>' +
            '<td style="text-align:center;">' + fmtAssumption('usdStrength', sc.assumptions.usdStrength) + '</td>' +
            '<td style="text-align:center;">' + fmtAssumption('commodityPrices', sc.assumptions.commodityPrices) + '</td>' +
            '<td style="text-align:center;font-weight:800;font-size:1.05rem;color:' + impactColor + ';">' + fmtSensitivity(impactVal) + '%' + arrow + '</td>' +
            '</tr>';
    }).join('');

    var scenarioCard = '<div class="result-card span-2">' +
        '<h3><i class="fas fa-chess"></i> Scenario Analysis</h3>' +
        '<div class="heat-map-container">' +
            '<table class="val-table">' +
            '<thead>' + scenarioHeaderRow + '</thead>' +
            '<tbody>' + scenarioBodyRows + '</tbody>' +
            '</table>' +
        '</div>' +
        '</div>';

    // -----------------------------------------------------------
    // CARD 5 - Hedging Recommendations
    // -----------------------------------------------------------
    var severityConfig = {
        high:   { color: '#dc3545', icon: '\u26a0\ufe0f' },
        medium: { color: '#ffc107', icon: '\ud83d\udee1\ufe0f' },
        low:    { color: '#28a745', icon: '\u2705' }
    };

    var recsHTML = hedgingRecs.map(function(rec) {
        var config = severityConfig[rec.severity] || severityConfig.low;
        return '<div style="display:flex;align-items:flex-start;gap:1rem;padding:0.75rem;border-left:3px solid ' + config.color + ';margin-bottom:0.5rem;background:rgba(255,255,255,0.03);border-radius:0 8px 8px 0;">' +
            '<span style="font-size:1.2rem;">' + config.icon + '</span>' +
            '<div>' +
                '<strong style="color:#e5e5e5;">' + rec.factor + '</strong>' +
                '<p style="color:rgba(255,255,255,0.7);font-size:0.85rem;margin-top:0.25rem;margin-bottom:0;">' + rec.recommendation + '</p>' +
            '</div>' +
            '</div>';
    }).join('');

    var hedgingCard = '<div class="result-card">' +
        '<h3><i class="fas fa-shield-alt"></i> Hedging Recommendations</h3>' +
        recsHTML +
        '</div>';

    // -----------------------------------------------------------
    // CARD 6 - Assumptions (span-2)
    // -----------------------------------------------------------
    var assumptionsCard = '<div class="result-card span-2">' +
        '<div class="assumptions-box">' +
            '<h4><i class="fas fa-info-circle"></i> Methodology & Assumptions</h4>' +
            '<p style="margin-bottom:0.75rem;font-size:0.82rem;color:rgba(255,255,255,0.7);">' +
                '<strong style="color:#febc11;">Where do these estimates come from?</strong> ' +
                'Sector sensitivity coefficients are derived from historical regression analysis of GICS sector returns against macro factor changes. ' +
                'The coefficients reflect consensus academic and practitioner research on how sectors have historically responded to macro shocks, drawing on methodologies used by firms like Bridgewater Associates and AQR Capital Management. ' +
                'Key sources include: (1) historical S&P sector return decompositions during rate hiking/cutting cycles (FRED data), ' +
                '(2) CPI/PPI pass-through analysis by sector, and (3) GDP beta estimates from rolling 5-year regressions.' +
            '</p>' +
            '<ul>' +
                '<li><strong>Sensitivity Scale:</strong> Coefficients range from -2 (very negatively impacted) to +2 (very positively impacted) when the macro factor increases by one standard deviation (σ). For example, Real Estate at -2 for Interest Rates means REITs historically decline significantly when rates rise.</li>' +
                '<li><strong>Beta Adjustment:</strong> Each holding\'s sensitivities are amplified by a beta factor: <code>adj = 0.5 + 0.5 × clamp(β, 0.5, 2.0)</code>, giving a range of 0.75x to 1.5x. Higher-beta stocks have amplified macro exposure.</li>' +
                '<li><strong>International Adjustment:</strong> International tickers (' + INTERNATIONAL_TICKERS.join(', ') + ') receive an additional USD sensitivity offset of -0.5, reflecting their higher foreign revenue exposure.</li>' +
                '<li><strong>Portfolio Impact:</strong> Scenario impacts are computed as: <code>Impact = Σ(portfolio_sensitivity × scenario_σ_move) × 3</code>. The 3x multiplier converts abstract sensitivity units to approximate percentage return impact, calibrated to historical sector return magnitudes during macro regime shifts.</li>' +
                '<li><strong>Limitations:</strong> These are directional estimates, not precise return forecasts. Actual performance depends on company-specific catalysts, earnings surprises, and market sentiment. Cross-factor correlations (e.g., stagflation = high inflation + low GDP simultaneously) may produce non-linear effects not captured here.</li>' +
                '<li><strong>Custom Scenarios:</strong> Use the Custom Scenario Builder to define your own macro assumptions. Values represent σ moves — e.g., +1.0 for Interest Rates means a one standard deviation increase in rates (~100bps).</li>' +
            '</ul>' +
        '</div>' +
        '</div>';

    // -----------------------------------------------------------
    // CARD 7 - Download CSV
    // -----------------------------------------------------------
    var downloadCard = '<button class="run-btn" onclick="downloadModelCSV(\'macro\')" style="margin-top:1rem;background:linear-gradient(135deg,#28a745,#20c997);width:100%;">' +
        '<i class="fas fa-download"></i> Download Analysis CSV' +
        '</button>';

    // -----------------------------------------------------------
    // Assemble output
    // -----------------------------------------------------------
    output.innerHTML =
        '<div class="result-grid">' +
            overviewCard +
            heatMapCard +
            radarCard +
            hedgingCard +
            scenarioCard +
            assumptionsCard +
        '</div>' +
        downloadCard;

    // -----------------------------------------------------------
    // Render radar chart after DOM is ready
    // -----------------------------------------------------------
    setTimeout(function() {
        _renderMacroRadarChart(portfolioSensitivities);
    }, 100);
}


// ============================================================
// CHART RENDERING
// ============================================================

function _renderMacroRadarChart(portfolioSensitivities) {
    var canvas = document.getElementById('macroRadarChart');
    if (!canvas) return;

    var factorKeys = ['interestRates', 'inflation', 'gdpGrowth', 'usdStrength', 'commodityPrices'];
    var labels = factorKeys.map(function(key) {
        return MACRO_FACTOR_LABELS[key] ? MACRO_FACTOR_LABELS[key].name : key;
    });
    var values = factorKeys.map(function(key) {
        return portfolioSensitivities[key] || 0;
    });

    chartInstances['macro_radar'] = new Chart(canvas.getContext('2d'), {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Portfolio Sensitivity',
                data: values,
                backgroundColor: 'rgba(254,188,17,0.2)',
                borderColor: '#febc11',
                borderWidth: 2,
                pointBackgroundColor: '#febc11',
                pointBorderColor: '#fff',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#e5e5e5',
                        boxWidth: 12,
                        font: { size: 11 }
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
                            var val = ctx.raw;
                            return ctx.dataset.label + ': ' + (val >= 0 ? '+' : '') + val.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                r: {
                    min: -2,
                    max: 2,
                    ticks: {
                        stepSize: 0.5,
                        color: '#aaa',
                        backdropColor: 'transparent',
                        font: { size: 9 }
                    },
                    grid: {
                        color: 'rgba(255,255,255,0.1)'
                    },
                    angleLines: {
                        color: 'rgba(255,255,255,0.1)'
                    },
                    pointLabels: {
                        color: '#e5e5e5',
                        font: { size: 11, weight: '600' }
                    }
                }
            }
        }
    });
}
