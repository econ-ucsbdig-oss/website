/**
 * Portfolio Data Management Module
 * Handles CSV parsing, data processing, and state management
 */

// Global state
let portfolioData = {
    positions: [],
    summary: {},
    historicalData: {},
    lastUpdated: null
};

// Current sector grouping mode: 'gics11' or 'custom6'
let sectorGrouping = 'gics11';

// Sector mapping for holdings
const SECTOR_MAP = {
    'VOO': 'Broad Market',
    'SPY': 'Broad Market',
    'VTV': 'Broad Market',
    'TSM': 'Technology',
    'GOOGL': 'Communication Services',
    'ASML': 'Technology',
    'AMZN': 'Consumer Discretionary',
    'MSFT': 'Technology',
    'NUKZ': 'Energy',
    'COST': 'Consumer Staples',
    'VRT': 'Industrials',
    'IHI': 'Healthcare',
    'SNOW': 'Technology',
    'JPM': 'Financials',
    'FCX': 'Materials',
    'CEG': 'Utilities',
    'PANW': 'Technology',
    'BLD': 'Industrials',
    'SCHW': 'Financials',
    'DXCM': 'Healthcare',
    'FLUT': 'Consumer Discretionary',
    'PSA': 'Real Estate',
    'HIMS': 'Healthcare',
    'SPAXX': 'Cash'
};

// Index funds (broad market ETFs)
const INDEX_FUNDS = ['VOO', 'SPY', 'VTV'];

// Categorize holdings
function categorizeHolding(symbol) {
    if (INDEX_FUNDS.includes(symbol)) {
        return 'Index Fund';
    }
    return 'DIG Equity';
}

/**
 * Parse CSV data into structured format
 */
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    const positions = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < headers.length) continue;

        const position = {
            accountNumber: values[0],
            accountName: values[1],
            symbol: values[2],
            description: values[3],
            quantity: parseFloat(values[4]) || 0,
            lastPrice: parseCurrency(values[5]),
            lastPriceChange: parseCurrency(values[6]),
            currentValue: parseCurrency(values[7]),
            todayGainDollar: parseCurrency(values[8]),
            todayGainPercent: parsePercent(values[9]),
            totalGainDollar: parseCurrency(values[10]),
            totalGainPercent: parsePercent(values[11]),
            percentOfAccount: parsePercent(values[12]),
            costBasisTotal: parseCurrency(values[13]),
            averageCostBasis: parseCurrency(values[14]),
            type: values[15],
            sector: SECTOR_MAP[values[2]] || 'Other',
            category: categorizeHolding(values[2])
        };

        // Skip cash/money market for some calculations
        if (position.symbol !== 'SPAXX') {
            positions.push(position);
        }
    }

    return positions;
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current.trim());
    return values;
}

/**
 * Parse currency string to number
 */
function parseCurrency(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/[$,()]/g, '').replace(/\s/g, '')) || 0;
}

/**
 * Parse percentage string to decimal
 */
function parsePercent(str) {
    if (!str) return 0;
    return parseFloat(str.replace('%', '').replace(/\s/g, '')) / 100 || 0;
}

/**
 * Format number as currency
 */
function formatCurrency(num) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

/**
 * Format number as percentage
 */
function formatPercent(num, decimals = 2) {
    return (num * 100).toFixed(decimals) + '%';
}

/**
 * Format number with sign
 */
function formatChange(num) {
    const sign = num >= 0 ? '+' : '';
    return sign + formatCurrency(num);
}

/**
 * Calculate portfolio summary statistics
 */
