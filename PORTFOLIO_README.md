# Portfolio Dashboard - Implementation Guide

## Overview

A modern, institutional-grade portfolio dashboard for the UCSB Dean's Investment Group featuring:
- Real-time portfolio composition analysis
- Interactive performance charts with benchmark comparisons
- Sector allocation visualization
- Sortable holdings table
- PDF tearsheet generation
- Responsive design matching DIG brand aesthetic

## Files Created

### 1. `portfolio.html` (Main Page)
- Complete HTML structure with embedded CSS
- DIG brand styling (blue/gold color scheme)
- Animated background with particles
- Responsive grid layouts
- Fixed navigation header
- Summary cards, performance chart, sector chart, holdings table

### 2. `portfolio-data.js` (Data Management)
- CSV parsing for `Portfolio_Positions_Jan-16-2026.csv`
- Portfolio summary calculations
- Sector allocation analysis
- Polygon.io API integration for historical prices
- Synthetic historical performance (Option A)
- State management

### 3. `portfolio-charts.js` (Visualizations)
- Chart.js integration
- Sector allocation doughnut chart
- Performance line chart with multiple datasets
- Benchmark comparison (SPY, SPXE)
- Interactive tooltips and legends
- Performance metrics calculator

## Current Status

### ✅ Completed Features

1. **Page Structure & Design**
   - Full DIG aesthetic with animated gradient background
   - Floating particle effects (gold, blue, white)
   - Fixed header navigation
   - Responsive grid layouts
   - Glass morphism card designs

2. **Data Management**
   - CSV parsing with proper handling of quoted values
   - Currency and percentage parsers
   - Portfolio summary calculations (total value, returns, top holding)
   - Sector allocation calculations
   - Sort functionality for holdings table

3. **Summary Cards**
   - Total Portfolio Value (with day change)
   - Total Return (since inception)
   - Number of Holdings + Cash
   - Top Holding (symbol + weight %)

4. **Holdings Table**
   - All 24 positions displayed
   - Columns: Symbol, Company, Sector, Quantity, Price, Value, Weight %, Day Change, Total Return
   - Sortable by any column (click headers)
   - Color-coded gains/losses (green/red)
   - Clickable symbols for tearsheets

5. **Sector Chart**
   - Doughnut chart with proper colors
   - Shows all sectors with percentages
   - Interactive tooltips with value + weight
   - Legend with formatted percentages

6. **Performance Chart**
   - Line chart with time series data
   - Multiple datasets (Portfolio + Benchmarks)
   - Time range selector (1Y, 3Y, Inception)
   - Normalized to 100 at start for easy comparison
   - Shows actual dollar values in tooltips

7. **Action Buttons**
   - Refresh Data (reloads everything)
   - Generate Tearsheet (placeholder ready for integration)
   - Export CSV (downloads current holdings)

8. **Loading States**
   - Full-page loading overlay with spinner
   - Button disabled states during operations

## ⚠️ Requires Setup

### 1. Proxy Server Configuration

The dashboard needs access to Polygon.io API. Update `portfolio-data.js` line ~230:

```javascript
const proxyUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://YOUR-VERCEL-APP.vercel.app'; // ⚠️ UPDATE THIS
```

**To test locally:**
1. Start proxy server: `cd ../TrackingError && node proxy-server.js`
2. Ensure `.env` file has `POLYGON_API_KEY` and `POLYGON_TIER=paid`
3. Open `portfolio.html` in browser

**For production:**
1. Deploy proxy server to Vercel
2. Update the `proxyUrl` with your Vercel deployment URL

### 2. Tearsheet Integration (TODO)

Current status: Placeholders in place

**Portfolio Tearsheet (`generatePortfolioTearsheet` function):**
```javascript
// In portfolio-data.js, replace alert with:
async function generatePortfolioTearsheet() {
    const btn = document.getElementById('tearsheetBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    try {
        // Prepare data in format expected by tearsheet-generator.js
        const portfolioForTearsheet = portfolioData.positions.map(pos => ({
            symbol: pos.symbol,
            quantity: pos.quantity,
            lastPrice: pos.lastPrice,
            marketValue: pos.currentValue,
            sector: pos.sector,
            // Add any other fields needed
        }));

        // Call existing generator
        await TearSheetGenerator.generate(portfolioForTearsheet, {
            companyName: 'UCSB Dean\'s Investment Group',
            logo: 'DIG'
        });
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-file-pdf"></i> Generate Tearsheet';
    }
}
```

