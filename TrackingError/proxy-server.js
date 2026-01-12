const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// ===== POLYGON.IO CONFIGURATION =====
// API key loaded from .env file (never commit .env to git!)
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Tier loaded from .env file: 'free' or 'paid'
// free: 5 calls/minute (12 second delay)
// paid: unlimited calls (no delay)
const POLYGON_TIER = process.env.POLYGON_TIER || 'free';

// ===== RATE LIMITING CONFIGURATION =====
const RATE_LIMITS = {
    yahoo: {
        REQUESTS_PER_SECOND: 2,
        DELAY_BETWEEN_REQUESTS: 500,
        MAX_RETRIES: 3,
        RETRY_DELAY: 2000
    },
    polygon_free: {
        CALLS_PER_MINUTE: 5,
        DELAY_BETWEEN_REQUESTS: 12000, // 12 seconds
        MAX_RETRIES: 3,
        RETRY_DELAY: 2000
    },
    polygon_paid: {
        CALLS_PER_MINUTE: 0, // unlimited
        DELAY_BETWEEN_REQUESTS: 100, // minimal delay for safety
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000
    }
};

// Legacy Yahoo Finance configuration (kept for backwards compatibility)
const REQUESTS_PER_SECOND = 2;
const DELAY_BETWEEN_REQUESTS = 1000 / REQUESTS_PER_SECOND;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

// Request queue
const requestQueue = [];
let isProcessing = false;
let lastRequestTime = 0;

// Process queue with rate limiting
async function processQueue() {
    if (isProcessing || requestQueue.length === 0) {
        return;
    }

    isProcessing = true;

    while (requestQueue.length > 0) {
        const { ticker, period1, period2, interval, res, retryCount } = requestQueue.shift();

        // Rate limiting: ensure minimum delay between requests
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        if (timeSinceLastRequest < DELAY_BETWEEN_REQUESTS) {
            await sleep(DELAY_BETWEEN_REQUESTS - timeSinceLastRequest);
        }

        try {
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=${interval}`;

            console.log(`[${new Date().toISOString()}] Fetching: ${ticker} (Queue: ${requestQueue.length} remaining)`);

            const response = await fetch(yahooUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            lastRequestTime = Date.now();

            // Handle 429 (rate limit) with retry
            if (response.status === 429) {
                if (retryCount < MAX_RETRIES) {
                    console.warn(`[${new Date().toISOString()}] Rate limited for ${ticker}, retrying in ${RETRY_DELAY}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

                    // Put it back in the queue with increased retry count
                    await sleep(RETRY_DELAY);
                    requestQueue.unshift({ ticker, period1, period2, interval, res, retryCount: retryCount + 1 });
                    continue;
                } else {
                    console.error(`[${new Date().toISOString()}] Max retries reached for ${ticker}`);
                    return res.status(429).json({
                        error: `Rate limited after ${MAX_RETRIES} retries`
                    });
                }
            }

            if (!response.ok) {
                console.error(`[${new Date().toISOString()}] Failed to fetch ${ticker}: ${response.status} ${response.statusText}`);
                return res.status(response.status).json({
                    error: `Yahoo Finance returned ${response.status}`
                });
            }

            const data = await response.json();
            console.log(`[${new Date().toISOString()}] ✓ Success: ${ticker}`);
            res.json(data);

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error fetching ${ticker}:`, error.message);
            res.status(500).json({ error: error.message });
        }
    }

    isProcessing = false;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Proxy endpoint with queuing
app.get('/api/yahoo', async (req, res) => {
    const { ticker, period1, period2, interval } = req.query;

    if (!ticker || !period1 || !period2 || !interval) {
        return res.status(400).json({
            error: 'Missing required parameters: ticker, period1, period2, interval'
        });
    }

    // Add to queue
    requestQueue.push({ ticker, period1, period2, interval, res, retryCount: 0 });
    console.log(`[${new Date().toISOString()}] Queued: ${ticker} (Queue size: ${requestQueue.length})`);

    // Start processing if not already running
    processQueue();
});

// ===== POLYGON.IO ENDPOINT =====
// Polygon request queue
const polygonQueue = [];
let isProcessingPolygon = false;
let lastPolygonRequestTime = 0;

// Get rate limit config based on tier
function getPolygonRateLimit() {
    return POLYGON_TIER === 'paid' ? RATE_LIMITS.polygon_paid : RATE_LIMITS.polygon_free;
}

// Process Polygon queue with rate limiting
async function processPolygonQueue() {
    if (isProcessingPolygon || polygonQueue.length === 0) {
        return;
    }

    isProcessingPolygon = true;
    const rateLimit = getPolygonRateLimit();

    while (polygonQueue.length > 0) {
        const { ticker, timespan, from, to, res, retryCount } = polygonQueue.shift();

        // Rate limiting: ensure minimum delay between requests
        const now = Date.now();
        const timeSinceLastRequest = now - lastPolygonRequestTime;
        if (timeSinceLastRequest < rateLimit.DELAY_BETWEEN_REQUESTS) {
            await sleep(rateLimit.DELAY_BETWEEN_REQUESTS - timeSinceLastRequest);
        }

        try {
            const polygonUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;

            console.log(`[${new Date().toISOString()}] Fetching Polygon: ${ticker} (Queue: ${polygonQueue.length} remaining)`);

            const response = await fetch(polygonUrl);
            lastPolygonRequestTime = Date.now();

            // Handle 429 (rate limit) with retry
            if (response.status === 429) {
                if (retryCount < rateLimit.MAX_RETRIES) {
                    console.warn(`[${new Date().toISOString()}] Rate limited for ${ticker}, retrying in ${rateLimit.RETRY_DELAY}ms (attempt ${retryCount + 1}/${rateLimit.MAX_RETRIES})`);

                    await sleep(rateLimit.RETRY_DELAY);
                    polygonQueue.unshift({ ticker, timespan, from, to, res, retryCount: retryCount + 1 });
                    continue;
                } else {
                    console.error(`[${new Date().toISOString()}] Max retries reached for ${ticker}`);
                    return res.status(429).json({
                        error: `Rate limited after ${rateLimit.MAX_RETRIES} retries`
                    });
                }
            }

            if (!response.ok) {
                console.error(`[${new Date().toISOString()}] Failed to fetch ${ticker}: ${response.status} ${response.statusText}`);
                return res.status(response.status).json({
                    error: `Polygon API returned ${response.status}`,
                    ticker: ticker
                });
            }

            const data = await response.json();
            console.log(`[${new Date().toISOString()}] ✓ Success: ${ticker}`);
            res.json(data);

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error fetching ${ticker}:`, error.message);
            res.status(500).json({ error: error.message, ticker: ticker });
        }
    }

    isProcessingPolygon = false;
}

