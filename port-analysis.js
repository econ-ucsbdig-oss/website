/**
 * PORT Analysis - Clean Implementation
 * Bloomberg-style sector analysis with proper return calculation
 */

// Configuration
let config = {
    benchmark: 'SPX',
    sectorGrouping: 'gics11',
    timePeriod: 'YTD'
};

// Data storage
let portfolioData = null;
let benchmarkConstituents = null;
let sectorMap = null;

// Sector aggregation map (11 sectors -> 6 sectors)
const SECTOR_AGGREGATION_MAP = {
    'Technology': 'Technology',
    'Communication Services': 'Technology',
    'Consumer Discretionary': 'Consumer',
    'Consumer Staples': 'Consumer',
    'Healthcare': 'Healthcare',
    'Financials': 'Financials',
    'Industrials': 'Industrials',
    'Materials': 'Industrials',
    'Energy': 'Energy',
    'Utilities': 'Utilities',
    'Real Estate': 'Real Estate'
};

/**
 * Initialize the page
 */
async function init() {
    console.log('Initializing PORT Analysis...');

    // Load sector map
    await loadSectorMap();

    // Load portfolio data
    await loadPortfolioData();

    // Load benchmark constituents
    await loadBenchmarkConstituents();

    console.log('✅ Initialization complete');
}

/**
 * Load sector mapping from portfolio-config.js
 */
async function loadSectorMap() {
    if (typeof SECTOR_MAP !== 'undefined') {
        sectorMap = SECTOR_MAP;
        console.log('✅ Sector map loaded');
    } else {
        console.error('❌ SECTOR_MAP not found');
    }
}

/**
 * Load portfolio positions from CSV
 */
async function loadPortfolioData() {
    try {
        const response = await fetch('Portfolio_Positions_Jan-16-2026.csv');
        const text = await response.text();

        const lines = text.trim().split('\n');
        portfolioData = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length < 14) continue;

            const symbol = values[2].trim();
            const quantity = parseFloat(values[4]) || 0;
            const lastPriceStr = values[5].replace(/[$,\s]/g, '');
            const lastPrice = parseFloat(lastPriceStr) || 0;
            const costBasisTotalStr = values[13].replace(/[$,\s"]/g, '');
            const costBasisTotal = parseFloat(costBasisTotalStr) || 0;

            // Skip index funds and cash
            const indexFunds = ['VOO', 'VTV', 'SPY', 'SPAXX'];
            if (indexFunds.includes(symbol)) continue;

            const sector = sectorMap[symbol] || 'Other';
            const currentValue = quantity * lastPrice;

            portfolioData.push({
                symbol,
                quantity,
                lastPrice,
                currentValue,
                costBasisTotal,
                sector
            });
        }

        console.log(`✅ Loaded ${portfolioData.length} active portfolio positions`);
    } catch (error) {
        console.error('❌ Error loading portfolio data:', error);
        throw error;
    }
}

/**
 * Parse a CSV line properly (handles quoted values with commas)
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
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current);

    return values;
}

/**
 * Load benchmark constituents
 */
async function loadBenchmarkConstituents() {
    try {
        const spxResponse = await fetch('vooholdings.csv');
        const spxText = await spxResponse.text();

        const spxeResponse = await fetch('SPXE Holdings-3.csv');
        const spxeText = await spxeResponse.text();

        benchmarkConstituents = {
            SPX: parseConstituentsCSV(spxText),
            SPXE: parseConstituentsCSV(spxeText)
        };

        console.log(`✅ Loaded SPX: ${benchmarkConstituents.SPX.length} constituents`);
        console.log(`✅ Loaded SPXE: ${benchmarkConstituents.SPXE.length} constituents`);
    } catch (error) {
        console.error('❌ Error loading benchmark constituents:', error);
        throw error;
    }
}

/**
 * Parse constituents CSV
 */
function parseConstituentsCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const constituents = [];

    for (let i = 1; i < lines.length; i++) {
        const [ticker, weightStr] = lines[i].split(',');
        if (!ticker || !weightStr) continue;

        const weight = parseFloat(weightStr.replace('%', ''));
        const sector = sectorMap[ticker.trim()] || 'Other';

        constituents.push({
            ticker: ticker.trim(),
            weight: weight,
            sector: sector
        });
    }

    return constituents;
}

/**
 * Set benchmark
 */
function setBenchmark(benchmark) {
    config.benchmark = benchmark;

    document.getElementById('benchmarkSPX').classList.toggle('active', benchmark === 'SPX');
    document.getElementById('benchmarkSPXE').classList.toggle('active', benchmark === 'SPXE');
}

/**
 * Set sector grouping
 */
function setSectorGrouping(grouping) {
    config.sectorGrouping = grouping;

    document.getElementById('sectors11').classList.toggle('active', grouping === 'gics11');
    document.getElementById('sectors6').classList.toggle('active', grouping === 'custom6');
}

/**
 * Set time period
 */
function setTimePeriod(period) {
    config.timePeriod = period;

    document.getElementById('periodYTD').classList.toggle('active', period === 'YTD');
    document.getElementById('period1Y').classList.toggle('active', period === '1Y');
    document.getElementById('period3Y').classList.toggle('active', period === '3Y');
}

/**
 * Run the analysis
 */
async function runAnalysis() {
    console.log('Running analysis with config:', config);

    const resultsPanel = document.getElementById('resultsPanel');
    const resultsBody = document.getElementById('resultsBody');

    // Show loading state
    resultsPanel.style.display = 'block';
    resultsBody.innerHTML = '<tr><td colspan="9" class="loading"><i class="fas fa-spinner fa-spin"></i><div>Calculating sector analysis...</div></td></tr>';

    try {
        // Step 1: Calculate normalized portfolio weights (exclude "Other")
        const portfolioSectors = calculatePortfolioSectorsNormalized();

        // Step 2: Calculate normalized benchmark weights (exclude "Other")
        const benchmarkSectors = calculateBenchmarkSectorsNormalized();

        // Step 3: Fetch returns for the selected time period
        const returns = await fetchReturns();

        // Step 4: Calculate sector returns
        const portfolioReturns = calculateSectorReturns(portfolioSectors, returns, 'portfolio');
        const benchmarkReturns = calculateSectorReturns(benchmarkSectors, returns, 'benchmark');

        // Step 5: Calculate attribution
        const attribution = calculateAttribution(portfolioSectors, benchmarkSectors, portfolioReturns, benchmarkReturns);

        // Step 6: Display results
        displayResults(attribution);

    } catch (error) {
        console.error('❌ Error running analysis:', error);
        resultsBody.innerHTML = `<tr><td colspan="9" class="error"><strong>Error:</strong> ${error.message}</td></tr>`;
    }
}

/**
 * Calculate portfolio sector weights (normalized, excluding "Other")
 */
function calculatePortfolioSectorsNormalized() {
    const sectors = {};
    let totalValue = 0;

    // First pass: aggregate by sector
    portfolioData.forEach(position => {
        let sector = position.sector;

        // Apply aggregation if custom6
        if (config.sectorGrouping === 'custom6') {
            sector = SECTOR_AGGREGATION_MAP[sector] || sector;
        }

        // Skip "Other" sector
        if (sector === 'Other') return;

        if (!sectors[sector]) {
            sectors[sector] = {
                weight: 0,
                value: 0,
                positions: []
            };
        }

        sectors[sector].value += position.currentValue;
        sectors[sector].positions.push(position);
        totalValue += position.currentValue;
    });

    // Second pass: normalize weights to 100%
    Object.keys(sectors).forEach(sector => {
        sectors[sector].weight = (sectors[sector].value / totalValue) * 100;
    });

    console.log('Portfolio sectors (normalized):', sectors);
    return sectors;
}

/**
 * Calculate benchmark sector weights (normalized, excluding "Other")
 */