function calculateSummary(positions) {
    const totalValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0);
    const totalCostBasis = positions.reduce((sum, pos) => sum + pos.costBasisTotal, 0);
    const totalGain = totalValue - totalCostBasis;
    const totalGainPercent = totalGain / totalCostBasis;
    const todayGain = positions.reduce((sum, pos) => sum + pos.todayGainDollar, 0);
    const todayGainPercent = todayGain / (totalValue - todayGain);

    // Sort by value to find top holding (exclude index funds)
    const nonIndexHoldings = positions.filter(p => !INDEX_FUNDS.includes(p.symbol));
    const sorted = [...nonIndexHoldings].sort((a, b) => b.currentValue - a.currentValue);
    const topHolding = sorted[0] || positions[0]; // Fallback to any holding if needed

    return {
        totalValue,
        totalCostBasis,
        totalGain,
        totalGainPercent,
        todayGain,
        todayGainPercent,
        numHoldings: positions.length,
        topHolding: {
            symbol: topHolding.symbol,
            value: topHolding.currentValue,
            percent: topHolding.percentOfAccount
        }
    };
}

/**
 * Calculate portfolio composition (Index vs DIG Equity)
 */
function calculateComposition(positions) {
    const totalValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0);
    const indexValue = positions.filter(p => INDEX_FUNDS.includes(p.symbol))
        .reduce((sum, pos) => sum + pos.currentValue, 0);
    const equityValue = positions.filter(p => !INDEX_FUNDS.includes(p.symbol))
        .reduce((sum, pos) => sum + pos.currentValue, 0);

    return {
        index: {
            value: indexValue,
            percent: indexValue / totalValue
        },
        equity: {
            value: equityValue,
            percent: equityValue / totalValue
        }
    };
}

/**
 * Calculate sector allocations
 */
function calculateSectorAllocations(positions) {
    const sectorTotals = {};
    const totalValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0);

    positions.forEach(pos => {
        if (!sectorTotals[pos.sector]) {
            sectorTotals[pos.sector] = 0;
        }
        sectorTotals[pos.sector] += pos.currentValue;
    });

    const sectors = Object.keys(sectorTotals).map(sector => ({
        sector,
        value: sectorTotals[sector],
        percent: sectorTotals[sector] / totalValue
    })).sort((a, b) => b.value - a.value);

    return sectors;
}

/**
 * Calculate DIG Equity sector breakdown (excludes index funds)
 */
function calculateDigEquitySectors(positions) {
    const digEquity = positions.filter(p => !INDEX_FUNDS.includes(p.symbol));
    return calculateSectorAllocations(digEquity);
}

/**
 * Aggregate sectors into 6 custom groups
 */
function aggregateTo6Sectors(sectors) {
    const aggregated = {
        'Tech & Communication': 0,
        'Consumer': 0,
        'Utilities & Real Estate': 0,
        'Materials & Industrials': 0,
        'Healthcare': 0,
        'Financials': 0
    };

    sectors.forEach(s => {
        const sector = s.sector;
        if (sector === 'Technology' || sector === 'Communication Services') {
            aggregated['Tech & Communication'] += s.value;
        } else if (sector === 'Consumer Discretionary' || sector === 'Consumer Staples') {
            aggregated['Consumer'] += s.value;
        } else if (sector === 'Utilities' || sector === 'Real Estate') {
            aggregated['Utilities & Real Estate'] += s.value;
        } else if (sector === 'Materials' || sector === 'Industrials') {
            aggregated['Materials & Industrials'] += s.value;
        } else if (sector === 'Healthcare') {
            aggregated['Healthcare'] += s.value;
        } else if (sector === 'Financials') {
            aggregated['Financials'] += s.value;
        } else {
            // Energy, Other, etc.
            aggregated['Materials & Industrials'] += s.value;
        }
    });

    const totalValue = Object.values(aggregated).reduce((sum, v) => sum + v, 0);
    return Object.keys(aggregated)
        .map(sector => ({
            sector,
            value: aggregated[sector],
            percent: aggregated[sector] / totalValue
        }))
        .filter(s => s.value > 0)
        .sort((a, b) => b.value - a.value);
}

/**
 * Load portfolio data from CSV file
 */
