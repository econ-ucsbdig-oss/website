/**
 * val-technical.js
 * Technical Analysis Dashboard (Citadel Style)
 * Loaded via <script> tag in valuation.html -- all functions are globally accessible.
 *
 * Dependencies available from valuation.html:
 *   fmt(n, dec), fmtCur(n), fmtBig(n), fmtPct(n), clamp(v, lo, hi)
 *   apiBaseURL, chartInstances, storeAnalysisData(), downloadModelCSV()
 */

// ============================================================
// HELPER FUNCTIONS -- Technical Indicators
// ============================================================

/**
 * Exponential Moving Average.
 * Returns an array the same length as `data`.
 * The first (span - 1) values are null.
 */
function calcEMA(data, span) {
    const k = 2 / (span + 1);
    const ema = new Array(data.length).fill(null);
    // Seed with SMA of the first `span` values
    let sum = 0;
    for (let i = 0; i < span && i < data.length; i++) {
        sum += data[i];
    }
    if (data.length < span) return ema;
    ema[span - 1] = sum / span;
    for (let i = span; i < data.length; i++) {
        ema[i] = data[i] * k + ema[i - 1] * (1 - k);
    }
    return ema;
}

/**
 * Simple Moving Average.
 * Returns an array the same length as `data`.
 * The first (period - 1) values are null.
 */
function calcSMA(data, period) {
    const sma = new Array(data.length).fill(null);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum += data[i];
        if (i >= period) sum -= data[i - period];
        if (i >= period - 1) sma[i] = sum / period;
    }
    return sma;
}

/**
 * Rolling Standard Deviation over `period` days.
 * Returns array same length as `data` with first (period-1) values null.
 */
function calcStdDev(data, period) {
    const sd = new Array(data.length).fill(null);
    for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        const mean = slice.reduce((s, v) => s + v, 0) / period;
        const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
        sd[i] = Math.sqrt(variance);
    }
    return sd;
}

/**
 * RSI (14-day) using Wilder's smoothing.
 * Returns array same length as closes; first 14 values are null.
 */
function calcRSI(closes) {
    const period = 14;
    const rsi = new Array(closes.length).fill(null);
    if (closes.length < period + 1) return rsi;

    // Compute gains and losses
    const gains = [];
    const losses = [];
    for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        gains.push(Math.max(change, 0));
        losses.push(Math.max(-change, 0));
    }

    // Seed: simple average of first 14 gains/losses
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < period; i++) {
        avgGain += gains[i];
        avgLoss += losses[i];
    }
    avgGain /= period;
    avgLoss /= period;

    // First RSI value at index `period`
    if (avgLoss === 0) {
        rsi[period] = 100;
    } else {
        rsi[period] = 100 - (100 / (1 + avgGain / avgLoss));
    }

    // Wilder's smoothing for the rest
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        if (avgLoss === 0) {
            rsi[i + 1] = 100;
        } else {
            rsi[i + 1] = 100 - (100 / (1 + avgGain / avgLoss));
        }
    }
    return rsi;
}

/**
 * MACD (12, 26, 9).
 * Returns { macdLine, signalLine, histogram } -- arrays same length as closes.
 */
function calcMACD(closes) {
    const ema12 = calcEMA(closes, 12);
    const ema26 = calcEMA(closes, 26);

    const macdLine = new Array(closes.length).fill(null);
    for (let i = 0; i < closes.length; i++) {
        if (ema12[i] !== null && ema26[i] !== null) {
            macdLine[i] = ema12[i] - ema26[i];
        }
    }

    // Signal line = EMA(9) of the MACD line values (skip nulls)
    const macdValues = [];
    const macdIndices = [];
    for (let i = 0; i < macdLine.length; i++) {
        if (macdLine[i] !== null) {
            macdValues.push(macdLine[i]);
            macdIndices.push(i);
        }
    }

    const signalRaw = calcEMA(macdValues, 9);
    const signalLine = new Array(closes.length).fill(null);
    for (let i = 0; i < macdValues.length; i++) {
        signalLine[macdIndices[i]] = signalRaw[i];
    }

    const histogram = new Array(closes.length).fill(null);
    for (let i = 0; i < closes.length; i++) {
        if (macdLine[i] !== null && signalLine[i] !== null) {
            histogram[i] = macdLine[i] - signalLine[i];
        }
    }

    return { macdLine, signalLine, histogram };
}

/**
 * Bollinger Bands (20-day, 2 sigma).
 * Returns { upper, middle, lower, percentB } arrays.
 */
