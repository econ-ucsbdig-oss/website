const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002'];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log(`CORS blocked origin: ${origin}`);
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
    optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.options('*', cors(corsOptions));
app.use(express.static(__dirname));

// Debug middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} from ${req.get('origin') || 'direct'}`);
    next();
});

// Rate limiting
const apiCalls = new Map();
const API_RATE_LIMIT = parseInt(process.env.API_RATE_LIMIT) || 60;

function checkRateLimit(key, maxCalls = API_RATE_LIMIT, windowMs = 60000) {
    const now = Date.now();
    const calls = apiCalls.get(key) || [];
    const recentCalls = calls.filter(time => now - time < windowMs);

    if (recentCalls.length >= maxCalls) {
        return false;
    }

    recentCalls.push(now);
    apiCalls.set(key, recentCalls);
    return true;
}

// Polygon.io API helpers
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

async function polygonFetch(endpoint, params = {}) {
    if (!POLYGON_API_KEY) {
        throw new Error('Polygon.io API key not configured');
    }

    const queryParams = new URLSearchParams({
        ...params,
        apiKey: POLYGON_API_KEY
    });

    const url = `${POLYGON_BASE_URL}${endpoint}?${queryParams}`;
    const response = await fetch(url);

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Polygon API error: ${response.status} - ${error}`);
    }

    return await response.json();
}

// Get real-time quote data
async function fetchStockQuote(symbol) {
    try {
        // Get snapshot for real-time data
        const data = await polygonFetch(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`);

        if (data.status === 'OK' && data.ticker) {
            const ticker = data.ticker;
            const day = ticker.day || {};
            const prevDay = ticker.prevDay || {};
            const min = ticker.min || {};

            return {
                symbol: ticker.ticker,
                price: day.c || min.c || ticker.lastTrade?.p || 0,
                change: day.c && prevDay.c ? day.c - prevDay.c : 0,
                changePercent: day.c && prevDay.c ? ((day.c - prevDay.c) / prevDay.c) * 100 : 0,
                high: day.h || 0,
                low: day.l || 0,
                open: day.o || 0,
                close: day.c || 0,
                volume: day.v || 0,
                prevClose: prevDay.c || 0,
                timestamp: new Date().toISOString(),
                updated: ticker.updated || Date.now()
            };
        }

        throw new Error('Invalid response from Polygon.io');
    } catch (error) {
        console.error(`Error fetching quote for ${symbol}:`, error.message);
        throw error;
    }
}

// Get historical price data for charts
async function fetchHistoricalPrices(symbol, timespan = 'day', from, to, limit = 120) {
    try {
        const data = await polygonFetch(`/v2/aggs/ticker/${symbol}/range/1/${timespan}/${from}/${to}`, {
            adjusted: 'true',
            sort: 'asc',
            limit: limit
        });

        if (data.results && data.results.length > 0) {
            return data.results.map(bar => ({
                timestamp: bar.t,
                date: new Date(bar.t).toISOString(),
                open: bar.o,
                high: bar.h,
                low: bar.l,
                close: bar.c,
                volume: bar.v,
                vwap: bar.vw,
                transactions: bar.n
            }));
        }

        return [];
    } catch (error) {
        console.error(`Error fetching historical prices for ${symbol}:`, error.message);
        throw error;
    }
}

// Get company details
async function fetchCompanyDetails(symbol) {
    try {
        const data = await polygonFetch(`/v3/reference/tickers/${symbol}`);

        if (data.status === 'OK' && data.results) {
            const result = data.results;
            return {
                symbol: result.ticker,
                name: result.name,
                description: result.description,
                homepage: result.homepage_url,
                logo: result.branding?.icon_url,
                marketCap: result.market_cap,
                shareClassSharesOutstanding: result.share_class_shares_outstanding,
                weightedSharesOutstanding: result.weighted_shares_outstanding,
                listDate: result.list_date,
                locale: result.locale,
                primaryExchange: result.primary_exchange,
                type: result.type,
                active: result.active,
                currencyName: result.currency_name,
                cik: result.cik,
                composite_figi: result.composite_figi,
                phone: result.phone_number,
                address: result.address,
                sicCode: result.sic_code,
                sicDescription: result.sic_description,
                totalEmployees: result.total_employees
            };
        }

        throw new Error('Company details not found');
    } catch (error) {
        console.error(`Error fetching company details for ${symbol}:`, error.message);
        throw error;
    }
}

// Get company financials
async function fetchFinancials(symbol, limit = 4) {
    try {
        const data = await polygonFetch(`/vX/reference/financials`, {
            ticker: symbol,
            limit: limit,
            sort: 'filing_date',
            order: 'desc'
        });

        if (data.status === 'OK' && data.results) {
            return data.results.map(financial => ({
                fiscalPeriod: financial.fiscal_period,
                fiscalYear: financial.fiscal_year,
                startDate: financial.start_date,
                endDate: financial.end_date,
                filingDate: financial.filing_date,
                acceptanceDateTime: financial.acceptance_datetime,
                timeframe: financial.timeframe,
                revenues: financial.financials?.income_statement?.revenues?.value,
                netIncome: financial.financials?.income_statement?.net_income_loss?.value,
                grossProfit: financial.financials?.income_statement?.gross_profit?.value,
                operatingIncome: financial.financials?.income_statement?.operating_income_loss?.value,
                eps: financial.financials?.income_statement?.basic_earnings_per_share?.value,
                epsDiluted: financial.financials?.income_statement?.diluted_earnings_per_share?.value,
                assets: financial.financials?.balance_sheet?.assets?.value,
                liabilities: financial.financials?.balance_sheet?.liabilities?.value,
                equity: financial.financials?.balance_sheet?.equity?.value,
                cashFlow: financial.financials?.cash_flow_statement?.net_cash_flow?.value,
                dividends: financial.financials?.cash_flow_statement?.dividends_paid?.value
            }));
        }

        return [];
    } catch (error) {
        console.error(`Error fetching financials for ${symbol}:`, error.message);
        throw error;
    }
}

// Get company news
async function fetchNews(symbol, limit = 10) {
    try {
        const data = await polygonFetch(`/v2/reference/news`, {
            ticker: symbol,
            limit: limit,
            sort: 'published_utc',
            order: 'desc'
        });

        if (data.status === 'OK' && data.results) {
            return data.results.map(article => ({
                id: article.id,
                title: article.title,
                author: article.author,
                published: article.published_utc,
                url: article.article_url,
                imageUrl: article.image_url,
                description: article.description,
                keywords: article.keywords,
                publisher: article.publisher
            }));
        }

        return [];
    } catch (error) {
        console.error(`Error fetching news for ${symbol}:`, error.message);
        throw error;
    }
}

// Calculate advanced analytics
async function calculateAnalytics(symbol, prices) {
    try {
        if (!prices || prices.length < 20) {
            throw new Error('Insufficient data for analytics');
        }

        // Calculate volatility (20-day standard deviation)
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i].close - prices[i-1].close) / prices[i-1].close);
        }

        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized

        // Calculate beta (simplified - using SPY as proxy)
        let beta = 1.0; // Default to market beta
        try {
            const spyPrices = await fetchHistoricalPrices('SPY', 'day',
                prices[0].date.split('T')[0],
                prices[prices.length - 1].date.split('T')[0],
                prices.length
            );

            if (spyPrices.length === prices.length) {
                const spyReturns = [];
                for (let i = 1; i < spyPrices.length; i++) {
                    spyReturns.push((spyPrices[i].close - spyPrices[i-1].close) / spyPrices[i-1].close);
                }

                // Calculate covariance and variance for beta
                let covariance = 0;
                let marketVariance = 0;
                const avgSpyReturn = spyReturns.reduce((a, b) => a + b, 0) / spyReturns.length;

                for (let i = 0; i < returns.length && i < spyReturns.length; i++) {
                    covariance += (returns[i] - avgReturn) * (spyReturns[i] - avgSpyReturn);
                    marketVariance += Math.pow(spyReturns[i] - avgSpyReturn, 2);
                }

                beta = (covariance / returns.length) / (marketVariance / spyReturns.length);
            }
        } catch (error) {
            console.error('Error calculating beta:', error.message);
        }

        // Calculate simple moving averages
        const sma20 = prices.slice(-20).reduce((sum, p) => sum + p.close, 0) / 20;
        const sma50 = prices.length >= 50
            ? prices.slice(-50).reduce((sum, p) => sum + p.close, 0) / 50
            : null;
        const sma200 = prices.length >= 200
            ? prices.slice(-200).reduce((sum, p) => sum + p.close, 0) / 200
            : null;

        // Calculate price momentum
        const momentum1m = prices.length >= 20
            ? ((prices[prices.length - 1].close - prices[prices.length - 20].close) / prices[prices.length - 20].close) * 100
            : null;
        const momentum3m = prices.length >= 60
            ? ((prices[prices.length - 1].close - prices[prices.length - 60].close) / prices[prices.length - 60].close) * 100
            : null;

        // Calculate 52-week high/low
        const recentYear = prices.slice(-252);
        const high52Week = Math.max(...recentYear.map(p => p.high));
        const low52Week = Math.min(...recentYear.map(p => p.low));

        return {
            volatility: volatility,
            beta: beta,
            sma20: sma20,
            sma50: sma50,
            sma200: sma200,
            momentum1m: momentum1m,
            momentum3m: momentum3m,
            high52Week: high52Week,
            low52Week: low52Week,
            avgVolume20: prices.slice(-20).reduce((sum, p) => sum + p.volume, 0) / 20
        };
    } catch (error) {
        console.error(`Error calculating analytics for ${symbol}:`, error.message);
        throw error;
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/valuation', (req, res) => {
    res.sendFile(path.join(__dirname, 'valuation.html'));
});

