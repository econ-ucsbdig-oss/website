/**
 * Portfolio Charts Module
 * Handles Chart.js visualizations for portfolio dashboard
 */

let performanceChart = null;
let sectorChart = null;
let currentSectorView = 'composition'; // 'composition', 'drilldown', or 'holdings'
let currentSelectedSector = null; // Track which sector is selected for holdings view

/**
 * Create composition pie chart (Index vs DIG Equity)
 * This is the top-level view that can be drilled down
 */
function createSectorChart() {
    const ctx = document.getElementById('sectorChart').getContext('2d');

    // Destroy existing chart if it exists
    if (sectorChart) {
        sectorChart.destroy();
    }

    // Update reset button visibility
    updateResetButtonVisibility();

    // Check which view to display
    if (currentSectorView === 'composition') {
        createCompositionChart(ctx);
    } else if (currentSectorView === 'drilldown') {
        createDrilldownChart(ctx);
    } else if (currentSectorView === 'holdings') {
        createHoldingsChart(ctx);
    }
}

/**
 * Update reset button visibility based on current view
 */
function updateResetButtonVisibility() {
    const resetBtn = document.getElementById('resetSectorBtn');
    if (resetBtn) {
        // Show button when not in composition view
        resetBtn.style.display = currentSectorView === 'composition' ? 'none' : 'inline-flex';
    }
}

/**
 * Reset sector view back to composition (top level)
 */
function resetSectorView() {
    currentSectorView = 'composition';
    currentSelectedSector = null;
    createSectorChart();
}

/**
 * Create top-level composition chart
 */
function createCompositionChart(ctx) {
    const composition = portfolioData.composition;
    const labels = ['Index Funds', 'DIG Equity'];
    const data = [composition.index.value, composition.equity.value];
    const percentages = [composition.index.percent, composition.equity.percent];

    const colors = ['#0056b3', '#febc11']; // Blue for Index, Gold for DIG Equity

    sectorChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#ffffff',
                        padding: 15,
                        font: {
                            size: 12,
                            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            return data.labels.map((label, i) => ({
                                text: `${label}: ${formatPercent(percentages[i])}`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                fontColor: '#ffffff',
                                hidden: false,
                                index: i
                            }));
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Click "DIG Equity" to see sector breakdown',
                    color: '#ffffff',
                    font: {
                        size: 11,
                        weight: 'normal',
                        style: 'italic'
                    },
                    padding: {
                        top: 5,
                        bottom: 10
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 20, 25, 0.95)',
                    titleColor: '#febc11',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(254, 188, 17, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed;
                            const percent = percentages[context.dataIndex];
                            return [
                                `Value: ${formatCurrency(value)}`,
                                `Weight: ${formatPercent(percent)}`,
                                context.dataIndex === 1 ? '(Click to drill down)' : ''
                            ];
                        }
                    }
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    // Only drill down on DIG Equity (index 1)
                    if (index === 1) {
                        currentSectorView = 'drilldown';
                        createSectorChart();
                    }
                }
            },
            onHover: (event, elements) => {
                event.native.target.style.cursor = elements.length > 0 && elements[0].index === 1 ? 'pointer' : 'default';
            }
        }
    });
}

/**
 * Create sector drilldown chart (DIG Equity breakdown)
 */
function createDrilldownChart(ctx) {
    // Use aggregated sectors if in custom6 mode
    let sectors = portfolioData.digEquitySectors;
    if (sectorGrouping === 'custom6') {
        sectors = aggregateTo6Sectors(sectors);
    }

    const labels = sectors.map(s => s.sector);
    const data = sectors.map(s => s.value);
    const percentages = sectors.map(s => s.percent);

    // Use colors from portfolio-config.js or defaults
    const colorMap = PORTFOLIO_CONFIG?.SECTOR_COLORS || {
        'Technology': '#003660',
        'Communication Services': '#a5d8ff',
        'Consumer Discretionary': '#74c0fc',
        'Consumer Staples': '#ffc107',
        'Healthcare': '#007bff',
        'Financials': '#4dabf7',
        'Industrials': '#d0ebff',
        'Materials': '#fd7e14',
        'Utilities': '#20c997',
        'Energy': '#28a745',
        'Real Estate': '#dc3545',
        'Other': '#6c757d',
        // Custom 6-sector colors
        'Tech & Communication': '#003660',
        'Consumer': '#74c0fc',
        'Utilities & Real Estate': '#20c997',
        'Materials & Industrials': '#d0ebff',
        'Healthcare': '#007bff',
        'Financials': '#4dabf7'
    };

    const colors = labels.map(label => colorMap[label] || '#6c757d');

    sectorChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#ffffff',
                        padding: 15,
                        font: {
                            size: 12,
                            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            return data.labels.map((label, i) => ({
                                text: `${label}: ${formatPercent(percentages[i])}`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                hidden: false,
                                index: i,
                                fontColor: '#ffffff'
                            }));
                        }
                    }
                },
                title: {
                    display: true,
                    text: sectorGrouping === 'custom6'
                        ? 'DIG Equity - 6 Sectors (Click sector for holdings)'
                        : 'DIG Equity - 11 Sectors (Click sector for holdings)',
                    color: '#ffffff',
                    font: {
                        size: 12,
                        weight: '600'
                    },
                    padding: {
                        top: 5,
                        bottom: 10
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 20, 25, 0.95)',
                    titleColor: '#febc11',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(254, 188, 17, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed;
                            const percent = percentages[context.dataIndex];
                            return [
                                `Value: ${formatCurrency(value)}`,
                                `Weight: ${formatPercent(percent)}`
                            ];
                        }
                    }
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    // Clicked on a sector - drill down to holdings
                    const index = elements[0].index;
                    currentSelectedSector = labels[index];
                    currentSectorView = 'holdings';
                    createSectorChart();
                } else {
                    // Clicked on empty area - go back to composition view
                    currentSectorView = 'composition';
                    createSectorChart();
                }
            },
            onHover: (event) => {
                event.native.target.style.cursor = 'pointer';
            }
        }
    });
}