function calcBollinger(closes) {
    const period = 20;
    const middle = calcSMA(closes, period);
    const sd = calcStdDev(closes, period);

    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
    const percentB = new Array(closes.length).fill(null);

    for (let i = 0; i < closes.length; i++) {
        if (middle[i] !== null && sd[i] !== null) {
            upper[i] = middle[i] + 2 * sd[i];
            lower[i] = middle[i] - 2 * sd[i];
            const bandwidth = upper[i] - lower[i];
            percentB[i] = bandwidth > 0 ? (closes[i] - lower[i]) / bandwidth : 0.5;
        }
    }

    return { upper, middle, lower, percentB };
}

/**
 * Find support and resistance levels from local minima/maxima.
 * `windowSize` is the number of days on each side to check (default 5).
 * Scans the last 60 days of `prices` array (each with .low, .high, .close, .date).
 */
function findSupportResistance(prices, windowSize) {
    const w = windowSize || 5;
    const lookback = Math.min(60, prices.length);
    const start = prices.length - lookback;
    const supports = [];
    const resistances = [];

    for (let i = start + w; i < prices.length - w; i++) {
        // Check for local minimum (using low prices)
        let isMin = true;
        for (let j = i - w; j <= i + w; j++) {
            if (j !== i && prices[j].low <= prices[i].low) {
                isMin = false;
                break;
            }
        }
        if (isMin) {
            supports.push({ price: prices[i].low, date: prices[i].date, index: i });
        }

        // Check for local maximum (using high prices)
        let isMax = true;
        for (let j = i - w; j <= i + w; j++) {
            if (j !== i && prices[j].high >= prices[i].high) {
                isMax = false;
                break;
            }
        }
        if (isMax) {
            resistances.push({ price: prices[i].high, date: prices[i].date, index: i });
        }
    }

    // Sort supports ascending, resistances descending and pick top 2-3
    supports.sort((a, b) => a.price - b.price);
    resistances.sort((a, b) => b.price - a.price);

    return {
        supports: supports.slice(0, 3),
        resistances: resistances.slice(0, 3)
    };
}


// ============================================================
// MAIN ANALYSIS FUNCTION
// ============================================================