app.get('/stock-history', (req, res) => {
    res.sendFile(path.join(__dirname, 'stock-history.html'));
});

// TE dashboard routes
const TE_FLASK_URL = process.env.TE_FLASK_URL || 'http://127.0.0.1:5001';

app.get('/te', (req, res) => {
    res.sendFile(path.join(__dirname, 'te.html'));
});

app.get('/te-react', (req, res) => {
    res.sendFile(path.join(__dirname, 'react-tearsheet.html'));
});

app.use('/api/te', async (req, res) => {
    try {
        const url = `${TE_FLASK_URL}${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
        const upstream = await fetch(url, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {})
        });

        const contentType = upstream.headers.get('content-type') || '';
        res.status(upstream.status);

        if (contentType.includes('application/json')) {
            const data = await upstream.json();
            return res.json(data);
        }

        const text = await upstream.text();
        return res.send(text);
    } catch (e) {
        console.error('TE proxy error:', e);
        return res.status(502).json({ error: 'TE service unavailable. Start TE/app.py (Flask) and retry.' });
    }
});

app.get('/TE', (req, res) => {
    res.sendFile(path.join(__dirname, 'TE', 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!POLYGON_API_KEY,
        provider: 'Polygon.io'
    });
});

// Get individual stock quote
app.get('/api/stock/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const clientIP = req.ip;

        if (!checkRateLimit(clientIP, 30, 60000)) {
            return res.status(429).json({
                error: 'Too many requests. Please try again later.'
            });
        }

        if (!symbol || symbol.length > 10) {
            return res.status(400).json({ error: 'Invalid symbol' });
        }

        const stockData = await fetchStockQuote(symbol.toUpperCase());
        res.json(stockData);

    } catch (error) {
        console.error(`Error fetching ${req.params.symbol}:`, error.message);

        if (error.message.includes('rate limit')) {
            res.status(429).json({ error: 'API rate limit reached. Please try again later.' });
        } else if (error.message.includes('not configured')) {
            res.status(503).json({ error: 'Service temporarily unavailable' });
        } else {
            res.status(404).json({ error: 'Symbol not found or data unavailable' });
        }
    }
});

// Batch stock quotes
app.post('/api/stocks/batch', async (req, res) => {
    try {
        const { symbols } = req.body;
        const clientIP = req.ip;

        if (!Array.isArray(symbols) || symbols.length === 0) {
            return res.status(400).json({ error: 'Invalid symbols array' });
        }

        if (symbols.length > 50) {
            return res.status(400).json({ error: 'Too many symbols (max 50)' });
        }

        if (!checkRateLimit(clientIP, 10, 60000)) {
            return res.status(429).json({
                error: 'Too many batch requests. Please try again later.'
            });
        }

        const results = [];
        const errors = [];

        // Polygon.io can handle concurrent requests better
        const promises = symbols.map(symbol =>
            fetchStockQuote(symbol.toUpperCase())
                .then(data => results.push(data))
                .catch(error => errors.push({ symbol, error: error.message }))
        );

        await Promise.all(promises);

        res.json({
            results,
            errors,
            timestamp: new Date().toISOString(),
            processed: results.length,
            failed: errors.length
        });

    } catch (error) {
        console.error('Batch request error:', error);
        res.status(500).json({ error: 'Failed to process batch request' });
    }
});

// Get historical prices for charting
app.get('/api/stock/:symbol/history', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { timespan = 'day', from, to, limit = 120 } = req.query;

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol required' });
        }

        // Default date range if not provided
        const toDate = to || new Date().toISOString().split('T')[0];
        const fromDate = from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const prices = await fetchHistoricalPrices(
            symbol.toUpperCase(),
            timespan,
            fromDate,
            toDate,
            parseInt(limit)
        );

        res.json({
            symbol: symbol.toUpperCase(),
            timespan,
            from: fromDate,
            to: toDate,
            prices
        });

    } catch (error) {
        console.error(`Error fetching history for ${req.params.symbol}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch historical prices' });
    }
});

// Get company details
app.get('/api/stock/:symbol/details', async (req, res) => {
    try {
        const { symbol } = req.params;

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol required' });
        }

        const details = await fetchCompanyDetails(symbol.toUpperCase());
        res.json(details);

    } catch (error) {
        console.error(`Error fetching details for ${req.params.symbol}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch company details' });
    }
});

// Get company financials
app.get('/api/stock/:symbol/financials', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { limit = 4 } = req.query;

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol required' });
        }

        const financials = await fetchFinancials(symbol.toUpperCase(), parseInt(limit));
        res.json({
            symbol: symbol.toUpperCase(),
            financials
        });

    } catch (error) {
        console.error(`Error fetching financials for ${req.params.symbol}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch financials' });
    }
});