// Polygon proxy endpoint
app.get('/api/polygon', async (req, res) => {
    const { ticker, timespan, from, to } = req.query;

    if (!ticker || !timespan || !from || !to) {
        return res.status(400).json({
            error: 'Missing required parameters: ticker, timespan, from, to'
        });
    }

    if (!POLYGON_API_KEY || POLYGON_API_KEY === 'YOUR_POLYGON_API_KEY_HERE') {
        return res.status(500).json({
            error: 'Polygon API key not configured in proxy server'
        });
    }

    // Add to queue
    polygonQueue.push({ ticker, timespan, from, to, res, retryCount: 0 });
    console.log(`[${new Date().toISOString()}] Queued Polygon: ${ticker} (Queue size: ${polygonQueue.length})`);

    // Start processing if not already running
    processPolygonQueue();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Proxy server is running',
        queueSize: requestQueue.length,
        polygonQueueSize: polygonQueue.length,
        isProcessing: isProcessing,
        isProcessingPolygon: isProcessingPolygon,
        polygonTier: POLYGON_TIER,
        polygonConfigured: POLYGON_API_KEY !== 'YOUR_POLYGON_API_KEY_HERE'
    });
});

app.listen(PORT, () => {
    console.log(`\n✅ Multi-API Proxy Server running on http://localhost:${PORT}`);
    console.log(`📊 Yahoo Finance: ${REQUESTS_PER_SECOND} requests/second`);
    console.log(`📊 Polygon.io: ${POLYGON_TIER} tier (${POLYGON_TIER === 'paid' ? 'unlimited' : '5 calls/min'})`);
    console.log(`🔄 Max retries: ${MAX_RETRIES}`);
    console.log(`⏱️  Retry delay: ${RETRY_DELAY}ms\n`);
});