async function runTechnicalAnalysis(symbol) {
    const output = document.getElementById('analysisOutput');
    output.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><br>Running technical analysis for ' + symbol + '...</div>';

    try {
        // Date range: 1 year ago to today
        const today = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(today.getFullYear() - 1);

        const toDate = today.toISOString().slice(0, 10);
        const fromDate = oneYearAgo.toISOString().slice(0, 10);

        // Fetch history + analytics in parallel
        const fetchFn = typeof cachedFetch === 'function' ? cachedFetch : function(url) {
            return fetch(url).then(function(r) { return r.json(); });
        };

        const [historyRes, analyticsRes] = await Promise.all([
            fetchFn(`${apiBaseURL}/api/stock/${symbol}/history?timespan=day&from=${fromDate}&to=${toDate}&limit=252`),
            fetchFn(`${apiBaseURL}/api/stock/${symbol}/analytics`)
        ]);

        const prices = historyRes.prices || [];
        const analytics = analyticsRes.analytics || analyticsRes || {};

        if (prices.length < 30) {
            output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>Insufficient price history for ' + symbol + '. Need at least 30 days of data.</div>';
            return;
        }

        // Sort prices oldest -> newest (ensure chronological order)
        prices.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Extract close prices
        const closes = prices.map(p => p.close);
        const volumes = prices.map(p => p.volume || 0);

        // ----- Compute Technical Indicators -----

        // Moving Averages
        const sma20 = calcSMA(closes, 20);
        const sma50 = calcSMA(closes, 50);
        const sma200 = calcSMA(closes, 200);

        // RSI
        const rsiArr = calcRSI(closes);
        const currentRSI = rsiArr.filter(v => v !== null).pop() || 50;

        // MACD
        const macd = calcMACD(closes);
        const currentMACDLine = macd.macdLine.filter(v => v !== null).pop() || 0;
        const currentSignal = macd.signalLine.filter(v => v !== null).pop() || 0;
        const currentHistogram = macd.histogram.filter(v => v !== null).pop() || 0;

        // Previous histogram for "increasing" check
        const histValues = macd.histogram.filter(v => v !== null);
        const prevHistogram = histValues.length >= 2 ? histValues[histValues.length - 2] : 0;

        // Bollinger Bands
        const bollinger = calcBollinger(closes);
        const currentPercentB = bollinger.percentB.filter(v => v !== null).pop() || 0.5;

        // Support / Resistance
        const sr = findSupportResistance(prices, 5);

        // Volume Analysis
        const volumeSMA20 = calcSMA(volumes, 20);
        const currentVolume = volumes[volumes.length - 1] || 0;
        const currentVolSMA = volumeSMA20[volumeSMA20.length - 1] || 1;
        const volumeRatio = currentVolSMA > 0 ? currentVolume / currentVolSMA : 1;

        // OBV (On Balance Volume)
        const obv = [0];
        for (let i = 1; i < closes.length; i++) {
            const sign = closes[i] > closes[i - 1] ? 1 : (closes[i] < closes[i - 1] ? -1 : 0);
            obv.push(obv[i - 1] + volumes[i] * sign);
        }
        // OBV trend: compare OBV SMA20 slope
        const obvSMA = calcSMA(obv, 20);
        const obvTrend = (obvSMA[obvSMA.length - 1] || 0) > (obvSMA[obvSMA.length - 6] || 0) ? 'Rising' : 'Falling';

        // Current price & SMA values
        const currentPrice = closes[closes.length - 1];
        const currentSMA20 = sma20[sma20.length - 1];
        const currentSMA50 = sma50[sma50.length - 1];
        const currentSMA200 = sma200[sma200.length - 1];

        // ----- Composite Technical Score (0-100) -----

        // RSI component (25 pts)
        let rsiScore;
        if (currentRSI < 30) rsiScore = 25;
        else if (currentRSI < 40) rsiScore = 20;
        else if (currentRSI < 50) rsiScore = 15;
        else if (currentRSI < 60) rsiScore = 12;
        else if (currentRSI < 70) rsiScore = 8;
        else rsiScore = 3;

        // MACD component (25 pts)
        let macdScore;
        const histIncreasing = currentHistogram > prevHistogram;
        if (currentHistogram > 0 && histIncreasing) macdScore = 25;
        else if (currentHistogram > 0) macdScore = 18;
        else if (currentHistogram < 0 && histIncreasing) macdScore = 12;
        else macdScore = 5;

        // Trend component (25 pts)
        let trendScore;
        if (currentSMA200 !== null && currentSMA50 !== null) {
            if (currentPrice > currentSMA200 && currentSMA50 > currentSMA200) trendScore = 25;
            else if (currentPrice > currentSMA200) trendScore = 18;
            else if (currentSMA50 !== null && currentPrice > currentSMA50) trendScore = 12;
            else trendScore = 3;
        } else if (currentSMA50 !== null) {
            trendScore = currentPrice > currentSMA50 ? 12 : 3;
        } else {
            trendScore = 10; // Not enough data for 200-day SMA
        }

        // Bollinger component (25 pts)
        let bollingerScore;
        if (currentPercentB < 0.2) bollingerScore = 25;
        else if (currentPercentB < 0.4) bollingerScore = 20;
        else if (currentPercentB < 0.6) bollingerScore = 12;
        else if (currentPercentB < 0.8) bollingerScore = 8;
        else bollingerScore = 3;

        const technicalScore = rsiScore + macdScore + trendScore + bollingerScore;

        // Signal
        let signal, signalClass, signalDesc;
        if (technicalScore > 70) {
            signal = 'STRONG BUY'; signalClass = 'undervalued'; signalDesc = 'Multiple bullish signals across indicators';
        } else if (technicalScore > 55) {
            signal = 'BUY'; signalClass = 'undervalued'; signalDesc = 'Bullish momentum with favorable technical setup';
        } else if (technicalScore > 45) {
            signal = 'HOLD'; signalClass = 'fairly-valued'; signalDesc = 'Mixed signals — neutral technical outlook';
        } else if (technicalScore > 30) {
            signal = 'SELL'; signalClass = 'overvalued'; signalDesc = 'Bearish momentum with weakening technicals';
        } else {
            signal = 'STRONG SELL'; signalClass = 'overvalued'; signalDesc = 'Multiple bearish signals across indicators';
        }

        // Volume analysis object
        const volumeAnalysis = {
            currentVolume,
            sma20Volume: currentVolSMA,
            ratio: volumeRatio,
            obvTrend
        };

        // ----- Render -----
        renderTechnicalOutput(
            symbol, prices, rsiArr, macd, bollinger,
            sma20, sma50, sma200,
            sr.supports, sr.resistances,
            volumeAnalysis, technicalScore, signal, signalClass, signalDesc,
            currentRSI, currentMACDLine, currentSignal, currentHistogram,
            currentPercentB, rsiScore, macdScore, trendScore, bollingerScore,
            analytics, histIncreasing
        );

        // ----- Store CSV Data -----
        const csvData = {
            modelName: 'Technical Analysis',
            firmStyle: 'Citadel Style',
            runDate: new Date().toISOString(),
            ticker: symbol,
            sections: [
                {
                    title: 'Technical Score Summary',
                    type: 'metrics',
                    rows: [
                        { label: 'Symbol', value: symbol },
                        { label: 'Current Price', formatted: fmtCur(currentPrice) },
                        { label: 'Technical Score', formatted: technicalScore + '/100' },
                        { label: 'Signal', value: signal },
                        { label: 'RSI (14)', formatted: fmt(currentRSI), formula: 'Wilder smoothing' },
                        { label: 'MACD Line', formatted: fmt(currentMACDLine, 4) },
                        { label: 'MACD Signal', formatted: fmt(currentSignal, 4) },
                        { label: 'MACD Histogram', formatted: fmt(currentHistogram, 4) },
                        { label: 'Bollinger %B', formatted: fmt(currentPercentB, 4) },
                        { label: 'Volume Ratio (vs 20d avg)', formatted: fmt(volumeRatio) + 'x' },
                        { label: 'OBV Trend', value: obvTrend }
                    ]
                },
                {
                    title: 'Score Breakdown',
                    type: 'table',
                    headers: ['Component', 'Value', 'Signal', 'Score'],
                    rows: [
                        ['RSI (14)', fmt(currentRSI), currentRSI < 30 ? 'Oversold' : currentRSI > 70 ? 'Overbought' : 'Neutral', rsiScore + '/25'],
                        ['MACD', currentHistogram > 0 ? 'Bullish' : 'Bearish', histIncreasing ? 'Improving' : 'Weakening', macdScore + '/25'],
                        ['Trend', currentSMA200 ? (currentPrice > currentSMA200 ? 'Above SMA200' : 'Below SMA200') : 'N/A', currentSMA50 && currentSMA200 ? (currentSMA50 > currentSMA200 ? 'Golden Cross' : 'Death Cross') : 'N/A', trendScore + '/25'],
                        ['Bollinger', '%B = ' + fmt(currentPercentB), currentPercentB < 0.2 ? 'Near Support' : currentPercentB > 0.8 ? 'Near Resistance' : 'Mid-Band', bollingerScore + '/25']
                    ]
                },
                {
                    title: 'Support & Resistance Levels',
                    type: 'table',
                    headers: ['Type', 'Price', 'Date'],
                    rows: [
                        ...sr.supports.map(s => ['Support', fmtCur(s.price), s.date]),
                        ...sr.resistances.map(r => ['Resistance', fmtCur(r.price), r.date]),
                        ['Current Price', fmtCur(currentPrice), toDate],
                        ['52-Week High', analytics.high52Week ? fmtCur(analytics.high52Week) : 'N/A', ''],
                        ['52-Week Low', analytics.low52Week ? fmtCur(analytics.low52Week) : 'N/A', '']
                    ]
                },
                {
                    title: 'Raw Financial Data — OHLCV + Indicators (Last 20 Days)',
                    type: 'table',
                    headers: ['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'RSI', 'MACD', 'Signal', '%B'],
                    rows: prices.slice(-20).map((p, idx) => {
                        const i = prices.length - 20 + idx;
                        return [
                            p.date,
                            p.open,
                            p.high,
                            p.low,
                            p.close,
                            p.volume || 0,
                            rsiArr[i] !== null ? rsiArr[i] : '',
                            macd.macdLine[i] !== null ? macd.macdLine[i] : '',
                            macd.signalLine[i] !== null ? macd.signalLine[i] : '',
                            bollinger.percentB[i] !== null ? bollinger.percentB[i] : ''
                        ];
                    })
                }
            ]
        };
        storeAnalysisData('technical', csvData);

    } catch (err) {
        console.error('Technical Analysis Error:', err);
        output.innerHTML = '<div class="analysis-error"><i class="fas fa-exclamation-triangle"></i>Error running technical analysis for ' + symbol + ': ' + err.message + '</div>';
    }
}


// ============================================================
// RENDER FUNCTION
// ============================================================

function renderTechnicalOutput(
    symbol, prices, rsiArr, macd, bollinger,
    sma20, sma50, sma200,
    supports, resistances,
    volumeAnalysis, technicalScore, signal, signalClass, signalDesc,
    currentRSI, currentMACDLine, currentSignal, currentHistogram,
    currentPercentB, rsiScore, macdScore, trendScore, bollingerScore,
    analytics, histIncreasing
) {
    const output = document.getElementById('analysisOutput');
    const closes = prices.map(p => p.close);
    const currentPrice = closes[closes.length - 1];

    // Destroy previous chart instances
    ['tech_price', 'tech_rsi', 'tech_macd'].forEach(key => {
        if (chartInstances[key]) {
            try { chartInstances[key].destroy(); } catch (e) {}
            delete chartInstances[key];
        }
    });

    // Format dates as short dates (e.g., "Jan 15")
    const dateLabels = prices.map(p => {
        // p.date is already an ISO string like "2025-01-15T05:00:00.000Z"
        const d = new Date(p.date);
        if (isNaN(d.getTime())) {
            // Fallback: try treating as YYYY-MM-DD
            const d2 = new Date(String(p.date).split('T')[0] + 'T00:00:00');
            return isNaN(d2.getTime()) ? String(p.date).slice(0, 10) : d2.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // RSI signal text
    let rsiSignalText, rsiSignalClass;
    if (currentRSI < 30) { rsiSignalText = 'Oversold'; rsiSignalClass = 'positive'; }
    else if (currentRSI < 40) { rsiSignalText = 'Near Oversold'; rsiSignalClass = 'positive'; }
    else if (currentRSI < 60) { rsiSignalText = 'Neutral'; rsiSignalClass = ''; }
    else if (currentRSI < 70) { rsiSignalText = 'Near Overbought'; rsiSignalClass = 'negative'; }
    else { rsiSignalText = 'Overbought'; rsiSignalClass = 'negative'; }

    // MACD signal text
    let macdSignalText, macdSignalClass;
    if (currentHistogram > 0 && histIncreasing) { macdSignalText = 'Bullish Crossover'; macdSignalClass = 'positive'; }
    else if (currentHistogram > 0) { macdSignalText = 'Bullish'; macdSignalClass = 'positive'; }
    else if (currentHistogram < 0 && histIncreasing) { macdSignalText = 'Bearish (Improving)'; macdSignalClass = ''; }
    else { macdSignalText = 'Bearish'; macdSignalClass = 'negative'; }

    // Trend signal text
    const curSMA200 = sma200[sma200.length - 1];
    const curSMA50 = sma50[sma50.length - 1];
    let trendSignalText, trendSignalClass;
    if (curSMA200 !== null && curSMA50 !== null) {
        if (currentPrice > curSMA200 && curSMA50 > curSMA200) { trendSignalText = 'Strong Uptrend'; trendSignalClass = 'positive'; }
        else if (currentPrice > curSMA200) { trendSignalText = 'Above SMA200'; trendSignalClass = 'positive'; }
        else if (currentPrice > curSMA50) { trendSignalText = 'Above SMA50'; trendSignalClass = ''; }
        else { trendSignalText = 'Downtrend'; trendSignalClass = 'negative'; }
    } else {
        trendSignalText = 'Insufficient Data'; trendSignalClass = '';
    }

    // Bollinger signal text
    let bbSignalText, bbSignalClass;
    if (currentPercentB < 0.2) { bbSignalText = 'Near Support'; bbSignalClass = 'positive'; }
    else if (currentPercentB < 0.4) { bbSignalText = 'Lower Band'; bbSignalClass = 'positive'; }
    else if (currentPercentB < 0.6) { bbSignalText = 'Mid-Band'; bbSignalClass = ''; }
    else if (currentPercentB < 0.8) { bbSignalText = 'Upper Band'; bbSignalClass = 'negative'; }
    else { bbSignalText = 'Near Resistance'; bbSignalClass = 'negative'; }

    // Volume label
    let volumeLabel;
    if (volumeAnalysis.ratio > 1.5) volumeLabel = 'High Volume';
    else if (volumeAnalysis.ratio > 1.0) volumeLabel = 'Above Average';
    else if (volumeAnalysis.ratio > 0.7) volumeLabel = 'Average';
    else volumeLabel = 'Below Average';

    // 52-week high/low
    const high52 = analytics.high52Week || Math.max(...closes);
    const low52 = analytics.low52Week || Math.min(...closes);

    output.innerHTML = `
    <!-- VERDICT -->
    <div class="result-card span-2 verdict-card">
        <div class="verdict-badge ${signalClass}">${signal}</div>
        <div class="verdict-price">${technicalScore}/100</div>
        <div class="verdict-detail">Technical Score &mdash; ${signalDesc}</div>
    </div>

    <div class="result-grid">
        <!-- PRICE CHART WITH OVERLAYS -->
        <div class="result-card span-2">
            <h3><i class="fas fa-chart-line"></i> Price Chart with Overlays &mdash; ${symbol}</h3>
            <div class="chart-box tall"><canvas id="techPriceChart"></canvas></div>
        </div>

        <!-- RSI CHART -->
        <div class="result-card">
            <h3><i class="fas fa-tachometer-alt"></i> RSI (14-Day)</h3>
            <div class="metrics-row" style="margin-bottom:0.5rem;">
                <div class="metric-item"><div class="metric-label">Current RSI</div><div class="metric-value">${fmt(currentRSI)}</div></div>
                <div class="metric-item"><div class="metric-label">Signal</div><div class="metric-value" style="font-size:1rem;">${rsiSignalText}</div></div>
            </div>
            <div style="position:relative;height:200px;"><canvas id="techRSIChart"></canvas></div>
        </div>

        <!-- MACD CHART -->
        <div class="result-card">
            <h3><i class="fas fa-wave-square"></i> MACD (12, 26, 9)</h3>
            <div class="metrics-row" style="margin-bottom:0.5rem;">
                <div class="metric-item"><div class="metric-label">MACD Line</div><div class="metric-value">${fmt(currentMACDLine, 3)}</div></div>
                <div class="metric-item"><div class="metric-label">Signal</div><div class="metric-value">${fmt(currentSignal, 3)}</div></div>
                <div class="metric-item"><div class="metric-label">Histogram</div><div class="metric-value" style="color:${currentHistogram >= 0 ? '#28a745' : '#dc3545'}">${fmt(currentHistogram, 3)}</div></div>
            </div>
            <div style="position:relative;height:200px;"><canvas id="techMACDChart"></canvas></div>
        </div>

        <!-- SIGNAL SUMMARY TABLE -->
        <div class="result-card">
            <h3><i class="fas fa-clipboard-check"></i> Signal Summary</h3>
            <table class="val-table">
                <thead>
                    <tr><th>Indicator</th><th>Value</th><th>Signal</th><th>Score</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td>RSI (14)</td>
                        <td>${fmt(currentRSI)}</td>
                        <td class="${rsiSignalClass}">${rsiSignalText}</td>
                        <td class="highlight">${rsiScore}/25</td>
                    </tr>
                    <tr>
                        <td>MACD</td>
                        <td>${macdSignalText}</td>
                        <td class="${macdSignalClass}">${currentHistogram >= 0 ? 'Buy' : 'Sell'}</td>
                        <td class="highlight">${macdScore}/25</td>
                    </tr>
                    <tr>
                        <td>Trend</td>
                        <td>${trendSignalText}</td>
                        <td class="${trendSignalClass}">${trendSignalText.includes('Uptrend') || trendSignalText.includes('Above') ? 'Bullish' : 'Bearish'}</td>
                        <td class="highlight">${trendScore}/25</td>
                    </tr>
                    <tr>
                        <td>Bollinger</td>
                        <td>%B = ${fmt(currentPercentB)}</td>
                        <td class="${bbSignalClass}">${bbSignalText}</td>
                        <td class="highlight">${bollingerScore}/25</td>
                    </tr>
                    <tr>
                        <td>Volume</td>
                        <td>${fmt(volumeAnalysis.ratio)}x Avg</td>
                        <td>${volumeLabel}</td>
                        <td style="opacity:0.5;">-</td>
                    </tr>
                    <tr>
                        <td>OBV Trend</td>
                        <td>${volumeAnalysis.obvTrend}</td>
                        <td class="${volumeAnalysis.obvTrend === 'Rising' ? 'positive' : 'negative'}">${volumeAnalysis.obvTrend === 'Rising' ? 'Bullish' : 'Bearish'}</td>
                        <td style="opacity:0.5;">-</td>
                    </tr>
                    <tr style="border-top:2px solid rgba(255,255,255,0.15);">
                        <td style="font-weight:700;">TOTAL</td>
                        <td></td>
                        <td class="${signalClass === 'undervalued' ? 'positive' : signalClass === 'overvalued' ? 'negative' : ''}" style="font-weight:700;">${signal}</td>
                        <td class="highlight" style="font-size:1.1rem;">${technicalScore}/100</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- SUPPORT & RESISTANCE -->
        <div class="result-card">
            <h3><i class="fas fa-arrows-alt-v"></i> Support & Resistance Levels</h3>
            <table class="val-table">
                <thead>
                    <tr><th>Type</th><th>Price Level</th><th>Date</th><th>Distance</th></tr>
                </thead>
                <tbody>
                    ${resistances.map(r => {
                        const dist = ((r.price - currentPrice) / currentPrice * 100);
                        return `<tr>
                            <td class="negative" style="font-weight:700;">Resistance</td>
                            <td>${fmtCur(r.price)}</td>
                            <td>${r.date}</td>
                            <td class="negative">${fmtPct(dist)}</td>
                        </tr>`;
                    }).join('')}
                    <tr style="background:rgba(254,188,17,0.08);">
                        <td class="highlight" style="font-weight:700;">Current Price</td>
                        <td class="highlight" style="font-weight:700;">${fmtCur(currentPrice)}</td>
                        <td></td>
                        <td></td>
                    </tr>
                    ${supports.map(s => {
                        const dist = ((s.price - currentPrice) / currentPrice * 100);
                        return `<tr>
                            <td class="positive" style="font-weight:700;">Support</td>
                            <td>${fmtCur(s.price)}</td>
                            <td>${s.date}</td>
                            <td class="positive">${fmtPct(dist)}</td>
                        </tr>`;
                    }).join('')}
                    <tr style="border-top:1px solid rgba(255,255,255,0.15);">
                        <td style="opacity:0.7;">52-Week High</td>
                        <td>${fmtCur(high52)}</td>
                        <td></td>
                        <td class="${currentPrice < high52 ? 'negative' : 'positive'}">${fmtPct((high52 - currentPrice) / currentPrice * 100)}</td>
                    </tr>
                    <tr>
                        <td style="opacity:0.7;">52-Week Low</td>
                        <td>${fmtCur(low52)}</td>
                        <td></td>
                        <td class="${currentPrice > low52 ? 'positive' : 'negative'}">${fmtPct((low52 - currentPrice) / currentPrice * 100)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- ASSUMPTIONS -->
    <div class="assumptions-box">
        <h4><i class="fas fa-info-circle"></i> Methodology & Assumptions</h4>
        <ul>
            <li>RSI computed using 14-day Wilder's smoothing (exponential moving average)</li>
            <li>MACD uses standard parameters: 12-day EMA, 26-day EMA, 9-day signal line</li>
            <li>Bollinger Bands use 20-day SMA with 2 standard deviations</li>
            <li>Support/Resistance identified from local minima/maxima over last 60 trading days (5-day window)</li>
            <li>Composite score weights each indicator equally at 25 points, favoring mean-reversion signals</li>
            <li>Technical analysis is backward-looking; past patterns do not guarantee future price movements</li>
        </ul>
    </div>

    <!-- DOWNLOAD CSV -->
    <button class="run-btn" onclick="downloadModelCSV('technical')" style="margin-top:1rem;background:linear-gradient(135deg,#28a745,#20c997);width:100%;">
        <i class="fas fa-download"></i> Download Analysis CSV
    </button>
    `;

    // ---- RENDER CHARTS ----
    setTimeout(() => {
        _renderTechPriceChart(dateLabels, closes, sma20, sma50, sma200, bollinger, supports, resistances);
        _renderTechRSIChart(dateLabels, rsiArr);
        _renderTechMACDChart(dateLabels, macd);
    }, 100);
}


// ============================================================
// CHART RENDERING HELPERS (private-ish, prefixed with _)
// ============================================================

function _renderTechPriceChart(dateLabels, closes, sma20, sma50, sma200, bollinger, supports, resistances) {
    const canvas = document.getElementById('techPriceChart');
    if (!canvas) return;

    // Show every ~20th label to avoid crowding
    const step = Math.max(1, Math.floor(dateLabels.length / 15));

    chartInstances['tech_price'] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: dateLabels,
            datasets: [
                {
                    label: 'Close',
                    data: closes,
                    borderColor: '#ffffff',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    tension: 0.1,
                    fill: false,
                    order: 1
                },
                {
                    label: 'SMA 20',
                    data: sma20,
                    borderColor: '#ffd700',
                    borderWidth: 1,
                    borderDash: [4, 3],
                    pointRadius: 0,
                    tension: 0.1,
                    fill: false,
                    order: 2
                },
                {
                    label: 'SMA 50',
                    data: sma50,
                    borderColor: '#4dabf7',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.1,
                    fill: false,
                    order: 3
                },
                {
                    label: 'SMA 200',
                    data: sma200,
                    borderColor: '#dc3545',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.1,
                    fill: false,
                    order: 4
                },
                {
                    label: 'Bollinger Upper',
                    data: bollinger.upper,
                    borderColor: 'rgba(255,255,255,0.3)',
                    borderWidth: 1,
                    borderDash: [3, 3],
                    pointRadius: 0,
                    tension: 0.1,
                    fill: false,
                    order: 5
                },
                {
                    label: 'Bollinger Lower',
                    data: bollinger.lower,
                    borderColor: 'rgba(255,255,255,0.3)',
                    borderWidth: 1,
                    borderDash: [3, 3],
                    pointRadius: 0,
                    tension: 0.1,
                    fill: '-1',  // Fill between this and previous dataset (Bollinger Upper)
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    order: 6
                }
            ]
        },
        options: {
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
                        filter: function(item) {
                            // Show only the main datasets in legend
                            return ['Close', 'SMA 20', 'SMA 50', 'SMA 200'].includes(item.text);
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
                        label: function(ctx) {
                            if (ctx.raw === null) return null;
                            return ctx.dataset.label + ': $' + ctx.raw.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#aaa',
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 15
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: {
                        color: '#aaa',
                        callback: function(v) { return '$' + v.toFixed(0); }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function _renderTechRSIChart(dateLabels, rsiArr) {
    const canvas = document.getElementById('techRSIChart');
    if (!canvas) return;

    // Prepare RSI data, and also data for the overbought/oversold fills
    const rsiData = rsiArr.map(v => v);

    // Create datasets for fill regions
    const rsiAbove70 = rsiArr.map(v => (v !== null && v > 70) ? v : null);
    const rsiBelow30 = rsiArr.map(v => (v !== null && v < 30) ? v : null);

    chartInstances['tech_rsi'] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: dateLabels,
            datasets: [
                {
                    label: 'RSI (14)',
                    data: rsiData,
                    borderColor: '#ffd700',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: false,
                    order: 1
                },
                // Overbought threshold line
                {
                    label: 'Overbought (70)',
                    data: new Array(dateLabels.length).fill(70),
                    borderColor: 'rgba(220,53,69,0.5)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    order: 3
                },
                // Oversold threshold line
                {
                    label: 'Oversold (30)',
                    data: new Array(dateLabels.length).fill(30),
                    borderColor: 'rgba(40,167,69,0.5)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    order: 4
                }
            ]
        },
        plugins: [{
            id: 'rsiFillZones',
            beforeDatasetsDraw: function(chart) {
                const ctx = chart.ctx;
                const xAxis = chart.scales.x;
                const yAxis = chart.scales.y;
                const dataset = chart.data.datasets[0];
                const meta = chart.getDatasetMeta(0);

                if (!meta.data || meta.data.length === 0) return;

                // Draw oversold zone (below 30) - green
                ctx.save();
                ctx.fillStyle = 'rgba(40,167,69,0.1)';
                ctx.fillRect(
                    xAxis.left, yAxis.getPixelForValue(30),
                    xAxis.right - xAxis.left,
                    yAxis.getPixelForValue(0) - yAxis.getPixelForValue(30)
                );
                ctx.restore();

                // Draw overbought zone (above 70) - red
                ctx.save();
                ctx.fillStyle = 'rgba(220,53,69,0.1)';
                ctx.fillRect(
                    xAxis.left, yAxis.getPixelForValue(100),
                    xAxis.right - xAxis.left,
                    yAxis.getPixelForValue(70) - yAxis.getPixelForValue(100)
                );
                ctx.restore();
            }
        }],
        options: {
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
                        filter: function(item) {
                            return item.text === 'RSI (14)';
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,20,25,0.9)',
                    titleColor: '#febc11',
                    bodyColor: '#e5e5e5',
                    callbacks: {
                        label: function(ctx) {
                            if (ctx.raw === null) return null;
                            if (ctx.datasetIndex === 0) return 'RSI: ' + ctx.raw.toFixed(1);
                            return null;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#aaa',
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        color: '#aaa',
                        stepSize: 10
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function _renderTechMACDChart(dateLabels, macd) {
    const canvas = document.getElementById('techMACDChart');
    if (!canvas) return;

    // Prepare histogram colors: green when positive, red when negative
    const histColors = macd.histogram.map(v => {
        if (v === null) return 'rgba(128,128,128,0.3)';
        return v >= 0 ? 'rgba(40,167,69,0.6)' : 'rgba(220,53,69,0.6)';
    });
    const histBorderColors = macd.histogram.map(v => {
        if (v === null) return 'rgba(128,128,128,0.5)';
        return v >= 0 ? '#28a745' : '#dc3545';
    });

    chartInstances['tech_macd'] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: dateLabels,
            datasets: [
                {
                    label: 'Histogram',
                    data: macd.histogram,
                    backgroundColor: histColors,
                    borderColor: histBorderColors,
                    borderWidth: 1,
                    order: 2,
                    yAxisID: 'y'
                },
                {
                    label: 'MACD Line',
                    data: macd.macdLine,
                    type: 'line',
                    borderColor: '#ffd700',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: false,
                    order: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'Signal Line',
                    data: macd.signalLine,
                    type: 'line',
                    borderColor: '#4dabf7',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: false,
                    order: 1,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
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
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,20,25,0.9)',
                    titleColor: '#febc11',
                    bodyColor: '#e5e5e5',
                    callbacks: {
                        label: function(ctx) {
                            if (ctx.raw === null) return null;
                            return ctx.dataset.label + ': ' + ctx.raw.toFixed(3);
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#aaa',
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: {
                        color: '#aaa',
                        callback: function(v) { return v.toFixed(2); }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}