// Get historical valuation metrics (P/E, P/B trends over time)
app.get('/api/stock/:symbol/valuation-history', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { quarters = 12 } = req.query; // Default 12 quarters = 3 years

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol required' });
        }

        // Fetch historical financials (more than requested to ensure we have enough data)
        const financials = await fetchFinancials(symbol.toUpperCase(), parseInt(quarters) + 4);

        if (!financials || financials.length === 0) {
            return res.json({
                symbol: symbol.toUpperCase(),
                valuationHistory: [],
                message: 'No financial data available for this symbol'
            });
        }

        // Fetch company details for shares outstanding
        const details = await fetchCompanyDetails(symbol.toUpperCase());
        const sharesOutstanding = details?.shareClassSharesOutstanding;

        // For each quarter, fetch the stock price at the filing date and calculate metrics
        const valuationHistory = [];

        // Filter to only quarterly data (exclude FY annual reports to maintain consistency)
        const quarterlyFinancials = financials.filter(f => f.fiscalPeriod !== 'FY');

        for (let i = 0; i < Math.min(parseInt(quarters), quarterlyFinancials.length); i++) {
            const financial = quarterlyFinancials[i];
            const filingDate = financial.filingDate;
            if (!filingDate) continue;

            // Calculate TTM (Trailing 12 Months) EPS by summing the last 4 quarters
            let ttmEps = 0;
            let validQuarters = 0;
            for (let j = i; j < Math.min(i + 4, quarterlyFinancials.length); j++) {
                if (quarterlyFinancials[j].eps) {
                    ttmEps += quarterlyFinancials[j].eps;
                    validQuarters++;
                }
            }
            // Only use TTM EPS if we have at least 3 quarters of data
            const epsToUse = validQuarters >= 3 ? ttmEps : null;

            // Fetch stock price on filing date (or closest available)
            const dateStr = filingDate.split('T')[0];
            const fromDate = new Date(new Date(dateStr).getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 5 days before
            const toDate = new Date(new Date(dateStr).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 5 days after

            try {
                const priceData = await fetchHistoricalPrices(symbol.toUpperCase(), 'day', fromDate, toDate, 10);

                if (priceData && priceData.length > 0) {
                    // Use the closest price to filing date
                    const closestPrice = priceData.reduce((prev, curr) => {
                        const prevDiff = Math.abs(new Date(prev.timestamp) - new Date(dateStr));
                        const currDiff = Math.abs(new Date(curr.timestamp) - new Date(dateStr));
                        return currDiff < prevDiff ? curr : prev;
                    });

                    const price = closestPrice.close;
                    const quarterlyEps = financial.eps;
                    const equity = financial.equity;

                    // Calculate P/E ratio using TTM EPS
                    const peRatio = epsToUse && epsToUse > 0 ? price / epsToUse : null;

                    // Calculate P/B ratio
                    const bookValuePerShare = equity && sharesOutstanding ? equity / sharesOutstanding : null;
                    const pbRatio = bookValuePerShare && bookValuePerShare > 0 ? price / bookValuePerShare : null;

                    valuationHistory.push({
                        date: filingDate,
                        fiscalPeriod: financial.fiscalPeriod,
                        fiscalYear: financial.fiscalYear,
                        price: price,
                        eps: epsToUse || null, // TTM EPS
                        quarterlyEps: quarterlyEps || null, // Keep quarterly for reference
                        peRatio: peRatio,
                        pbRatio: pbRatio,
                        equity: equity || null,
                        bookValuePerShare: bookValuePerShare,
                        revenues: financial.revenues || null,
                        netIncome: financial.netIncome || null
                    });
                }
            } catch (error) {
                console.warn(`Could not fetch price for ${symbol} at ${filingDate}:`, error.message);
                continue;
            }
        }

        res.json({
            symbol: symbol.toUpperCase(),
            valuationHistory: valuationHistory.reverse(), // Oldest first
            periods: valuationHistory.length
        });

    } catch (error) {
        console.error(`Error fetching valuation history for ${req.params.symbol}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch valuation history' });
    }
});

// Get DuPont analysis and value creation metrics
app.get('/api/stock/:symbol/value-creation', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { quarters = 12 } = req.query;

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol required' });
        }

        // Fetch historical financials
        const financials = await fetchFinancials(symbol.toUpperCase(), parseInt(quarters) + 4);

        if (!financials || financials.length === 0) {
            return res.json({
                symbol: symbol.toUpperCase(),
                valueCreation: [],
                message: 'No financial data available for this symbol'
            });
        }

        // Filter to quarterly data only
        const quarterlyFinancials = financials.filter(f => f.fiscalPeriod !== 'FY');

        const valueCreationHistory = [];

        for (let i = 0; i < Math.min(parseInt(quarters), quarterlyFinancials.length); i++) {
            const financial = quarterlyFinancials[i];

            // DuPont Analysis Components
            const profitMargin = financial.revenues && financial.revenues > 0
                ? (financial.netIncome / financial.revenues) * 100
                : null;

            const assetTurnover = financial.assets && financial.assets > 0
                ? financial.revenues / financial.assets
                : null;

            const equityMultiplier = financial.equity && financial.equity > 0
                ? financial.assets / financial.equity
                : null;

            // ROE (should equal profitMargin * assetTurnover * equityMultiplier / 100)
            const roe = financial.equity && financial.equity > 0
                ? (financial.netIncome / financial.equity) * 100
                : null;

            // Operating Efficiency Metrics
            const grossMargin = financial.revenues && financial.revenues > 0
                ? (financial.grossProfit / financial.revenues) * 100
                : null;

            const operatingMargin = financial.revenues && financial.revenues > 0
                ? (financial.operatingIncome / financial.revenues) * 100
                : null;

            const netMargin = profitMargin; // Same as profit margin

            // Capital Efficiency Metrics
            const roa = financial.assets && financial.assets > 0
                ? (financial.netIncome / financial.assets) * 100
                : null;

            // ROIC approximation: Operating Income / Total Capital
            const totalCapital = financial.equity + financial.liabilities;
            const roic = totalCapital && totalCapital > 0
                ? (financial.operatingIncome / totalCapital) * 100
                : null;

            // Capital Structure
            const debtToEquity = financial.equity && financial.equity > 0
                ? financial.liabilities / financial.equity
                : null;

            const assetToEquity = equityMultiplier; // Same as equity multiplier

            valueCreationHistory.push({
                date: financial.filingDate,
                fiscalPeriod: financial.fiscalPeriod,
                fiscalYear: financial.fiscalYear,

                // DuPont Components
                profitMargin: profitMargin,
                assetTurnover: assetTurnover,
                equityMultiplier: equityMultiplier,
                roe: roe,

                // Operating Efficiency
                grossMargin: grossMargin,
                operatingMargin: operatingMargin,
                netMargin: netMargin,

                // Capital Efficiency
                roa: roa,
                roic: roic,

                // Capital Structure
                debtToEquity: debtToEquity,

                // Raw values for reference
                revenues: financial.revenues,
                netIncome: financial.netIncome,
                operatingIncome: financial.operatingIncome,
                assets: financial.assets,
                equity: financial.equity,
                liabilities: financial.liabilities
            });
        }

        res.json({
            symbol: symbol.toUpperCase(),
            valueCreation: valueCreationHistory.reverse(), // Oldest first
            periods: valueCreationHistory.length
        });

    } catch (error) {
        console.error(`Error fetching value creation metrics for ${req.params.symbol}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch value creation metrics' });
    }
});

// Get company news
app.get('/api/stock/:symbol/news', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { limit = 10 } = req.query;

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol required' });
        }

        const news = await fetchNews(symbol.toUpperCase(), parseInt(limit));
        res.json({
            symbol: symbol.toUpperCase(),
            news
        });

    } catch (error) {
        console.error(`Error fetching news for ${req.params.symbol}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});

// Get advanced analytics
app.get('/api/stock/:symbol/analytics', async (req, res) => {
    try {
        const { symbol } = req.params;

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol required' });
        }

        // Fetch 1 year of daily prices for analytics
        const toDate = new Date().toISOString().split('T')[0];
        const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const prices = await fetchHistoricalPrices(symbol.toUpperCase(), 'day', fromDate, toDate, 252);
        const analytics = await calculateAnalytics(symbol.toUpperCase(), prices);

        res.json({
            symbol: symbol.toUpperCase(),
            analytics,
            dataPoints: prices.length
        });

    } catch (error) {
        console.error(`Error calculating analytics for ${req.params.symbol}:`, error.message);
        res.status(500).json({ error: 'Failed to calculate analytics' });
    }
});

// Get comprehensive stock data (all-in-one endpoint)
app.get('/api/stock/:symbol/comprehensive', async (req, res) => {
    try {
        const { symbol } = req.params;

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol required' });
        }

        const upperSymbol = symbol.toUpperCase();

        // Fetch all data in parallel
        const [quote, details, financials, news] = await Promise.allSettled([
            fetchStockQuote(upperSymbol),
            fetchCompanyDetails(upperSymbol),
            fetchFinancials(upperSymbol, 4),
            fetchNews(upperSymbol, 5)
        ]);

        const result = {
            symbol: upperSymbol,
            quote: quote.status === 'fulfilled' ? quote.value : null,
            details: details.status === 'fulfilled' ? details.value : null,
            financials: financials.status === 'fulfilled' ? financials.value : [],
            news: news.status === 'fulfilled' ? news.value : []
        };

        res.json(result);

    } catch (error) {
        console.error(`Error fetching comprehensive data for ${req.params.symbol}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch comprehensive data' });
    }
});

// Calculate portfolio correlation matrix
app.post('/api/portfolio/correlation', async (req, res) => {
    try {
        const { symbols } = req.body;

        if (!Array.isArray(symbols) || symbols.length < 2) {
            return res.status(400).json({ error: 'At least 2 symbols required' });
        }

        // Fetch 3 months of data for correlation
        const toDate = new Date().toISOString().split('T')[0];
        const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const pricesPromises = symbols.map(symbol =>
            fetchHistoricalPrices(symbol.toUpperCase(), 'day', fromDate, toDate, 90)
        );

        const allPrices = await Promise.all(pricesPromises);

        // Calculate correlation matrix
        const correlationMatrix = [];

        for (let i = 0; i < symbols.length; i++) {
            const row = [];
            const returns1 = [];

            for (let j = 1; j < allPrices[i].length; j++) {
                returns1.push((allPrices[i][j].close - allPrices[i][j-1].close) / allPrices[i][j-1].close);
            }

            for (let j = 0; j < symbols.length; j++) {
                if (i === j) {
                    row.push(1.0);
                } else {
                    const returns2 = [];
                    for (let k = 1; k < allPrices[j].length; k++) {
                        returns2.push((allPrices[j][k].close - allPrices[j][k-1].close) / allPrices[j][k-1].close);
                    }

                    const minLength = Math.min(returns1.length, returns2.length);
                    const avg1 = returns1.slice(0, minLength).reduce((a, b) => a + b, 0) / minLength;
                    const avg2 = returns2.slice(0, minLength).reduce((a, b) => a + b, 0) / minLength;

                    let covariance = 0;
                    let var1 = 0;
                    let var2 = 0;

                    for (let k = 0; k < minLength; k++) {
                        covariance += (returns1[k] - avg1) * (returns2[k] - avg2);
                        var1 += Math.pow(returns1[k] - avg1, 2);
                        var2 += Math.pow(returns2[k] - avg2, 2);
                    }

                    const correlation = covariance / Math.sqrt(var1 * var2);
                    row.push(correlation);
                }
            }

            correlationMatrix.push(row);
        }

        res.json({
            symbols,
            correlationMatrix,
            period: '90 days'
        });

    } catch (error) {
        console.error('Error calculating correlation:', error.message);
        res.status(500).json({ error: 'Failed to calculate correlation matrix' });
    }
});