async function loadPortfolioData() {
    try {
        const response = await fetch('Portfolio_Positions_Jan-16-2026.csv');

        if (!response.ok) {
            throw new Error(`Failed to load CSV file: ${response.status} ${response.statusText}`);
        }

        const csvText = await response.text();

        if (!csvText || csvText.trim().length === 0) {
            throw new Error('CSV file is empty');
        }

        const positions = parseCSV(csvText);

        if (!positions || positions.length === 0) {
            throw new Error('No positions found in CSV file');
        }

        console.log(`✅ Loaded ${positions.length} positions from CSV`);

        // Fetch current prices and update position values
        await updateCurrentPrices(positions);

        const summary = calculateSummary(positions);
        const composition = calculateComposition(positions);
        const sectors = calculateSectorAllocations(positions);
        const digEquitySectors = calculateDigEquitySectors(positions);

        portfolioData = {
            positions,
            summary,
            composition,
            sectors,
            digEquitySectors,
            lastUpdated: new Date()
        };

        return portfolioData;
    } catch (error) {
        console.error('Error loading portfolio data:', error);
        alert(`Error loading portfolio data: ${error.message}\n\nPlease make sure:\n1. The server is running (npm start)\n2. The CSV file exists: Portfolio_Positions_Jan-16-2026.csv`);
        throw error;
    }
}

/**
 * Fetch current prices and update position values
 * Uses the most recent available price (close if market closed, open if intraday)
 */
async function updateCurrentPrices(positions) {
    const apiKey = localStorage.getItem('POLYGON_API_KEY') || window.POLYGON_API_KEY;

    if (!apiKey) {
        console.warn('⚠️ Polygon.io API key not found. Using prices from CSV file.');
        console.warn('To fetch current prices, set API key: localStorage.setItem("POLYGON_API_KEY", "your-key")');
        return;
    }

    console.log('🔄 Fetching current prices from Polygon.io...');

    const symbols = [...new Set(positions.map(p => p.symbol))];
    const priceUpdates = {};

    // Fetch latest prices for all symbols
    for (const symbol of symbols) {
        try {
            const latestPrice = await fetchLatestPrice(symbol, apiKey);
            if (latestPrice) {
                priceUpdates[symbol] = latestPrice;
                console.log(`✅ ${symbol}: $${latestPrice.price.toFixed(2)} (${latestPrice.source})`);
            }
        } catch (error) {
            console.warn(`⚠️ Failed to fetch price for ${symbol}:`, error.message);
        }
    }

    // Update positions with new prices
    positions.forEach(position => {
        const update = priceUpdates[position.symbol];
        if (update) {
            const oldPrice = position.lastPrice;
            const newPrice = update.price;

            // Update price
            position.lastPrice = newPrice;
            position.lastPriceChange = newPrice - oldPrice;

            // Recalculate current value
            position.currentValue = position.quantity * newPrice;

            // Recalculate today's gain (vs previous close)
            const priceChange = update.previousClose ? (newPrice - update.previousClose) : 0;
            position.todayGainDollar = position.quantity * priceChange;
            position.todayGainPercent = update.previousClose ? priceChange / update.previousClose : 0;

            // Keep original cost basis and total return calculations
            // (these depend on historical cost basis from CSV)
        }
    });

    console.log(`✅ Updated prices for ${Object.keys(priceUpdates).length} symbols`);
}

/**
 * Fetch the most recent price for a symbol
 * Returns close price if market has closed, otherwise returns open price
 */