function calculateBenchmarkSectorsNormalized() {
    const constituents = benchmarkConstituents[config.benchmark];
    const sectors = {};
    let totalWeight = 0;

    // First pass: aggregate by sector
    constituents.forEach(constituent => {
        let sector = constituent.sector;

        // Apply aggregation if custom6
        if (config.sectorGrouping === 'custom6') {
            sector = SECTOR_AGGREGATION_MAP[sector] || sector;
        }

        // Skip "Other" sector
        if (sector === 'Other') return;

        if (!sectors[sector]) {
            sectors[sector] = {
                weight: 0,
                constituents: []
            };
        }

        sectors[sector].weight += constituent.weight;
        sectors[sector].constituents.push(constituent);
        totalWeight += constituent.weight;
    });

    // Second pass: normalize weights to 100%
    Object.keys(sectors).forEach(sector => {
        sectors[sector].weight = (sectors[sector].weight / totalWeight) * 100;
    });

    console.log('Benchmark sectors (normalized):', sectors);
    return sectors;
}

/**
 * Fetch returns for all tickers using start/end prices only
 */
async function fetchReturns() {
    const apiKey = localStorage.getItem('POLYGON_API_KEY') || window.POLYGON_API_KEY;

    if (!apiKey) {
        throw new Error('Polygon API key not found. Please set it in portfolio-config.js or localStorage.');
    }

    // Calculate date range based on time period
    const endDate = new Date();
    const startDate = new Date();

    switch (config.timePeriod) {
        case 'YTD':
            startDate.setFullYear(endDate.getFullYear(), 0, 1); // January 1st of current year
            break;
        case '1Y':
            startDate.setFullYear(endDate.getFullYear() - 1);
            break;
        case '3Y':
            startDate.setFullYear(endDate.getFullYear() - 3);
            break;
    }

    const from = formatDate(startDate);
    const to = formatDate(endDate);

    // Get all unique tickers from portfolio and benchmark
    const portfolioTickers = [...new Set(portfolioData.map(p => p.symbol))];
    const benchmarkTickers = [...new Set(benchmarkConstituents[config.benchmark].map(c => c.ticker))];
    const allTickers = [...new Set([...portfolioTickers, ...benchmarkTickers])];

    console.log(`Fetching returns for ${allTickers.length} tickers from ${from} to ${to}`);

    const returns = {};
    const batchSize = 5;

    for (let i = 0; i < allTickers.length; i += batchSize) {
        const batch = allTickers.slice(i, i + batchSize);
        const promises = batch.map(ticker => fetchTickerReturn(ticker, from, to, apiKey));
        const results = await Promise.all(promises);

        results.forEach((result, idx) => {
            returns[batch[idx]] = result;
        });

        // Rate limiting
        if (i + batchSize < allTickers.length) {
            await sleep(250);
        }
    }

    return returns;
}

/**
 * Fetch return for a single ticker (start to end price only)
 */
async function fetchTickerReturn(ticker, from, to, apiKey) {
    try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.results && data.results.length >= 2) {
            const startPrice = data.results[0].c; // First close price
            const endPrice = data.results[data.results.length - 1].c; // Last close price
            const returnPct = ((endPrice - startPrice) / startPrice) * 100;
            return returnPct;
        }

        return 0;
    } catch (error) {
        console.warn(`Failed to fetch return for ${ticker}:`, error);
        return 0;
    }
}

/**
 * Calculate sector returns (weighted average of constituent returns)
 */
function calculateSectorReturns(sectors, returns, type) {
    const sectorReturns = {};

    Object.keys(sectors).forEach(sector => {
        const sectorData = sectors[sector];
        let weightedReturn = 0;

        if (type === 'portfolio') {
            // For portfolio: weight by current value within the sector
            const sectorValue = sectorData.value;
            sectorData.positions.forEach(position => {
                const positionReturn = returns[position.symbol] || 0;
                const positionWeight = position.currentValue / sectorValue;
                weightedReturn += positionReturn * positionWeight;
            });
        } else {
            // For benchmark: weight by benchmark weight within the sector
            const sectorWeight = sectorData.weight;
            sectorData.constituents.forEach(constituent => {
                const constituentReturn = returns[constituent.ticker] || 0;
                const constituentWeight = constituent.weight / sectorWeight;
                weightedReturn += constituentReturn * constituentWeight;
            });
        }

        sectorReturns[sector] = weightedReturn;
    });

    return sectorReturns;
}