// Portfolio-level analytics (aggregate risk/return metrics)
app.post('/api/portfolio/analytics', async (req, res) => {
    try {
        const { holdings, period } = req.body; // [{ symbol, weight }], period: '3m','6m','ytd','1y','2y','all'
        if (!Array.isArray(holdings) || holdings.length === 0) {
            return res.status(400).json({ error: 'Holdings array required' });
        }

        // Calculate lookback based on period
        const periodDaysMap = { '3m': 70, '6m': 135, '1y': 260, '2y': 510, 'all': 1300 };
        let lookbackDays;
        if (period === 'ytd') {
            const jan1 = new Date(new Date().getFullYear(), 0, 1);
            lookbackDays = Math.ceil((Date.now() - jan1) / 86400000) + 10;
        } else {
            lookbackDays = periodDaysMap[period] || 260;
        }

        const toDate = new Date().toISOString().split('T')[0];
        const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Fetch SPY (benchmark) + all holdings in parallel
        const symbols = holdings.map(h => h.symbol.toUpperCase());
        const allFetches = ['SPY', ...symbols].map(sym =>
            fetchHistoricalPrices(sym, 'day', fromDate, toDate, lookbackDays + 10)
                .catch(() => [])
        );
        const allPrices = await Promise.all(allFetches);
        const spyPrices = allPrices[0];
        const holdingPrices = allPrices.slice(1);

        // Build daily portfolio returns (weight-adjusted)
        const minLen = Math.min(spyPrices.length, ...holdingPrices.map(p => p.length));
        if (minLen < 20) {
            return res.json({ error: 'Insufficient data', partial: true });
        }

        // Align all series to same length from the end
        const spy = spyPrices.slice(-minLen);
        const aligned = holdingPrices.map(p => p.slice(-minLen));

        // Calculate daily returns for each holding
        const holdingReturns = aligned.map(prices => {
            const ret = [];
            for (let i = 1; i < prices.length; i++) {
                ret.push((prices[i].close - prices[i - 1].close) / prices[i - 1].close);
            }
            return ret;
        });

        // Weighted portfolio daily returns
        const totalWeight = holdings.reduce((s, h) => s + h.weight, 0) || 1;
        const weights = holdings.map(h => h.weight / totalWeight);
        const numDays = holdingReturns[0] ? holdingReturns[0].length : 0;
        const portfolioReturns = [];
        for (let d = 0; d < numDays; d++) {
            let dayReturn = 0;
            for (let h = 0; h < holdingReturns.length; h++) {
                if (holdingReturns[h][d] !== undefined) {
                    dayReturn += weights[h] * holdingReturns[h][d];
                }
            }
            portfolioReturns.push(dayReturn);
        }

        // SPY daily returns
        const spyReturns = [];
        for (let i = 1; i < spy.length; i++) {
            spyReturns.push((spy[i].close - spy[i - 1].close) / spy[i - 1].close);
        }

        // --- Cumulative returns ---
        const cumPort = [1];
        const cumSpy = [1];
        for (let i = 0; i < numDays; i++) {
            cumPort.push(cumPort[i] * (1 + (portfolioReturns[i] || 0)));
            cumSpy.push(cumSpy[i] * (1 + (spyReturns[i] || 0)));
        }

        // Dates for the cumulative series
        const dates = spy.map(p => p.date ? p.date.split('T')[0] : '');

        // --- Period returns ---
        function periodReturn(cumArr, days) {
            if (cumArr.length < days + 1) return null;
            const end = cumArr[cumArr.length - 1];
            const start = cumArr[cumArr.length - 1 - days];
            return (end / start - 1) * 100;
        }
        const ytdDays = Math.min(numDays, Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 86400000));

        // --- Annualized volatility ---
        const avgPortReturn = portfolioReturns.reduce((a, b) => a + b, 0) / numDays;
        const portVariance = portfolioReturns.reduce((s, r) => s + Math.pow(r - avgPortReturn, 2), 0) / numDays;
        const annualizedVol = Math.sqrt(portVariance) * Math.sqrt(252) * 100;

        // --- Portfolio Beta ---
        const avgSpyReturn = spyReturns.reduce((a, b) => a + b, 0) / spyReturns.length;
        let covariance = 0, marketVariance = 0;
        const commonLen = Math.min(portfolioReturns.length, spyReturns.length);
        for (let i = 0; i < commonLen; i++) {
            covariance += (portfolioReturns[i] - avgPortReturn) * (spyReturns[i] - avgSpyReturn);
            marketVariance += Math.pow(spyReturns[i] - avgSpyReturn, 2);
        }
        const beta = marketVariance > 0 ? (covariance / commonLen) / (marketVariance / commonLen) : 1;

        // --- Sharpe Ratio (assuming 5% risk-free rate) ---
        const riskFreeDaily = 0.05 / 252;
        const excessReturns = portfolioReturns.map(r => r - riskFreeDaily);
        const avgExcess = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
        const excessStd = Math.sqrt(excessReturns.reduce((s, r) => s + Math.pow(r - avgExcess, 2), 0) / excessReturns.length);
        const sharpe = excessStd > 0 ? (avgExcess / excessStd) * Math.sqrt(252) : 0;

        // --- Sortino Ratio ---
        const downsideReturns = excessReturns.filter(r => r < 0);
        const downsideStd = downsideReturns.length > 0
            ? Math.sqrt(downsideReturns.reduce((s, r) => s + r * r, 0) / downsideReturns.length)
            : 0.0001;
        const sortino = (avgExcess / downsideStd) * Math.sqrt(252);

        // --- Max Drawdown ---
        let peak = cumPort[0], maxDD = 0;
        for (let i = 1; i < cumPort.length; i++) {
            if (cumPort[i] > peak) peak = cumPort[i];
            const dd = (peak - cumPort[i]) / peak;
            if (dd > maxDD) maxDD = dd;
        }

        // --- Alpha (Jensen's) ---
        const annPortReturn = (Math.pow(cumPort[cumPort.length - 1], 252 / numDays) - 1);
        const annSpyReturn = (Math.pow(cumSpy[cumSpy.length - 1], 252 / numDays) - 1);
        const alpha = (annPortReturn - 0.05) - beta * (annSpyReturn - 0.05);

        // --- Per-stock performance for heatmap ---
        const stockPerf = [];
        for (let h = 0; h < holdings.length; h++) {
            const prices = aligned[h];
            if (!prices || prices.length < 2) continue;
            const ret1d = prices.length >= 2 ? ((prices[prices.length-1].close / prices[prices.length-2].close) - 1) * 100 : 0;
            const ret1w = prices.length >= 6 ? ((prices[prices.length-1].close / prices[Math.max(0, prices.length-6)].close) - 1) * 100 : null;
            const ret1m = prices.length >= 22 ? ((prices[prices.length-1].close / prices[Math.max(0, prices.length-22)].close) - 1) * 100 : null;
            const ret3m = prices.length >= 63 ? ((prices[prices.length-1].close / prices[Math.max(0, prices.length-63)].close) - 1) * 100 : null;
            const retYtd = prices.length > ytdDays && ytdDays > 0 ? ((prices[prices.length-1].close / prices[Math.max(0, prices.length-1-ytdDays)].close) - 1) * 100 : null;

            stockPerf.push({
                symbol: holdings[h].symbol,
                weight: (holdings[h].weight / totalWeight * 100),
                ret1d, ret1w, ret1m, ret3m, retYtd,
                price: prices[prices.length-1].close
            });
        }

        // --- Concentration (HHI) ---
        const hhi = weights.reduce((s, w) => s + w * w, 0);
        const effectivePositions = 1 / (hhi || 1);

        // Build sparkline data (weekly sampled cumulative returns)
        const sparkPort = [], sparkSpy = [], sparkDates = [];
        const step = numDays <= 70 ? 1 : numDays <= 260 ? Math.max(1, Math.floor(numDays / 65)) : Math.max(1, Math.floor(numDays / 100));
        for (let i = 0; i <= numDays; i += step) {
            sparkPort.push(((cumPort[i] || cumPort[cumPort.length-1]) - 1) * 100);
            sparkSpy.push(((cumSpy[i] || cumSpy[cumSpy.length-1]) - 1) * 100);
            sparkDates.push(dates[i] || dates[dates.length-1]);
        }
        // Always include the last point
        if (sparkPort[sparkPort.length - 1] !== ((cumPort[cumPort.length-1] - 1) * 100)) {
            sparkPort.push((cumPort[cumPort.length-1] - 1) * 100);
            sparkSpy.push((cumSpy[cumSpy.length-1] - 1) * 100);
            sparkDates.push(dates[dates.length - 1]);
        }

        res.json({
            portfolio: {
                return1m: periodReturn(cumPort, Math.min(22, numDays)),
                return3m: periodReturn(cumPort, Math.min(63, numDays)),
                return6m: periodReturn(cumPort, Math.min(126, numDays)),
                returnYtd: periodReturn(cumPort, Math.min(ytdDays, numDays)),
                return1y: (cumPort[cumPort.length - 1] - 1) * 100,
                annualizedVol,
                beta,
                sharpe,
                sortino,
                maxDrawdown: maxDD * 100,
                alpha: alpha * 100,
                effectivePositions
            },
            benchmark: {
                return1m: periodReturn(cumSpy, Math.min(22, numDays)),
                return3m: periodReturn(cumSpy, Math.min(63, numDays)),
                return6m: periodReturn(cumSpy, Math.min(126, numDays)),
                returnYtd: periodReturn(cumSpy, Math.min(ytdDays, numDays)),
                return1y: (cumSpy[cumSpy.length - 1] - 1) * 100
            },
            sparkline: { dates: sparkDates, portfolio: sparkPort, spy: sparkSpy },
            stockPerformance: stockPerf,
            dataPoints: numDays
        });

    } catch (error) {
        console.error('Error calculating portfolio analytics:', error.message);
        res.status(500).json({ error: 'Failed to calculate portfolio analytics' });
    }
});