async function fetchLatestPrice(symbol, apiKey) {
    // Get last 2 trading days to ensure we have previous close
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7); // Go back 7 days to account for weekends

    const from = formatDateForAPI(fromDate);
    const to = formatDateForAPI(toDate);

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=5&apiKey=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'ERROR') {
        throw new Error(data.error || data.message || 'API error');
    }

    if (!data.results || data.results.length === 0) {
        throw new Error('No price data available');
    }

    // Results are sorted descending, so first result is most recent
    const latestBar = data.results[0];
    const previousBar = data.results[1];

    // Check if the latest bar is today
    const latestDate = new Date(latestBar.t);
    const today = new Date();
    const isToday = latestDate.toDateString() === today.toDateString();

    // Determine which price to use
    let price, source;

    if (isToday && latestBar.c) {
        // If we have today's close, use it (market has closed)
        price = latestBar.c;
        source = 'close';
    } else if (isToday && latestBar.o) {
        // If we only have today's open (market still open), use it
        price = latestBar.o;
        source = 'open';
    } else {
        // Use most recent close
        price = latestBar.c;
        source = 'previous close';
    }

    return {
        price: price,
        source: source,
        previousClose: previousBar ? previousBar.c : null,
        date: latestDate
    };
}

/**
 * Fetch historical prices from Polygon.io
 * This will create synthetic historical performance based on current holdings
 */
async function fetchHistoricalData(timeRange = '3Y') {
    try {
        // Determine date range
        const toDate = new Date();
        let fromDate = new Date();

        switch(timeRange) {
            case '1Y':
                fromDate.setFullYear(fromDate.getFullYear() - 1);
                break;
            case '3Y':
                fromDate.setFullYear(fromDate.getFullYear() - 3);
                break;
            case 'MAX':
                fromDate = new Date('2022-01-01'); // Inception
                break;
        }

        const from = formatDateForAPI(fromDate);
        const to = formatDateForAPI(toDate);

        // Get unique symbols (exclude cash)
        const symbols = [...new Set(portfolioData.positions.map(p => p.symbol))];

        // Fetch data for all symbols
        const priceData = {};
        for (const symbol of symbols) {
            const prices = await fetchPricesForSymbol(symbol, from, to);
            if (prices) {
                priceData[symbol] = prices;
            }
        }

        // Calculate portfolio value over time
        const portfolioHistory = calculatePortfolioHistory(priceData);

        // Fetch benchmark data
        const spxeData = await fetchBenchmarkData('SPY', from, to); // Using SPY as proxy
        const spyData = await fetchBenchmarkData('SPY', from, to);

        portfolioData.historicalData = {
            timeRange,
            portfolioHistory,
            benchmarks: {
                SPXE: spxeData,
                SPY: spyData
            }
        };

        return portfolioData.historicalData;
    } catch (error) {
        console.error('Error fetching historical data:', error);
        throw error;
    }
}

/**
 * Fetch prices for a single symbol from Polygon.io
 *
 * IMPORTANT: You need to provide your Polygon.io API key
 * Option 1: Set it in localStorage: localStorage.setItem('POLYGON_API_KEY', 'your-key')
 * Option 2: Add it to this file (not recommended for public repos)
 */
async function fetchPricesForSymbol(symbol, from, to) {
    try {
        // Get API key from localStorage or environment
        const apiKey = localStorage.getItem('POLYGON_API_KEY') || window.POLYGON_API_KEY;

        if (!apiKey) {
            console.warn('Polygon.io API key not found. Please set it in localStorage: localStorage.setItem("POLYGON_API_KEY", "your-key")');
            return null;
        }

        console.log(`Fetching prices for ${symbol} from ${from} to ${to}`);

        // Direct call to Polygon.io API
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${apiKey}`;

        const response = await fetch(url);

        if (!response.ok) {
            console.error(`API error for ${symbol}: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();

        if (data.status === 'ERROR') {
            console.error(`Polygon.io error for ${symbol}:`, data.error || data.message);
            return null;
        }

        if (data.results && data.results.length > 0) {
            console.log(`✅ Fetched ${data.results.length} price points for ${symbol}`);
            return data.results.map(bar => ({
                date: new Date(bar.t),
                close: bar.c,
                open: bar.o,
                high: bar.h,
                low: bar.l,
                volume: bar.v
            }));
        }

        console.warn(`No results for ${symbol} from ${from} to ${to}`);
        return null;
    } catch (error) {
        console.error(`Error fetching prices for ${symbol}:`, error);
        return null;
    }
}