/**
 * Create holdings chart (third drilldown level - individual stocks in a sector)
 */
function createHoldingsChart(ctx) {
    if (!currentSelectedSector) {
        console.warn('No sector selected for holdings view');
        return;
    }

    // Get holdings for the selected sector
    // First determine which sector key to use based on current grouping
    let holdings;

    if (sectorGrouping === 'custom6') {
        // For aggregated sectors, we need to map holdings to the aggregated sector names
        const sectorMapping = {
            'Tech & Communication': ['Technology', 'Communication Services'],
            'Consumer': ['Consumer Discretionary', 'Consumer Staples'],
            'Utilities & Real Estate': ['Utilities', 'Real Estate'],
            'Materials & Industrials': ['Materials', 'Industrials', 'Energy', 'Other'],
            'Healthcare': ['Healthcare'],
            'Financials': ['Financials']
        };

        const sourceSectors = sectorMapping[currentSelectedSector] || [currentSelectedSector];
        holdings = portfolioData.positions.filter(p =>
            !INDEX_FUNDS.includes(p.symbol) && sourceSectors.includes(p.sector)
        );
    } else {
        // For GICS 11, filter directly by sector
        holdings = portfolioData.positions.filter(p =>
            !INDEX_FUNDS.includes(p.symbol) && p.sector === currentSelectedSector
        );
    }

    if (holdings.length === 0) {
        console.warn(`No holdings found for sector: ${currentSelectedSector}`);
        return;
    }

    // Sort by value descending
    holdings.sort((a, b) => b.currentValue - a.currentValue);

    const labels = holdings.map(h => h.symbol);
    const data = holdings.map(h => h.currentValue);
    const totalValue = data.reduce((sum, v) => sum + v, 0);
    const percentages = data.map(v => v / totalValue);

    // Use varied colors for individual holdings
    const colors = holdings.map((h, i) => {
        const baseColors = ['#003660', '#007bff', '#4dabf7', '#74c0fc', '#a5d8ff', '#d0ebff', '#febc11', '#ffd700', '#20c997', '#28a745'];
        return baseColors[i % baseColors.length];
    });

    sectorChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#ffffff',
                        padding: 10,
                        font: {
                            size: 11,
                            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                        },
                        generateLabels: function(chart) {
                            const data = chart.data;
                            // Limit to top 8 for readability
                            return data.labels.slice(0, 8).map((label, i) => ({
                                text: `${label}: ${formatPercent(percentages[i])}`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                fontColor: '#ffffff',
                                hidden: false,
                                index: i
                            }));
                        }
                    }
                },
                title: {
                    display: true,
                    text: `${currentSelectedSector} - Holdings (Click to go back)`,
                    color: '#ffffff',
                    font: {
                        size: 12,
                        weight: '600'
                    },
                    padding: {
                        top: 5,
                        bottom: 10
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 20, 25, 0.95)',
                    titleColor: '#febc11',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(254, 188, 17, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const holding = holdings[context.dataIndex];
                            const value = context.parsed;
                            const percent = percentages[context.dataIndex];
                            return [
                                `Value: ${formatCurrency(value)}`,
                                `Weight: ${formatPercent(percent)}`,
                                `Quantity: ${holding.quantity.toFixed(3)}`,
                                `Price: ${formatCurrency(holding.lastPrice)}`
                            ];
                        },
                        afterLabel: function(context) {
                            const holding = holdings[context.dataIndex];
                            return `(Click symbol for tearsheet)`;
                        }
                    }
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    // Clicked on a holding - show tearsheet
                    const index = elements[0].index;
                    const symbol = holdings[index].symbol;
                    showStockTearsheet(symbol);
                } else {
                    // Clicked on empty area - go back to sector view
                    currentSectorView = 'drilldown';
                    createSectorChart();
                }
            },
            onHover: (event) => {
                event.native.target.style.cursor = 'pointer';
            }
        }
    });
}

/**
 * Create performance line chart with benchmarks
 */