// --- Shared risk metrics computation ---
function computeRiskMetrics(portfolioReturns, spyReturns, numDays) {
    const cumPort = [1], cumSpy = [1];
    for (let i = 0; i < numDays; i++) {
        cumPort.push(cumPort[i] * (1 + (portfolioReturns[i] || 0)));
        cumSpy.push(cumSpy[i] * (1 + (spyReturns[i] || 0)));
    }

    const avgPortReturn = portfolioReturns.reduce((a, b) => a + b, 0) / numDays;
    const portVariance = portfolioReturns.reduce((s, r) => s + Math.pow(r - avgPortReturn, 2), 0) / numDays;
    const annualizedVol = Math.sqrt(portVariance) * Math.sqrt(252) * 100;

    const avgSpyReturn = spyReturns.reduce((a, b) => a + b, 0) / spyReturns.length;
    let covariance = 0, marketVariance = 0;
    const commonLen = Math.min(portfolioReturns.length, spyReturns.length);
    for (let i = 0; i < commonLen; i++) {
        covariance += (portfolioReturns[i] - avgPortReturn) * (spyReturns[i] - avgSpyReturn);
        marketVariance += Math.pow(spyReturns[i] - avgSpyReturn, 2);
    }
    const beta = marketVariance > 0 ? (covariance / commonLen) / (marketVariance / commonLen) : 1;

    const riskFreeDaily = 0.05 / 252;
    const excessReturns = portfolioReturns.map(r => r - riskFreeDaily);
    const avgExcess = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
    const excessStd = Math.sqrt(excessReturns.reduce((s, r) => s + Math.pow(r - avgExcess, 2), 0) / excessReturns.length);
    const sharpe = excessStd > 0 ? (avgExcess / excessStd) * Math.sqrt(252) : 0;

    const downsideReturns = excessReturns.filter(r => r < 0);
    const downsideStd = downsideReturns.length > 0
        ? Math.sqrt(downsideReturns.reduce((s, r) => s + r * r, 0) / downsideReturns.length)
        : 0.0001;
    const sortino = (avgExcess / downsideStd) * Math.sqrt(252);

    let peak = cumPort[0], maxDD = 0;
    for (let i = 1; i < cumPort.length; i++) {
        if (cumPort[i] > peak) peak = cumPort[i];
        const dd = (peak - cumPort[i]) / peak;
        if (dd > maxDD) maxDD = dd;
    }

    const annPortReturn = numDays > 0 ? (Math.pow(cumPort[cumPort.length - 1], 252 / numDays) - 1) : 0;
    const annSpyReturn = numDays > 0 ? (Math.pow(cumSpy[cumSpy.length - 1], 252 / numDays) - 1) : 0;
    const alpha = (annPortReturn - 0.05) - beta * (annSpyReturn - 0.05);

    function periodReturn(cumArr, days) {
        if (cumArr.length < days + 1) return null;
        return (cumArr[cumArr.length - 1] / cumArr[cumArr.length - 1 - days] - 1) * 100;
    }
    const ytdDays = Math.min(numDays, Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 86400000));

    return {
        cumPort, cumSpy, annualizedVol, beta, sharpe, sortino, maxDrawdown: maxDD * 100, alpha: alpha * 100,
        return1m: periodReturn(cumPort, Math.min(22, numDays)),
        return3m: periodReturn(cumPort, Math.min(63, numDays)),
        return6m: periodReturn(cumPort, Math.min(126, numDays)),
        returnYtd: periodReturn(cumPort, Math.min(ytdDays, numDays)),
        return1y: (cumPort[cumPort.length - 1] - 1) * 100,
        benchReturn1m: periodReturn(cumSpy, Math.min(22, numDays)),
        benchReturn3m: periodReturn(cumSpy, Math.min(63, numDays)),
        benchReturn6m: periodReturn(cumSpy, Math.min(126, numDays)),
        benchReturnYtd: periodReturn(cumSpy, Math.min(ytdDays, numDays)),
        benchReturn1y: (cumSpy[cumSpy.length - 1] - 1) * 100
    };
}

// --- CSV parsing for historical portfolio reconstruction ---
function parseActivityCSVs(includeDetails) {
    const years = [2021, 2022, 2023, 2024, 2025, 2026];
    const transactions = [];
    for (const year of years) {
        const filePath = path.join(__dirname, 'data', `DIG_${year}_Activity.csv`);
        try {
            const text = fs.readFileSync(filePath, 'utf8');
            const lines = text.split('\n').filter(l => l.trim());
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                if (parts.length < 12) continue;
                const dateStr = (parts[0] || '').trim();
                if (!dateStr) continue;
                const dp = dateStr.split('/');
                if (dp.length !== 3) continue;
                let yr = parseInt(dp[2]);
                if (yr < 100) yr += 2000;
                const date = new Date(yr, parseInt(dp[0]) - 1, parseInt(dp[1]));
                if (isNaN(date.getTime())) continue;
                const action = (parts[1] || '').trim().toUpperCase();
                const symbol = (parts[2] || '').trim();
                const description = (parts[3] || '').trim();
                const price = parseFloat((parts[5] || '').replace(/[^0-9.\-]/g, '')) || 0;
                const quantity = parseFloat(parts[6]) || 0;
                const amount = parseFloat((parts[10] || '').replace(/[^0-9.\-]/g, '')) || 0;
                let type = null;
                if (action.startsWith('YOU BOUGHT')) type = 'BUY';
                else if (action.startsWith('YOU SOLD')) type = 'SELL';
                else if (action.includes('REINVESTMENT') && symbol && symbol !== 'SPAXX') type = 'BUY'; // dividend reinvestment
                else if (action.startsWith('RECEIVED FROM YOU') && symbol) type = 'TRANSFER_IN'; // share transfer in
                else if (action.startsWith('DELIVERED TO YOU') && symbol) type = 'TRANSFER_OUT'; // share transfer out
                if (type && symbol && symbol !== 'SPAXX' && /^[A-Z]{1,5}$/.test(symbol)) {
                    const tx = { date, symbol, type, quantity: Math.abs(quantity) };
                    if (includeDetails) {
                        tx.price = price;
                        tx.amount = Math.abs(amount);
                        tx.description = description;
                    }
                    // Normalize transfer types for downstream callers
                    if (type === 'TRANSFER_IN') tx.originalType = 'TRANSFER_IN';
                    if (type === 'TRANSFER_OUT') tx.originalType = 'TRANSFER_OUT';
                    transactions.push(tx);
                }
            }
        } catch (e) { /* skip missing files */ }
    }
    transactions.sort((a, b) => a.date - b.date);
    return transactions;
}

function reconstructHistoricalHoldings(currentHoldings, transactions) {
    // currentHoldings: [{symbol, quantity}]
    const sharesMap = {};
    currentHoldings.forEach(h => { sharesMap[h.symbol] = h.quantity; });

    // Walk transactions backwards
    const sortedTx = [...transactions].sort((a, b) => b.date - a.date);
    const snapshots = [{ date: new Date(), holdings: { ...sharesMap } }];

    for (const tx of sortedTx) {
        if (tx.type === 'BUY' || tx.type === 'TRANSFER_IN') {
            sharesMap[tx.symbol] = (sharesMap[tx.symbol] || 0) - Math.abs(tx.quantity);
        } else if (tx.type === 'SELL' || tx.type === 'TRANSFER_OUT') {
            sharesMap[tx.symbol] = (sharesMap[tx.symbol] || 0) + Math.abs(tx.quantity);
        }
        if ((sharesMap[tx.symbol] || 0) <= 0.001) delete sharesMap[tx.symbol];
        snapshots.push({ date: tx.date, holdings: { ...sharesMap } });
    }
    snapshots.reverse();
    return snapshots;
}