/**
 * Calculate portfolio value over time using current holdings
 */
function calculatePortfolioHistory(priceData) {
    // Get all dates from price data
    const allDates = new Set();
    Object.values(priceData).forEach(prices => {
        if (prices) {
            prices.forEach(p => allDates.add(p.date.toISOString().split('T')[0]));
        }
    });

    const sortedDates = Array.from(allDates).sort();
    const history = [];

    sortedDates.forEach(date => {
        let totalValue = 0;

        portfolioData.positions.forEach(position => {
            const symbolPrices = priceData[position.symbol];
            if (symbolPrices) {
                // Find price for this date
                const priceData = symbolPrices.find(p =>
                    p.date.toISOString().split('T')[0] === date
                );

                if (priceData) {
                    totalValue += position.quantity * priceData.close;
                }
            }
        });

        if (totalValue > 0) {
            history.push({
                date: new Date(date),
                value: totalValue
            });
        }
    });

    return history;
}

/**
 * Fetch benchmark data
 */
async function fetchBenchmarkData(symbol, from, to) {
    const prices = await fetchPricesForSymbol(symbol, from, to);
    if (!prices) return null;

    // Normalize to 100 at start
    const firstPrice = prices[0].close;
    return prices.map(p => ({
        date: p.date,
        value: (p.close / firstPrice) * 100
    }));
}

/**
 * Format date for API (YYYY-MM-DD)
 */
function formatDateForAPI(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Initialize the dashboard
 */
async function initDashboard() {
    try {
        showLoading(true);

        // Load portfolio data
        await loadPortfolioData();

        // Update summary cards
        updateSummaryCards();

        // Populate holdings table
        populateHoldingsTable();

        // Create sector chart
        createSectorChart();

        // Fetch and display historical data (3Y default) - only if API key is available
        try {
            await fetchHistoricalData('3Y');
            createPerformanceChart();
        } catch (error) {
            console.error('Error loading historical data:', error);
            // Show message in chart area
            const chartCanvas = document.getElementById('performanceChart');
            if (chartCanvas) {
                const ctx = chartCanvas.getContext('2d');
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.font = '14px Segoe UI';
                ctx.textAlign = 'center';
                ctx.fillText('Performance chart error - check console', chartCanvas.width / 2, chartCanvas.height / 2 - 20);
                ctx.fillText(error.message || 'Unknown error', chartCanvas.width / 2, chartCanvas.height / 2 + 10);
            }
        }

        // Generate particles
        generateParticles();

        showLoading(false);
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showLoading(false);
        alert('Error loading portfolio data. Please check console for details.');
    }
}

/**
 * Show/hide loading overlay
 */
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = show ? 'flex' : 'none';
}

/**
 * Update summary cards with portfolio data
 */
function updateSummaryCards() {
    const { summary, composition, lastUpdated } = portfolioData;

    document.getElementById('totalValue').textContent = formatCurrency(summary.totalValue);
    document.getElementById('totalValueChange').textContent =
        `${formatChange(summary.todayGain)} (${formatPercent(summary.todayGainPercent)})`;
    document.getElementById('totalValueChange').className =
        'card-change ' + (summary.todayGain >= 0 ? 'positive' : 'negative');

    document.getElementById('indexPercent').textContent = `Index: ${formatPercent(composition.index.percent)}`;
    document.getElementById('equityPercent').textContent = `Equity: ${formatPercent(composition.equity.percent)}`;

    document.getElementById('numHoldings').textContent = summary.numHoldings;
    document.getElementById('cashPosition').textContent = 'Cash: $3,204.92'; // From CSV

    document.getElementById('topHoldingSymbol').textContent = summary.topHolding.symbol;
    document.getElementById('topHoldingPercent').textContent =
        `${formatPercent(summary.topHolding.percent)} of portfolio`;

    document.getElementById('lastUpdated').textContent =
        `Last Updated: ${lastUpdated.toLocaleString()}`;
}

