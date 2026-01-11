# Portfolio Tracking Error Analyzer

A client-side web application for analyzing portfolio tracking error contributions at both equity and sector levels.

## Features

- **Portfolio Management**: Add equities with weights, automatic sector detection
- **Benchmark Selection**: S&P 500 (SPX), SPY ETF, or S&P 500 ex-Energy (SPXE)
- **Flexible Parameters**:
  - Multiple time horizons (3mo, 1yr, 3yr) or custom date range
  - Frequencies (daily, weekly)
  - Sector grouping options (GICS 11 sectors or Custom 6 sectors)
- **Comprehensive Analysis**:
  - Marginal Contribution to Tracking Error (MCTE) for each equity
  - Contribution to Tracking Error (CTE) at equity level
  - Sector-level aggregation with two grouping options:
    - **GICS 11 Sectors**: Standard 11-sector GICS classification
    - **Custom 6 Sectors**: Aggregated grouping:
      - Tech & Communication (Technology + Communication Services)
      - Consumer (Consumer Discretionary + Consumer Staples)
      - Utilities & Real Estate (Utilities + Real Estate)
      - Materials & Industrials (Materials + Industrials)
      - Healthcare
      - Financials
  - Verification that sum of CTEs equals portfolio TE

## How It Works

### Tracking Error Calculation Methodology

1. **Retrieve Prices**: Fetches daily adjusted closing prices via Yahoo Finance
2. **Calculate Active Weights**: Portfolio weight - Benchmark weight for each equity
3. **Calculate Active Returns**: Equity return - Benchmark return for each day
4. **Portfolio Active Returns**: Weighted sum of active returns
5. **Portfolio Tracking Error**: Annualized standard deviation of portfolio active returns
6. **MCTE**: `Cov(R_a,i, R_p,a) / StDev(R_p,a) × √252`
7. **CTE**: `Active Weight × MCTE`
8. **Verification**: Sum of all CTEs = Portfolio Tracking Error

## Usage

1. **Open** `tracking_error_analyzer.html` in a web browser
2. **Load Sample Portfolio** or add your own holdings
3. **Edit weights** directly in the table (click on weight values)
4. **Select benchmark** and parameters:
   - Choose benchmark: SPX, SPY, or SPXE
   - Select time horizon: 3 months, 1 year, 3 years, or custom date range
   - If custom date range is selected, specify start and end dates
   - Choose sector grouping: GICS 11 sectors or Custom 6 sectors
   - Select frequency: Daily or Weekly
5. **Calculate** to view results

### Custom Date Range
To analyze a specific time period:
1. Select "Custom Date Range" from the Time Horizon dropdown
2. Two date picker fields will appear
3. Enter your desired start and end dates
4. Click "Calculate Tracking Error"

### Sector Grouping Options
- **GICS 11 Sectors**: Shows results using standard GICS sector classification (11 sectors)
- **Custom 6 Sectors**: Aggregates related sectors for simplified analysis:
  - Combines Technology + Communication Services
  - Combines Consumer Discretionary + Consumer Staples
  - Combines Utilities + Real Estate
  - Combines Materials + Industrials
  - Keeps Healthcare separate
  - Keeps Financials separate

## Benchmark Weights

### Current Implementation

The application uses **approximate SPX weights** hardcoded in the file. These are based on Q4 2024 data and include:
- Top 50 S&P 500 holdings by market cap
- Common portfolio holdings
- Representative distribution

### Updating SPX Weights

To get more accurate, real-time SPX weights, you have several options:

#### Option 1: Manual Update (Recommended for Free)

Update the `spxApproximateWeights` object in the HTML file with current data from:
- [SlickCharts S&P 500](https://www.slickcharts.com/sp500)
- [ETF.com SPY Holdings](https://www.etf.com/SPY)
- [State Street SPY Holdings](https://www.ssga.com/us/en/individual/etfs/funds/spdr-sp-500-etf-trust-spy)

#### Option 2: Paid API Services

For automated, real-time weights:

1. **Financial Modeling Prep** ($14/month)
   ```javascript
   const response = await fetch(
     'https://financialmodelingprep.com/api/v3/sp500_constituent?apikey=YOUR_KEY'
   );
   ```

2. **Alpha Vantage** (Free tier available)
   ```javascript
   const response = await fetch(
     'https://www.alphavantage.co/query?function=OVERVIEW&symbol=AAPL&apikey=YOUR_KEY'
   );
   ```

3. **Polygon.io** (Free tier available)

#### Option 3: Wikipedia Scraping (Free but slow)

The code includes a commented-out `fetchSP500Tickers()` function that scrapes Wikipedia for the constituent list. You can:
1. Fetch tickers from Wikipedia
2. Get market caps via Yahoo Finance
3. Calculate weights proportionally

**Note**: This is slow (500+ API calls) and not recommended for production.

### SPXE (S&P 500 ex-Energy)

The application automatically:
1. Takes SPX weights
2. Removes all Energy sector stocks
3. Renormalizes remaining weights to 100%

## Technical Details

### Dependencies
- None! Completely self-contained HTML file
- Uses native `fetch` API for data retrieval
- CORS proxy (`corsproxy.io`) for Yahoo Finance API access

### Data Sources
- **Price Data**: Yahoo Finance via CORS proxy
- **Sector Info**: Hardcoded mapping with fallback to Yahoo Finance
- **Benchmark Weights**: Approximate SPX weights (update periodically)

### Browser Compatibility
- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge (latest versions)

## Limitations

1. **Benchmark Weights**: Uses approximate weights, not official S&P index data
2. **CORS Proxy**: Free tier has rate limits; may be slow
3. **Historical Data**: Limited to Yahoo Finance availability
4. **Calculation**: Assumes benchmark weights are constant over the analysis period (simplified)

## Future Enhancements

- [ ] Backend proxy for faster data fetching
- [ ] Real-time SPX weight updates via paid API
- [ ] Export results to CSV/Excel
- [ ] Chart visualizations (CTE by sector, time series)
- [ ] Support for additional benchmarks (Russell 2000, NASDAQ 100)
- [ ] Historical tracking error analysis
- [ ] Risk attribution decomposition

## Troubleshooting

### "Failed to fetch data for [TICKER]"
- Check ticker symbol is correct
- CORS proxy may be rate-limited (wait and retry)
- Yahoo Finance may not have data for that ticker

### "Verification failed"
Several reasons this might occur:

1. **Using SPXE benchmark**: SPXE uses SPY as a proxy for returns but SPXE weights (SPX ex-Energy). This creates a slight mismatch. The weights are correct for active weight calculation, but the benchmark return approximation introduces error.

2. **Calculation precision**: Standard floating-point rounding errors
   - If difference is < 0.01%, it's acceptable

3. **Incomplete benchmark weights**: Some portfolio holdings may not have benchmark weights
   - Check that all portfolio tickers exist in the SPX weights object

**For perfect verification:**
- Use SPY or ^GSPC benchmark (not SPXE)
- Ensure all portfolio holdings have corresponding benchmark weights
- Use portfolios of 10+ holdings

### Slow performance
- Fetching 500+ benchmark constituents takes time
- Use hardcoded weights (faster)
- Consider implementing backend proxy

## Contributing

To add more accurate SPX weights:
1. Get current S&P 500 constituents and weights
2. Update `spxApproximateWeights` object
3. Update timestamp comment (e.g., "Q1 2025")

## License

MIT License - Free for personal and commercial use