// Historical portfolio analytics endpoint
app.post('/api/portfolio/historical-analytics', async (req, res) => {
    try {
        const { currentHoldings, period } = req.body;
        if (!Array.isArray(currentHoldings) || currentHoldings.length === 0) {
            return res.status(400).json({ error: 'currentHoldings array required' });
        }

        const periodDaysMap = { '3m': 70, '6m': 135, 'ytd': null, '1y': 260, '2y': 510, 'all': 1300 };
        let lookbackDays;
        if (period === 'ytd') {
            const jan1 = new Date(new Date().getFullYear(), 0, 1);
            lookbackDays = Math.ceil((Date.now() - jan1) / 86400000) + 10;
        } else {
            lookbackDays = periodDaysMap[period] || 260;
        }

        const toDate = new Date().toISOString().split('T')[0];
        const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const fromDateObj = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

        // Parse transactions and reconstruct holdings
        const transactions = parseActivityCSVs();
        const snapshots = reconstructHistoricalHoldings(currentHoldings, transactions);

        // Collect all unique symbols held during the period
        const allSymbols = new Set();
        snapshots.forEach(s => {
            if (s.date >= fromDateObj || s === snapshots[0]) {
                Object.keys(s.holdings).forEach(sym => allSymbols.add(sym));
            }
        });
        // Also add current holdings symbols
        currentHoldings.forEach(h => allSymbols.add(h.symbol));
        const equitySymbols = [...allSymbols].filter(s => /^[A-Z]{1,5}$/.test(s));

        // Fetch prices in batches
        const BATCH_SIZE = 10;
        const priceMap = {};
        for (let i = 0; i < equitySymbols.length; i += BATCH_SIZE) {
            const batch = equitySymbols.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(
                batch.map(sym => fetchHistoricalPrices(sym, 'day', fromDate, toDate, lookbackDays + 10).catch(() => []))
            );
            batch.forEach((sym, idx) => { priceMap[sym] = results[idx]; });
            if (i + BATCH_SIZE < equitySymbols.length) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        // Ensure SPY is fetched
        if (!priceMap['SPY']) {
            priceMap['SPY'] = await fetchHistoricalPrices('SPY', 'day', fromDate, toDate, lookbackDays + 10).catch(() => []);
        }

        // Build a date index from SPY
        const spyPrices = priceMap['SPY'] || [];
        if (spyPrices.length < 20) {
            return res.json({ error: 'Insufficient benchmark data', partial: true });
        }

        // Build price lookup maps: symbol -> { dateStr -> close }
        const priceLookup = {};
        for (const [sym, prices] of Object.entries(priceMap)) {
            priceLookup[sym] = {};
            prices.forEach(p => {
                const ds = p.date ? p.date.split('T')[0] : '';
                if (ds) priceLookup[sym][ds] = p.close;
            });
        }

        // For each trading day, find applicable holdings snapshot and compute portfolio value
        const dailyValues = [];
        for (const bar of spyPrices) {
            const dateStr = bar.date ? bar.date.split('T')[0] : '';
            const d = new Date(dateStr);

            // Find most recent snapshot <= this date
            let snap = snapshots[0].holdings;
            for (const s of snapshots) {
                if (s.date <= d) snap = s.holdings;
                else break;
            }

            let totalVal = 0;
            for (const [sym, shares] of Object.entries(snap)) {
                const price = priceLookup[sym] && priceLookup[sym][dateStr];
                if (price) totalVal += shares * price;
            }
            dailyValues.push({ date: dateStr, value: totalVal });
        }

        // Compute daily portfolio returns
        const portfolioReturns = [];
        for (let i = 1; i < dailyValues.length; i++) {
            if (dailyValues[i - 1].value > 100) { // skip days with near-zero value
                portfolioReturns.push((dailyValues[i].value - dailyValues[i - 1].value) / dailyValues[i - 1].value);
            } else {
                portfolioReturns.push(0);
            }
        }

        // SPY daily returns
        const spyReturns = [];
        for (let i = 1; i < spyPrices.length; i++) {
            spyReturns.push((spyPrices[i].close - spyPrices[i - 1].close) / spyPrices[i - 1].close);
        }

        const numDays = Math.min(portfolioReturns.length, spyReturns.length);
        const trimmedPortReturns = portfolioReturns.slice(-numDays);
        const trimmedSpyReturns = spyReturns.slice(-numDays);

        // Compute risk metrics
        const metrics = computeRiskMetrics(trimmedPortReturns, trimmedSpyReturns, numDays);
        const { cumPort, cumSpy } = metrics;

        // Build sparkline
        const dates = spyPrices.slice(-numDays - 1).map(p => p.date ? p.date.split('T')[0] : '');
        const sparkPort = [], sparkSpy = [], sparkDates = [];
        const step = numDays <= 70 ? 1 : numDays <= 260 ? Math.max(1, Math.floor(numDays / 65)) : Math.max(1, Math.floor(numDays / 100));
        for (let i = 0; i <= numDays; i += step) {
            sparkPort.push(((cumPort[i] || cumPort[cumPort.length - 1]) - 1) * 100);
            sparkSpy.push(((cumSpy[i] || cumSpy[cumSpy.length - 1]) - 1) * 100);
            sparkDates.push(dates[i] || dates[dates.length - 1]);
        }
        if (sparkPort[sparkPort.length - 1] !== ((cumPort[cumPort.length - 1] - 1) * 100)) {
            sparkPort.push((cumPort[cumPort.length - 1] - 1) * 100);
            sparkSpy.push((cumSpy[cumSpy.length - 1] - 1) * 100);
            sparkDates.push(dates[dates.length - 1]);
        }

        // Per-stock performance (using current holdings for the heatmap)
        const totalWeight = currentHoldings.reduce((s, h) => s + h.quantity, 0) || 1;
        const stockPerf = [];
        for (const h of currentHoldings) {
            const prices = priceMap[h.symbol];
            if (!prices || prices.length < 2) continue;
            const ytdDays = Math.min(prices.length - 1, Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 86400000));
            const lastPrice = prices[prices.length - 1].close;
            const totalPortVal = currentHoldings.reduce((s, hh) => {
                const p = priceMap[hh.symbol];
                return s + (p && p.length ? hh.quantity * p[p.length - 1].close : 0);
            }, 0) || 1;
            stockPerf.push({
                symbol: h.symbol,
                weight: (h.quantity * lastPrice) / totalPortVal * 100,
                ret1d: prices.length >= 2 ? ((prices[prices.length - 1].close / prices[prices.length - 2].close) - 1) * 100 : 0,
                ret1w: prices.length >= 6 ? ((prices[prices.length - 1].close / prices[Math.max(0, prices.length - 6)].close) - 1) * 100 : null,
                ret1m: prices.length >= 22 ? ((prices[prices.length - 1].close / prices[Math.max(0, prices.length - 22)].close) - 1) * 100 : null,
                ret3m: prices.length >= 63 ? ((prices[prices.length - 1].close / prices[Math.max(0, prices.length - 63)].close) - 1) * 100 : null,
                retYtd: ytdDays > 0 && prices.length > ytdDays ? ((prices[prices.length - 1].close / prices[Math.max(0, prices.length - 1 - ytdDays)].close) - 1) * 100 : null,
                price: lastPrice
            });
        }

        res.json({
            portfolio: {
                return1m: metrics.return1m, return3m: metrics.return3m, return6m: metrics.return6m,
                returnYtd: metrics.returnYtd, return1y: metrics.return1y,
                annualizedVol: metrics.annualizedVol, beta: metrics.beta, sharpe: metrics.sharpe,
                sortino: metrics.sortino, maxDrawdown: metrics.maxDrawdown, alpha: metrics.alpha,
                effectivePositions: currentHoldings.length
            },
            benchmark: {
                return1m: metrics.benchReturn1m, return3m: metrics.benchReturn3m, return6m: metrics.benchReturn6m,
                returnYtd: metrics.benchReturnYtd, return1y: metrics.benchReturn1y
            },
            sparkline: { dates: sparkDates, portfolio: sparkPort, spy: sparkSpy },
            stockPerformance: stockPerf,
            dataPoints: numDays,
            mode: 'historical',
            uniqueSymbols: equitySymbols.length,
            snapshotCount: snapshots.length
        });

    } catch (error) {
        console.error('Error calculating historical portfolio analytics:', error.message);
        res.status(500).json({ error: 'Failed to calculate historical analytics' });
    }
});