/**
 * Calculate attribution (selection and allocation effects)
 */
function calculateAttribution(portfolioSectors, benchmarkSectors, portfolioReturns, benchmarkReturns) {
    const allSectors = new Set([...Object.keys(portfolioSectors), ...Object.keys(benchmarkSectors)]);
    const attribution = [];

    allSectors.forEach(sector => {
        const portWeight = portfolioSectors[sector]?.weight || 0;
        const bmWeight = benchmarkSectors[sector]?.weight || 0;
        const portReturn = portfolioReturns[sector] || 0;
        const bmReturn = benchmarkReturns[sector] || 0;

        // Selection effect: (Portfolio Return - Benchmark Return) * Benchmark Weight
        const selection = (portReturn - bmReturn) * (bmWeight / 100);

        // Allocation effect: (Portfolio Weight - Benchmark Weight) * Benchmark Return
        const allocation = ((portWeight - bmWeight) / 100) * bmReturn;

        attribution.push({
            sector,
            portWeight,
            bmWeight,
            activeWeight: portWeight - bmWeight,
            portReturn,
            bmReturn,
            activeReturn: portReturn - bmReturn,
            selection,
            allocation
        });
    });

    // Sort by absolute active weight
    attribution.sort((a, b) => Math.abs(b.activeWeight) - Math.abs(a.activeWeight));

    return attribution;
}

/**
 * Display results in table
 */
function displayResults(attribution) {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';

    // Calculate totals
    let totalSelection = 0;
    let totalAllocation = 0;

    attribution.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.sector}</td>
            <td>${row.portWeight.toFixed(2)}</td>
            <td>${row.bmWeight.toFixed(2)}</td>
            <td class="${row.activeWeight >= 0 ? 'positive' : 'negative'}">${row.activeWeight >= 0 ? '+' : ''}${row.activeWeight.toFixed(2)}</td>
            <td class="${row.portReturn >= 0 ? 'positive' : 'negative'}">${row.portReturn >= 0 ? '+' : ''}${row.portReturn.toFixed(2)}</td>
            <td class="${row.bmReturn >= 0 ? 'positive' : 'negative'}">${row.bmReturn >= 0 ? '+' : ''}${row.bmReturn.toFixed(2)}</td>
            <td class="${row.activeReturn >= 0 ? 'positive' : 'negative'}">${row.activeReturn >= 0 ? '+' : ''}${row.activeReturn.toFixed(2)}</td>
            <td class="${row.selection >= 0 ? 'positive' : 'negative'}">${row.selection >= 0 ? '+' : ''}${row.selection.toFixed(2)}</td>
            <td class="${row.allocation >= 0 ? 'positive' : 'negative'}">${row.allocation >= 0 ? '+' : ''}${row.allocation.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);

        totalSelection += row.selection;
        totalAllocation += row.allocation;
    });

    // Add totals row
    const totalRow = document.createElement('tr');
    totalRow.style.fontWeight = 'bold';
    totalRow.style.borderTop = '2px solid rgba(254, 188, 17, 0.3)';
    totalRow.innerHTML = `
        <td>TOTAL</td>
        <td colspan="6"></td>
        <td class="${totalSelection >= 0 ? 'positive' : 'negative'}">${totalSelection >= 0 ? '+' : ''}${totalSelection.toFixed(2)}</td>
        <td class="${totalAllocation >= 0 ? 'positive' : 'negative'}">${totalAllocation >= 0 ? '+' : ''}${totalAllocation.toFixed(2)}</td>
    `;
    tbody.appendChild(totalRow);
}

/**
 * Utility functions
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', init);