function createPerformanceChart() {
    const ctx = document.getElementById('performanceChart').getContext('2d');

    // Destroy existing chart if it exists
    if (performanceChart) {
        performanceChart.destroy();
    }

    const historicalData = portfolioData.historicalData;
    if (!historicalData || !historicalData.portfolioHistory || historicalData.portfolioHistory.length === 0) {
        console.warn('No historical data available for performance chart');
        return;
    }

    const portfolioHistory = historicalData.portfolioHistory;

    // Normalize portfolio to 100 at start
    const firstValue = portfolioHistory[0].value;
    const normalizedPortfolio = portfolioHistory.map(point => ({
        x: point.date,
        y: (point.value / firstValue) * 100
    }));

    // Prepare datasets
    const datasets = [
        {
            label: 'DIG Portfolio',
            data: normalizedPortfolio,
            borderColor: '#febc11',
            backgroundColor: 'rgba(254, 188, 17, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#febc11',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2
        }
    ];

    // Add SPY benchmark if available
    if (historicalData.benchmarks.SPY) {
        datasets.push({
            label: 'SPY',
            data: historicalData.benchmarks.SPY.map(p => ({ x: p.date, y: p.value })),
            borderColor: 'rgba(42, 82, 152, 0.8)',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5
        });
    }

    // Add SPXE benchmark if available (using SPY as proxy for now)
    if (historicalData.benchmarks.SPXE) {
        datasets.push({
            label: 'SPXE (ex-Energy)',
            data: historicalData.benchmarks.SPXE.map(p => ({ x: p.date, y: p.value })),
            borderColor: 'rgba(32, 201, 151, 0.8)',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [10, 5],
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5
        });
    }

    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'month',
                        displayFormats: {
                            month: 'MMM yyyy'
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#ffffff',
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#ffffff',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            return value.toFixed(0);
                        }
                    },
                    title: {
                        display: true,
                        text: 'Indexed Value (Base = 100)',
                        color: '#ffffff',
                        font: {
                            size: 12,
                            weight: 600
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: '#ffffff',
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'line',
                        font: {
                            size: 12,
                            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 20, 25, 0.95)',
                    titleColor: '#febc11',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(254, 188, 17, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        title: function(context) {
                            const date = new Date(context[0].parsed.x);
                            return date.toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                            });
                        },
                        label: function(context) {
                            const label = context.dataset.label;
                            const value = context.parsed.y;
                            const change = value - 100;
                            const changePercent = change.toFixed(2);
                            return `${label}: ${value.toFixed(2)} (${change >= 0 ? '+' : ''}${changePercent}%)`;
                        },
                        afterBody: function(context) {
                            // Add actual portfolio value for DIG Portfolio line
                            if (context[0].dataset.label === 'DIG Portfolio') {
                                const dataIndex = context[0].dataIndex;
                                const actualValue = portfolioHistory[dataIndex].value;
                                return `\nActual Value: ${formatCurrency(actualValue)}`;
                            }
                            return '';
                        }
                    }
                },
                zoom: {
                    zoom: {
                        wheel: {
                            enabled: false
                        },
                        pinch: {
                            enabled: false
                        }
                    },
                    pan: {
                        enabled: false
                    }
                }
            }
        }
    });
}

/**
 * Calculate performance metrics
 */
function calculatePerformanceMetrics() {
    const historicalData = portfolioData.historicalData;
    if (!historicalData || !historicalData.portfolioHistory) {
        return null;
    }

    const history = historicalData.portfolioHistory;
    const returns = [];

    // Calculate daily returns
    for (let i = 1; i < history.length; i++) {
        const prevValue = history[i - 1].value;
        const currValue = history[i].value;
        const dailyReturn = (currValue - prevValue) / prevValue;
        returns.push(dailyReturn);
    }

    // Total return
    const firstValue = history[0].value;
    const lastValue = history[history.length - 1].value;
    const totalReturn = (lastValue - firstValue) / firstValue;

    // Annualized return
    const daysPassed = (history[history.length - 1].date - history[0].date) / (1000 * 60 * 60 * 24);
    const yearsPassed = daysPassed / 365;
    const annualizedReturn = Math.pow(1 + totalReturn, 1 / yearsPassed) - 1;

    // Volatility (annualized standard deviation)
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized

    // Sharpe Ratio (assuming 4% risk-free rate)
    const riskFreeRate = 0.04;
    const sharpeRatio = (annualizedReturn - riskFreeRate) / volatility;

    // Maximum Drawdown
    let peak = history[0].value;
    let maxDrawdown = 0;

    history.forEach(point => {
        if (point.value > peak) {
            peak = point.value;
        }
        const drawdown = (peak - point.value) / peak;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    });

    return {
        totalReturn,
        annualizedReturn,
        volatility,
        sharpeRatio,
        maxDrawdown
    };
}

/**
 * Create analytics chart (for future use)
 */
function createAnalyticsChart() {
    // Placeholder for additional analytics visualizations
    // Could include: drawdown chart, rolling returns, sector performance, etc.
}

// Export functions for global access
window.createSectorChart = createSectorChart;
window.createPerformanceChart = createPerformanceChart;
window.calculatePerformanceMetrics = calculatePerformanceMetrics;
window.resetSectorView = resetSectorView;