// Stock history endpoint — full history of every stock ever held
app.post('/api/portfolio/stock-history', async (req, res) => {
    try {
        const { currentHoldings } = req.body;
        if (!Array.isArray(currentHoldings) || currentHoldings.length === 0) {
            return res.status(400).json({ error: 'currentHoldings array required' });
        }

        // Parse all transactions with price/amount details
        const transactions = parseActivityCSVs(true);

        // Build per-symbol ledger
        const symbolMap = {};
        for (const tx of transactions) {
            if (!symbolMap[tx.symbol]) {
                symbolMap[tx.symbol] = {
                    symbol: tx.symbol,
                    description: tx.description || tx.symbol,
                    transactions: [],
                    totalBought: 0,
                    totalSold: 0,
                    totalCostBasis: 0,
                    totalSellProceeds: 0
                };
            }
            const entry = symbolMap[tx.symbol];
            if (tx.description && tx.description.length > entry.description.length) {
                entry.description = tx.description;
            }
            // Normalize type for display: TRANSFER_IN → BUY, TRANSFER_OUT → SELL
            const displayType = tx.type === 'TRANSFER_IN' ? 'BUY' : tx.type === 'TRANSFER_OUT' ? 'SELL' : tx.type;
            const isTransfer = tx.originalType === 'TRANSFER_IN' || tx.originalType === 'TRANSFER_OUT';
            entry.transactions.push({
                date: tx.date.toISOString().split('T')[0],
                type: displayType,
                isTransfer: isTransfer,
                quantity: Math.abs(tx.quantity),
                price: tx.price,
                amount: tx.amount
            });
            if (displayType === 'BUY') {
                entry.totalBought += Math.abs(tx.quantity);
                // For transfers-in, the amount column often has the market value at transfer
                entry.totalCostBasis += tx.amount || (Math.abs(tx.quantity) * tx.price);
            } else if (displayType === 'SELL') {
                entry.totalSold += Math.abs(tx.quantity);
                entry.totalSellProceeds += tx.amount || (Math.abs(tx.quantity) * tx.price);
            }
        }

        // Determine current status and shares for each symbol
        const currentHoldingsMap = {};
        currentHoldings.forEach(h => { currentHoldingsMap[h.symbol] = h.quantity; });

        const allSymbols = Object.keys(symbolMap);
        const toDate = new Date().toISOString().split('T')[0];

        // Fetch current/last prices for all symbols in batches
        const BATCH_SIZE = 10;
        const priceMap = {};
        for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
            const batch = allSymbols.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(
                batch.map(sym => {
                    const entry = symbolMap[sym];
                    const firstDate = entry.transactions[0].date;
                    return fetchHistoricalPrices(sym, 'day', firstDate, toDate, 2000).catch(() => []);
                })
            );
            batch.forEach((sym, idx) => { priceMap[sym] = results[idx]; });
            if (i + BATCH_SIZE < allSymbols.length) {
                await new Promise(r => setTimeout(r, 250));
            }
        }

        // Also fetch SPY for comparison
        const earliestDate = transactions.length > 0 ? transactions[0].date.toISOString().split('T')[0] : '2021-01-01';
        if (!priceMap['SPY']) {
            priceMap['SPY'] = await fetchHistoricalPrices('SPY', 'day', earliestDate, toDate, 2000).catch(() => []);
        }
        const spyPriceLookup = {};
        (priceMap['SPY'] || []).forEach(p => {
            const ds = p.date ? p.date.split('T')[0] : '';
            if (ds) spyPriceLookup[ds] = p.close;
        });
        const spyDates = Object.keys(spyPriceLookup).sort();

        // Also include current holdings that have NO transaction history at all
        for (const h of currentHoldings) {
            if (!symbolMap[h.symbol] && h.symbol !== 'SPAXX') {
                symbolMap[h.symbol] = {
                    symbol: h.symbol,
                    description: h.symbol,
                    transactions: [],
                    totalBought: 0,
                    totalSold: 0,
                    totalCostBasis: 0,
                    totalSellProceeds: 0
                };
                // Fetch prices for this symbol too
                if (!priceMap[h.symbol]) {
                    const fromD = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    priceMap[h.symbol] = await fetchHistoricalPrices(h.symbol, 'day', fromD, toDate, 500).catch(() => []);
                }
            }
        }

        // Build stock-level analytics
        const stocks = [];
        const allSymbolsFinal = Object.keys(symbolMap);
        for (const sym of allSymbolsFinal) {
            const entry = symbolMap[sym];
            const prices = priceMap[sym] || [];
            if (prices.length === 0) continue;

            const isActive = !!currentHoldingsMap[sym] && currentHoldingsMap[sym] > 0.001;
            const currentShares = isActive ? currentHoldingsMap[sym] : 0;
            const firstBuyDate = entry.transactions.length > 0 ? entry.transactions[0].date : prices[0].date.split('T')[0];
            const lastTradeDate = entry.transactions.length > 0 ? entry.transactions[entry.transactions.length - 1].date : prices[prices.length - 1].date.split('T')[0];

            // Current/last price
            const lastPrice = prices[prices.length - 1].close;
            const firstPrice = prices[0].close;

            // Holding period
            const holdStart = new Date(firstBuyDate);
            const holdEnd = isActive ? new Date() : new Date(lastTradeDate);
            const holdingPeriodDays = Math.max(1, Math.round((holdEnd - holdStart) / 86400000));

            // Reconcile shares: check if CSV transactions account for current holdings
            // Net shares from transactions = totalBought - totalSold
            const netSharesFromTx = entry.totalBought - entry.totalSold;
            const hasUnrecordedShares = isActive && (currentShares - netSharesFromTx > 0.5);
            const unrecordedShares = hasUnrecordedShares ? currentShares - netSharesFromTx : 0;

            // If there are unrecorded shares, estimate their cost basis
            // Use the last known buy price, or the earliest price in the remaining period
            let adjustedCostBasis = entry.totalCostBasis;
            if (unrecordedShares > 0) {
                // Find the most recent buy price from transactions, or use earliest available price
                const lastBuyTx = [...entry.transactions].reverse().find(t => t.type === 'BUY');
                const estimatedBuyPrice = lastBuyTx ? lastBuyTx.price : firstPrice;
                adjustedCostBasis += unrecordedShares * estimatedBuyPrice;
            }

            // For stocks with NO buy transactions but currently held (e.g., SPY — only sells in CSV)
            // Estimate cost basis from price at first known date
            if (isActive && entry.totalCostBasis === 0 && entry.totalBought === 0) {
                adjustedCostBasis = currentShares * firstPrice;
            }

            // Calculate total return
            let totalReturn, currentValue;
            if (isActive) {
                currentValue = currentShares * lastPrice;
                totalReturn = adjustedCostBasis > 0 ? ((currentValue + entry.totalSellProceeds - adjustedCostBasis) / adjustedCostBasis) * 100 : 0;
            } else {
                currentValue = 0;
                totalReturn = entry.totalCostBasis > 0 ? ((entry.totalSellProceeds - entry.totalCostBasis) / entry.totalCostBasis) * 100 : 0;
            }

            // CAGR
            const years = holdingPeriodDays / 365.25;
            const totalReturnDecimal = totalReturn / 100;
            const cagr = years > 0.1 && totalReturnDecimal > -1 ? (Math.pow(1 + totalReturnDecimal, 1 / years) - 1) * 100 : totalReturn;

            // Avg cost basis — use adjusted if we imputed missing shares
            const totalSharesForBasis = entry.totalBought + unrecordedShares + (isActive && entry.totalBought === 0 ? currentShares : 0);
            const avgCostBasis = totalSharesForBasis > 0 ? adjustedCostBasis / totalSharesForBasis : 0;

            // Max drawdown from price history
            let peak = 0, maxDD = 0;
            for (const p of prices) {
                if (p.close > peak) peak = p.close;
                const dd = peak > 0 ? ((p.close - peak) / peak) * 100 : 0;
                if (dd < maxDD) maxDD = dd;
            }

            // SPY return over same period — use each stock's actual holding period
            // For each BUY transaction, compute what SPY did from buy date to end date,
            // weighted by the cost of that purchase. This gives a dollar-weighted benchmark return.
            let spyReturnSamePeriod = 0;
            const endDateStr = isActive ? toDate : lastTradeDate;
            const spyEndPrice = spyPriceLookup[endDateStr] || findNearestPrice(spyPriceLookup, spyDates, endDateStr);

            if (sym === 'SPY') {
                // SPY IS the benchmark — alpha is always 0
                spyReturnSamePeriod = totalReturn;
            } else {
                // Dollar-weighted benchmark: what if each $ invested in this stock went into SPY instead?
                const buyTxs = entry.transactions.filter(t => t.type === 'BUY');
                const sellTxs = entry.transactions.filter(t => t.type === 'SELL');

                if (buyTxs.length > 0 && spyEndPrice > 0) {
                    let hypotheticalSpyValue = 0;
                    let totalSpyCost = 0;

                    for (const btx of buyTxs) {
                        const buyAmount = btx.amount || (btx.quantity * btx.price);
                        const spyPriceAtBuy = spyPriceLookup[btx.date] || findNearestPrice(spyPriceLookup, spyDates, btx.date);
                        if (spyPriceAtBuy > 0 && buyAmount > 0) {
                            const spySharesBought = buyAmount / spyPriceAtBuy;
                            hypotheticalSpyValue += spySharesBought * spyEndPrice;
                            totalSpyCost += buyAmount;
                        }
                    }

                    // Account for sells: subtract proportional SPY value at sell dates
                    if (!isActive && sellTxs.length > 0) {
                        // For exited positions, the SPY return is just cost-to-end
                        // since all capital was deployed and then recovered
                    }

                    spyReturnSamePeriod = totalSpyCost > 0 ? ((hypotheticalSpyValue - totalSpyCost) / totalSpyCost) * 100 : 0;
                } else {
                    // Fallback: simple price return from first to last date
                    const spyStart = spyPriceLookup[firstBuyDate] || findNearestPrice(spyPriceLookup, spyDates, firstBuyDate);
                    spyReturnSamePeriod = spyStart > 0 ? ((spyEndPrice - spyStart) / spyStart) * 100 : 0;
                }
            }
            const alpha = totalReturn - spyReturnSamePeriod;

            // Flag benchmark-tracking symbols
            const benchmarkSymbols = ['SPY', 'VOO', 'IVV', 'SPLG', 'SPYM'];
            const isBenchmark = benchmarkSymbols.includes(sym);

            // Price history sampled (max ~200 points for charts)
            const step = Math.max(1, Math.floor(prices.length / 200));
            const sampledPrices = [];
            for (let j = 0; j < prices.length; j += step) {
                sampledPrices.push({ date: prices[j].date.split('T')[0], close: prices[j].close });
            }
            // Always include last point
            if (sampledPrices.length === 0 || sampledPrices[sampledPrices.length - 1].date !== prices[prices.length - 1].date.split('T')[0]) {
                sampledPrices.push({ date: prices[prices.length - 1].date.split('T')[0], close: prices[prices.length - 1].close });
            }

            // Portfolio weight (for active positions)
            const totalPortfolioValue = currentHoldings.reduce((s, h) => {
                const p = priceMap[h.symbol];
                return s + (p && p.length ? h.quantity * p[p.length - 1].close : 0);
            }, 0) || 1;
            const weight = isActive ? (currentValue / totalPortfolioValue) * 100 : 0;

            stocks.push({
                symbol: sym,
                description: entry.description,
                status: isActive ? 'active' : 'exited',
                isBenchmark,
                firstBuyDate,
                lastTradeDate,
                holdingPeriodDays,
                totalSharesBought: Math.round(entry.totalBought * 1000) / 1000,
                totalSharesSold: Math.round(entry.totalSold * 1000) / 1000,
                currentShares: Math.round(currentShares * 1000) / 1000,
                avgCostBasis: Math.round(avgCostBasis * 100) / 100,
                currentPrice: lastPrice,
                totalInvested: Math.round(adjustedCostBasis * 100) / 100,
                totalSellProceeds: Math.round(entry.totalSellProceeds * 100) / 100,
                currentValue: Math.round(currentValue * 100) / 100,
                totalReturn: Math.round(totalReturn * 100) / 100,
                cagr: Math.round(cagr * 100) / 100,
                spyReturnSamePeriod: Math.round(spyReturnSamePeriod * 100) / 100,
                alpha: Math.round(alpha * 100) / 100,
                maxDrawdown: Math.round(maxDD * 100) / 100,
                weight: Math.round(weight * 100) / 100,
                hasEstimatedCost: hasUnrecordedShares || (isActive && entry.totalCostBasis === 0 && entry.totalBought === 0),
                unrecordedShares: Math.round(unrecordedShares * 1000) / 1000,
                transactions: entry.transactions,
                priceHistory: sampledPrices
            });
        }

        // Sort by total return descending
        stocks.sort((a, b) => b.totalReturn - a.totalReturn);

        // Summary stats
        const activeStocks = stocks.filter(s => s.status === 'active');
        const exitedStocks = stocks.filter(s => s.status === 'exited');
        const winners = stocks.filter(s => s.totalReturn > 0);
        const avgReturn = stocks.length > 0 ? stocks.reduce((s, st) => s + st.totalReturn, 0) / stocks.length : 0;
        // Exclude benchmark-tracking stocks from alpha average (SPY, VOO have alpha ~0 by definition)
        const nonBenchmarkStocks = stocks.filter(s => !s.isBenchmark);
        const avgAlpha = nonBenchmarkStocks.length > 0 ? nonBenchmarkStocks.reduce((s, st) => s + st.alpha, 0) / nonBenchmarkStocks.length : 0;

        res.json({
            stocks,
            summary: {
                totalStocksTraded: stocks.length,
                activePositions: activeStocks.length,
                exitedPositions: exitedStocks.length,
                bestPerformer: stocks.length > 0 ? { symbol: stocks[0].symbol, return: stocks[0].totalReturn } : null,
                worstPerformer: stocks.length > 0 ? { symbol: stocks[stocks.length - 1].symbol, return: stocks[stocks.length - 1].totalReturn } : null,
                avgReturn: Math.round(avgReturn * 100) / 100,
                avgAlpha: Math.round(avgAlpha * 100) / 100,
                winRate: stocks.length > 0 ? Math.round((winners.length / stocks.length) * 10000) / 100 : 0
            }
        });

    } catch (error) {
        console.error('Error calculating stock history:', error.message);
        res.status(500).json({ error: 'Failed to calculate stock history' });
    }
});