/**
 * Populate holdings table
 */
function populateHoldingsTable() {
    const tbody = document.getElementById('holdingsTableBody');
    tbody.innerHTML = '';

    if (!portfolioData || !portfolioData.positions || portfolioData.positions.length === 0) {
        console.error('No portfolio positions available');
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">No positions to display</td></tr>';
        return;
    }

    portfolioData.positions.forEach(position => {
        if (!position || !position.symbol || !position.description) {
            console.warn('Skipping invalid position:', position);
            return;
        }

        const row = document.createElement('tr');

        row.innerHTML = `
            <td class="symbol-cell" onclick="showStockTearsheet('${position.symbol}')">${position.symbol}</td>
            <td>${position.description.substring(0, 40)}${position.description.length > 40 ? '...' : ''}</td>
            <td>${position.sector || 'Unknown'}</td>
            <td>${(position.quantity || 0).toFixed(3)}</td>
            <td>${formatCurrency(position.lastPrice || 0)}</td>
            <td>${formatCurrency(position.currentValue || 0)}</td>
            <td>${formatPercent(position.percentOfAccount || 0)}</td>
            <td class="${(position.todayGainDollar || 0) >= 0 ? 'positive-value' : 'negative-value'}">
                ${formatChange(position.todayGainDollar || 0)} (${formatPercent(position.todayGainPercent || 0)})
            </td>
            <td class="${(position.totalGainDollar || 0) >= 0 ? 'positive-value' : 'negative-value'}">
                ${formatChange(position.totalGainDollar || 0)} (${formatPercent(position.totalGainPercent || 0)})
            </td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Sort table by column
 */
let sortDirection = 1;
let lastSortColumn = -1;

function sortTable(columnIndex) {
    const tbody = document.getElementById('holdingsTableBody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    // Toggle sort direction if same column
    if (columnIndex === lastSortColumn) {
        sortDirection *= -1;
    } else {
        sortDirection = 1;
        lastSortColumn = columnIndex;
    }

    rows.sort((a, b) => {
        let aVal = a.cells[columnIndex].textContent.trim();
        let bVal = b.cells[columnIndex].textContent.trim();

        // Try to parse as number
        const aNum = parseFloat(aVal.replace(/[$,%()]/g, ''));
        const bNum = parseFloat(bVal.replace(/[$,%()]/g, ''));

        if (!isNaN(aNum) && !isNaN(bNum)) {
            return (aNum - bNum) * sortDirection;
        }

        // String comparison
        return aVal.localeCompare(bVal) * sortDirection;
    });

    rows.forEach(row => tbody.appendChild(row));
}

/**
 * Refresh data
 */
async function refreshData() {
    const btn = document.getElementById('refreshBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Refreshing...';

    try {
        await initDashboard();
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Data';
    }
}

/**
 * Change time range for performance chart
 */
async function changeTimeRange(timeRange) {
    // Update active button
    const clickedButton = event.target;
    clickedButton.parentElement.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    clickedButton.classList.add('active');

    // Fetch new data
    showLoading(true);
    await fetchHistoricalData(timeRange);
    createPerformanceChart();
    showLoading(false);
}

/**
 * Change sector grouping (11 GICS vs 6 custom)
 */
function changeSectorGrouping(grouping) {
    // Update active button
    const clickedButton = event.target;
    clickedButton.parentElement.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    clickedButton.classList.add('active');

    // Update global state
    sectorGrouping = grouping;

    // If in drilldown view, recreate the sector chart
    if (currentSectorView === 'drilldown') {
        createSectorChart();
    }
}

/**
 * Generate portfolio tearsheet
 */
async function generatePortfolioTearsheet() {
    const btn = document.getElementById('tearsheetBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating PDF...';

    try {
        // Prepare data in format expected by tearsheet-generator.js
        const portfolioForTearsheet = portfolioData.positions.map(pos => ({
            symbol: pos.symbol,
            description: pos.description,
            quantity: pos.quantity,
            lastPrice: pos.lastPrice,
            marketValue: pos.currentValue,
            sector: pos.sector,
            dayChange: pos.todayGainPercent,
            totalReturn: pos.totalGainPercent,
            costBasis: pos.costBasisTotal
        }));

        // Call existing generator (from tearsheet-generator.js)
        await TearSheetGenerator.generate(portfolioForTearsheet, {
            companyName: 'UCSB Dean\'s Investment Group',
            logo: 'DIG',
            contactInfo: 'University of California, Santa Barbara',
            disclaimer: 'This report is for informational purposes only and does not constitute investment advice.',
            includeCharts: true,
            includeDetailedHoldings: true,
            includeSectorAnalysis: true
        });
    } catch (error) {
        console.error('Error generating tearsheet:', error);
        alert('Error generating tearsheet. Please check console for details.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-file-pdf"></i> Generate Tearsheet';
    }
}

/**
 * Show individual stock tearsheet
 */
async function showStockTearsheet(symbol) {
    const position = portfolioData.positions.find(p => p.symbol === symbol);
    if (!position) {
        alert(`Position ${symbol} not found`);
        return;
    }

    try {
        // Use simple tearsheet generator
        if (typeof SimpleTearSheetGenerator !== 'undefined') {
            // Pass the full holding data
            const holdingData = {
                symbol: position.symbol,
                name: position.description,
                description: position.description,
                sector: position.sector,
                quantity: position.quantity,
                lastPrice: position.lastPrice,
                marketValue: position.currentValue,
                costBasis: position.costBasisTotal,
                avgCostBasis: position.averageCostBasis,
                totalReturn: position.totalGainPercent,
                totalReturnDollar: position.totalGainDollar,
                dayChange: position.todayGainPercent,
                dayChangeDollar: position.todayGainDollar
            };

            await SimpleTearSheetGenerator.generate(holdingData);
        } else {
            alert(`Tearsheet generator not loaded. Please refresh the page.`);
        }
    } catch (error) {
        console.error(`Error generating tearsheet for ${symbol}:`, error);
        alert(`Error generating tearsheet for ${symbol}: ${error.message}`);
    }
}

/**
 * Generate portfolio-level tearsheet
 */
async function generatePortfolioTearsheet() {
    try {
        if (typeof PortfolioTearSheetGenerator !== 'undefined') {
            await PortfolioTearSheetGenerator.generate(portfolioData);
        } else {
            alert('Portfolio tearsheet generator not loaded. Please refresh the page.');
        }
    } catch (error) {
        console.error('Error generating portfolio tearsheet:', error);
        alert(`Error generating portfolio tearsheet: ${error.message}`);
    }
}

/**
 * Export portfolio to CSV
 */
function exportToCSV() {
    let csv = 'Symbol,Company,Sector,Quantity,Price,Value,Weight%,Day Change,Total Return\n';

    portfolioData.positions.forEach(pos => {
        csv += `${pos.symbol},"${pos.description}",${pos.sector},${pos.quantity},${pos.lastPrice},${pos.currentValue},${pos.percentOfAccount},${pos.todayGainPercent},${pos.totalGainPercent}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DIG_Portfolio_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

/**
 * Generate particle animation
 */
function generateParticles() {
    const container = document.getElementById('particles');
    const particleCount = window.innerWidth < 768 ? 30 : 50;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';

        // Random type
        const types = ['gold', 'blue', 'white'];
        particle.classList.add(types[Math.floor(Math.random() * types.length)]);

        // Random size and position
        const size = Math.random() * 6 + 4;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 12 + 's';
        particle.style.animationDuration = (Math.random() * 8 + 8) + 's';

        container.appendChild(particle);
    }
}

// Initialize dashboard when page loads
window.addEventListener('DOMContentLoaded', initDashboard);
