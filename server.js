const express = require('express');
const cors = require('cors');
const path = require('path');
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
    res.sendFile(path.join(__dirname, 'portfolio.html'));
});

app.get('/valuation', (req, res) => {
    res.sendFile(path.join(__dirname, 'valuation.html'));
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
