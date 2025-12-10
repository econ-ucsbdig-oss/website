const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log(`CORS blocked origin: ${origin}`);
            callback(null, true); // Allow anyway for development
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('.'));

// Debug middleware to log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} from ${req.get('origin') || 'direct'}`);
    next();
});

// Store for rate limiting
const apiCalls = new Map();

// Rate limiting configuration
const API_RATE_LIMIT = parseInt(process.env.API_RATE_LIMIT) || 60;

// Rate limiting helper
function checkRateLimit(key, maxCalls = API_RATE_LIMIT, windowMs = 60000) {
    const now = Date.now();
    const calls = apiCalls.get(key) || [];
    
    // Remove old calls outside the window
    const recentCalls = calls.filter(time => now - time < windowMs);
    
    if (recentCalls.length >= maxCalls) {
        return false;
    }
    
    recentCalls.push(now);
    apiCalls.set(key, recentCalls);
    return true;
}

// Alpha Vantage API helper
async function fetchStockData(symbol) {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    
    if (!apiKey) {
        throw new Error('Alpha Vantage API key not configured');
    }
    
    const response = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`);
    const data = await response.json();
    
    if (data['Global Quote']) {
        const quote = data['Global Quote'];
        return {
            symbol,
            price: parseFloat(quote['05. price']),
            change: parseFloat(quote['09. change']),
            changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
            timestamp: new Date().toISOString(),
            high: parseFloat(quote['03. high']),
            low: parseFloat(quote['04. low']),
            volume: parseInt(quote['06. volume'])
        };
    } else if (data['Error Message']) {
        throw new Error(data['Error Message']);
    } else if (data['Note']) {
        throw new Error('API rate limit reached');
    } else {
        throw new Error('Invalid response from Alpha Vantage');
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'live-portfolio.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!process.env.ALPHA_VANTAGE_API_KEY
    });
});

// Get individual stock data
app.get('/api/stock/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const clientIP = req.ip;
        
        // Rate limiting check
        if (!checkRateLimit(clientIP, 30, 60000)) {
            return res.status(429).json({ 
                error: 'Too many requests. Please try again later.' 
            });
        }
        
        if (!symbol || symbol.length > 10) {
            return res.status(400).json({ error: 'Invalid symbol' });
        }
        
        const stockData = await fetchStockData(symbol.toUpperCase());
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

// Batch stock data endpoint
app.post('/api/stocks/batch', async (req, res) => {
    try {
        const { symbols } = req.body;
        const clientIP = req.ip;
        
        if (!Array.isArray(symbols) || symbols.length === 0) {
            return res.status(400).json({ error: 'Invalid symbols array' });
        }
        
        if (symbols.length > 25) {
            return res.status(400).json({ error: 'Too many symbols (max 25)' });
        }
        
        // Rate limiting for batch requests
        if (!checkRateLimit(clientIP, 5, 60000)) {
            return res.status(429).json({ 
                error: 'Too many batch requests. Please try again later.' 
            });
        }
        
        const results = [];
        const errors = [];
        
        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            
            try {
                const stockData = await fetchStockData(symbol.toUpperCase());
                results.push(stockData);
                
                // Delay between API calls to respect Alpha Vantage limits
                if (i < symbols.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                
            } catch (error) {
                console.error(`Error fetching ${symbol}:`, error.message);
                errors.push({ symbol, error: error.message });
            }
        }
        
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

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 DIG Portfolio Server running on port ${PORT}`);
    console.log(`📊 Access live portfolio at: http://localhost:${PORT}`);
    console.log(`🔑 API Key configured: ${!!process.env.ALPHA_VANTAGE_API_KEY}`);
    
    if (!process.env.ALPHA_VANTAGE_API_KEY) {
        console.log('⚠️  Warning: ALPHA_VANTAGE_API_KEY not set. Live data will not work.');
        console.log('   Create a .env file with: ALPHA_VANTAGE_API_KEY=your_key_here');
    }
});

module.exports = app;