// Lightweight price history endpoint for What-If analyzer (single symbol)
app.get('/api/portfolio/price-history/:symbol', async (req, res) => {
    try {
        const symbol = (req.params.symbol || '').toUpperCase().trim();
        if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
            return res.status(400).json({ error: 'Invalid symbol' });
        }

        const toDate = new Date().toISOString().split('T')[0];
        const fromDate = '2021-01-01'; // full history back to DIG inception
        const prices = await fetchHistoricalPrices(symbol, 'day', fromDate, toDate, 2000);

        if (!prices || prices.length === 0) {
            return res.status(404).json({ error: 'No price data found for ' + symbol });
        }

        // Sample to max ~500 points for reasonable payload
        const step = Math.max(1, Math.floor(prices.length / 500));
        const sampled = [];
        for (let i = 0; i < prices.length; i += step) {
            sampled.push({ date: prices[i].date.split('T')[0], close: prices[i].close });
        }
        // Always include last point
        if (sampled.length === 0 || sampled[sampled.length - 1].date !== prices[prices.length - 1].date.split('T')[0]) {
            sampled.push({ date: prices[prices.length - 1].date.split('T')[0], close: prices[prices.length - 1].close });
        }

        res.json({ symbol, prices: sampled });
    } catch (error) {
        console.error('Error fetching price history for', req.params.symbol, ':', error.message);
        res.status(500).json({ error: 'Failed to fetch price history' });
    }
});

// Helper: find nearest price in a sorted date map
function findNearestPrice(lookup, sortedDates, targetDate) {
    if (lookup[targetDate]) return lookup[targetDate];
    let best = null;
    for (const d of sortedDates) {
        if (d <= targetDate) best = lookup[d];
        else break;
    }
    return best || (sortedDates.length > 0 ? lookup[sortedDates[0]] : 0);
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Vercel/serverless note:
// - Do NOT call app.listen() in serverless. Vercel will invoke the exported handler.
// - Do NOT start WebSockets / setInterval jobs in serverless.
const isServerless = !!process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION;

if (!isServerless) {
    // Start HTTP server (local/dev)
    const server = app.listen(PORT, () => {
        console.log(`🚀 DIG Portfolio Server running on port ${PORT}`);
        console.log(`📊 Access live portfolio at: http://localhost:${PORT}`);
        console.log(`🧪 Access Tracking Error dashboard at: http://localhost:${PORT}/te`);
        console.log(`🔁 TE API proxy at: http://localhost:${PORT}/api/te/calculate`);
        console.log(`🔑 Polygon.io API Key configured: ${!!POLYGON_API_KEY}`);

        if (!POLYGON_API_KEY) {
            console.log('⚠️  Warning: POLYGON_API_KEY not set. Live data will not work.');
            console.log('   Create a .env file with: POLYGON_API_KEY=your_key_here');
        }
    });
}

module.exports = app;
