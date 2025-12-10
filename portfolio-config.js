// Portfolio Configuration
// This file contains settings and utilities for the live portfolio system

const PORTFOLIO_CONFIG = {
    // Alpha Vantage API settings
    API_BASE_URL: 'https://www.alphavantage.co/query',
    RATE_LIMIT_DELAY: 1000, // 1 second between API calls
    BATCH_SIZE: 5, // Number of symbols to process simultaneously
    
    // Portfolio data refresh intervals
    REFRESH_INTERVALS: {
        LIVE_MODE: 5 * 60 * 1000, // 5 minutes
        STATIC_MODE: 0 // No auto refresh
    },
    
    // Sector color mapping for charts
    SECTOR_COLORS: {
        'Technology': '#003660',
        'Broad Market': '#0056b3',
        'Healthcare': '#007bff',
        'Financials': '#4dabf7',
        'Consumer Discretionary': '#74c0fc',
        'Communication Services': '#a5d8ff',
        'Industrials': '#d0ebff',
        'Energy': '#28a745',
        'Utilities': '#20c997',
        'Consumer Staples': '#ffc107',
        'Materials': '#fd7e14',
        'Real Estate': '#dc3545'
    },
    
    // Tear sheet template settings
    TEAR_SHEET: {
        COMPANY_NAME: 'UCSB Dean\'s Investment Group',
        DISCLAIMER: 'This report is for informational purposes only and does not constitute investment advice. Past performance does not guarantee future results.',
        LOGO_TEXT: 'DIG',
        CONTACT_INFO: 'University of California, Santa Barbara'
    }
};

// Utility functions for portfolio calculations
const PortfolioUtils = {
    /**
     * Calculate total portfolio value
     */
    calculateTotalValue(portfolioData) {
        return portfolioData.reduce((sum, holding) => {
            return sum + (holding.quantity * holding.lastPrice);
        }, 0);
    },
    
    /**
     * Calculate total day change
     */
    calculateDayChange(portfolioData) {
        return portfolioData.reduce((sum, holding) => {
            return sum + (holding.change ? holding.quantity * holding.change : 0);
        }, 0);
    },
    
    /**
     * Calculate sector allocations
     */
    calculateSectorAllocations(portfolioData) {
        const totalValue = this.calculateTotalValue(portfolioData);
        const sectorData = {};
        
        portfolioData.forEach(holding => {
            const marketValue = holding.quantity * holding.lastPrice;
            const percentage = (marketValue / totalValue) * 100;
            
            if (sectorData[holding.sector]) {
                sectorData[holding.sector] += percentage;
            } else {
                sectorData[holding.sector] = percentage;
            }
        });
        
        return sectorData;
    },
    
    /**
     * Get top holdings by market value
     */
    getTopHoldings(portfolioData, count = 10) {
        return [...portfolioData]
            .sort((a, b) => (b.quantity * b.lastPrice) - (a.quantity * a.lastPrice))
            .slice(0, count);
    },
    
    /**
     * Format currency values
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    },
    
    /**
     * Format percentage values
     */
    formatPercent(value, decimals = 2) {
        return `${(value >= 0 ? '+' : '')}${value.toFixed(decimals)}%`;
    },
    
    /**
     * Calculate portfolio statistics
     */
    calculateStats(portfolioData) {
        const totalValue = this.calculateTotalValue(portfolioData);
        const totalDayChange = this.calculateDayChange(portfolioData);
        const dayChangePercent = (totalDayChange / (totalValue - totalDayChange)) * 100;
        const topHoldings = this.getTopHoldings(portfolioData, 5);
        const sectorAllocations = this.calculateSectorAllocations(portfolioData);
        
        return {
            totalValue,
            totalDayChange,
            dayChangePercent,
            numberOfHoldings: portfolioData.length,
            topHoldings,
            sectorAllocations,
            largestPosition: topHoldings[0],
            largestPositionPercent: ((topHoldings[0].quantity * topHoldings[0].lastPrice) / totalValue) * 100
        };
    }
};

// API utilities for Alpha Vantage integration
const APIUtils = {
    /**
     * Test API connection
     */
    async testConnection(apiKey) {
        try {
            const response = await fetch(`${PORTFOLIO_CONFIG.API_BASE_URL}?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${apiKey}`);
            const data = await response.json();
            return data['Global Quote'] ? true : false;
        } catch (error) {
            console.error('API test failed:', error);
            return false;
        }
    },
    
    /**
     * Fetch live price for a single symbol
     */
    async fetchPrice(symbol, apiKey) {
        try {
            const response = await fetch(`${PORTFOLIO_CONFIG.API_BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`);
            const data = await response.json();
            
            if (data['Global Quote']) {
                const quote = data['Global Quote'];
                return {
                    symbol,
                    price: parseFloat(quote['05. price']),
                    change: parseFloat(quote['09. change']),
                    changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
                    timestamp: new Date()
                };
            }
            return null;
        } catch (error) {
            console.error(`Error fetching price for ${symbol}:`, error);
            return null;
        }
    },
    
    /**
     * Batch fetch prices with rate limiting
     */
    async fetchPricesBatch(symbols, apiKey, onProgress = null) {
        const results = [];
        
        for (let i = 0; i < symbols.length; i += PORTFOLIO_CONFIG.BATCH_SIZE) {
            const batch = symbols.slice(i, i + PORTFOLIO_CONFIG.BATCH_SIZE);
            
            const batchPromises = batch.map(symbol => this.fetchPrice(symbol, apiKey));
            const batchResults = await Promise.all(batchPromises);
            
            results.push(...batchResults.filter(result => result !== null));
            
            // Progress callback
            if (onProgress) {
                onProgress(Math.min(i + PORTFOLIO_CONFIG.BATCH_SIZE, symbols.length), symbols.length);
            }
            
            // Rate limiting delay between batches
            if (i + PORTFOLIO_CONFIG.BATCH_SIZE < symbols.length) {
                await new Promise(resolve => setTimeout(resolve, PORTFOLIO_CONFIG.RATE_LIMIT_DELAY));
            }
        }
        
        return results;
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PORTFOLIO_CONFIG, PortfolioUtils, APIUtils };
}