**Individual Stock Tearsheet (`showStockTearsheet` function):**
```javascript
// In portfolio-data.js, replace alert with:
async function showStockTearsheet(symbol) {
    const position = portfolioData.positions.find(p => p.symbol === symbol);
    if (!position) return;

    // Call existing individual tearsheet generator
    await IndividualTearSheetGenerator.generate(symbol, {
        currentPrice: position.lastPrice,
        quantity: position.quantity,
        marketValue: position.currentValue,
        // Add historical price data if needed
    });
}
```

## Data Flow

```
Portfolio_Positions_Jan-16-2026.csv
    ↓ (CSV Parser)
portfolioData.positions[]
    ↓
Summary Calculations → Summary Cards
    ↓
Sector Analysis → Sector Chart
    ↓
Holdings Table Population
    ↓
Polygon.io API Request (all symbols, date range)
    ↓
Historical Price Data
    ↓
Synthetic Portfolio History Calculation
    ↓
Performance Chart (normalized to 100)
```

## Synthetic History (Option A)

Currently implemented: Portfolio value over time calculated by taking **current holdings** and applying historical prices.

**How it works:**
1. For each position in current CSV (e.g., 590.669 shares of VOO)
2. Fetch historical daily prices from Polygon.io
3. Calculate: `Historical Value = Current Quantity × Historical Price`
4. Sum all positions for each date = Total Portfolio Value
5. Normalize to 100 at start date for charting

**Limitations:**
- Does not reflect actual trades/rebalancing
- Assumes you've always held exact current quantities
- Useful for "what if" analysis, not true historical performance

**Benefits:**
- Simple to implement
- No transaction parsing needed
- Works immediately
- Still provides valuable insights

## Future Enhancements (Option B)

### Phase 2: True Historical Performance

**Data available:**
- 5 CSV files covering 2022-2026 (~670 transactions)
- Buy/sell transactions with prices and quantities
- Dividends, reinvestments, transfers
- Cash balance tracking

**Implementation steps:**
1. Parse all 5 history CSV files
2. Build transaction ledger sorted by date
3. Reconstruct positions on each day
4. Fetch prices for holdings on each day
5. Calculate true portfolio value over time
6. Update charts with real performance

**Estimated effort:** 10-16 hours additional development

### Other Potential Enhancements

1. **Real-Time Updates**
   - WebSocket connection for live prices
   - Auto-refresh every 5 minutes during market hours
   - Pulse animation on price changes

2. **Advanced Analytics**
   - Rolling Sharpe ratio chart
   - Drawdown visualization
   - Sector performance over time
   - Contribution analysis (which stocks drove returns)
   - Correlation matrix heatmap

3. **Risk Metrics**
   - Beta calculation
   - Alpha calculation
   - Value at Risk (VaR)
   - Maximum drawdown statistics

4. **Comparison Tools**
   - Multiple benchmark selection
   - Peer fund comparison
   - Attribution analysis

5. **Mobile Enhancements**
   - Swipeable charts
   - Touch-friendly controls
   - Progressive Web App (PWA) support

## Testing Checklist

- [ ] CSV loads without errors
- [ ] Summary cards populate correctly
- [ ] Holdings table shows all 24 positions
- [ ] Table sorting works for all columns
- [ ] Sector chart renders with correct percentages
- [ ] Performance chart loads (after Polygon.io setup)
- [ ] Time range buttons change chart data
- [ ] Refresh button reloads data
- [ ] Export CSV downloads file
- [ ] Responsive design works on mobile
- [ ] Particles animate smoothly
- [ ] Loading overlay shows/hides correctly

## Browser Compatibility

Tested/supported:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requirements:
- ES6+ JavaScript support
- CSS Grid and Flexbox
- Fetch API
- Canvas for Chart.js

## Dependencies

**External (CDN):**
- Font Awesome 6.0.0 (icons)
- Chart.js 4.4.0 (charts)
- jsPDF 2.5.1 (PDF generation, loaded in parent)

**Internal:**
- `portfolio-config.js` (existing)
- `tearsheet-generator.js` (existing)
- `individual-tearsheet-generator.js` (existing)

## Deployment

### Local Development
1. Ensure proxy server is running: `node proxy-server.js`
2. Open `portfolio.html` in browser
3. Check browser console for any errors

### Production (Vercel/Netlify)
1. Deploy entire `/website/` folder
2. Ensure proxy server is deployed separately
3. Update `proxyUrl` in `portfolio-data.js`
4. Test all API calls work

## Support

For questions or issues:
1. Check browser console for error messages
2. Verify Polygon.io API key is configured
3. Ensure CSV file path is correct
4. Check that Chart.js CDN loaded successfully

## License

MIT License - UCSB Dean's Investment Group

---

**Last Updated:** January 16, 2026
**Version:** 1.0.0 (Option A - Synthetic History)
