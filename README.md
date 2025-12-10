# UCSB Dean's Investment Group - Live Portfolio Dashboard

A professional portfolio management system with real-time stock data, sector analysis, and automated tear sheet generation.

![Portfolio Dashboard](https://img.shields.io/badge/Status-Production%20Ready-success)
![License](https://img.shields.io/badge/License-MIT-blue)
![Node](https://img.shields.io/badge/Node-18%2B-green)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- A free Alpha Vantage API key ([Get one here](https://www.alphavantage.co/support/#api-key))

### Setup (5 minutes)

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd Website
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure API key**
```bash
cp .env.example .env
```
Edit `.env` and add your Alpha Vantage API key:
```
ALPHA_VANTAGE_API_KEY=your_actual_key_here
PORT=3001
NODE_ENV=development
```

4. **Start the server**
```bash
npm start
```

5. **Open in browser**
Navigate to: `http://localhost:3001`

## ✨ Features

### 🔒 Secure Backend API
- **Protected API keys** - Never exposed in frontend or GitHub
- **Environment variable configuration** - .env file excluded from version control
- **Rate limiting** - Automatic protection against API quota overuse
- **Automatic fallback** - System works with static data if API unavailable
- **CORS enabled** - Secure cross-origin requests

### 📊 Portfolio Management
- **23 holdings** across 11 GICS sectors
- **Three portfolio segments**:
  - **Broad Market ETFs** (3): VOO, VTV, SPY - Passive core holdings
  - **DIG Active Positions** (17): Individual stock picks
  - **Sector ETFs** (3): NUKZ, IHI, XLRE - Targeted exposure
- **GICS sector classification** for all holdings
- **Real-time updates** during market hours

### 📈 Live Data Integration
- **Alpha Vantage API** for real-time stock prices
- **Batch processing** with progress indicators
- **Individual and batch endpoints** for efficient data retrieval
- **Automatic error handling** and graceful degradation
- **Last updated timestamps** for data freshness

### 🎯 Individual Stock Analysis
- **Click any symbol** to generate comprehensive PDF tear sheet
- **4-page professional reports** including:
  - Position summary with key metrics
  - Risk assessment and portfolio context
  - Financial metrics and investment thesis
  - Strategic role and recommendations
- **Peer comparison** within portfolio
- **Sector allocation analysis**
- **Position sizing recommendations**

### 📄 Export & Reporting
- **Full portfolio PDF tear sheets** - Complete portfolio overview
- **Individual stock PDF reports** - Detailed single-stock analysis
- **CSV data export** - Complete breakdown for spreadsheet analysis
- **Professional formatting** - Ready for presentations and board meetings

### ⌨️ Keyboard Shortcuts
- `Ctrl+R` - Refresh live data
- `Ctrl+P` - Generate portfolio tear sheet
- `Ctrl+E` - Export portfolio to CSV
- `Ctrl+S` - Toggle sector breakdown
- `Escape` - Close modals/sector breakdown

## 📁 Project Structure

```
Website/
├── 🔧 Backend
│   ├── server.js                           # Express API server
│   ├── package.json                        # Dependencies
│   ├── .env                               # API key (protected, not in git)
│   ├── .env.example                       # Template for .env
│   └── .gitignore                         # Git exclusions
│
├── 🎯 Frontend
│   ├── index.html                         # Landing page
│   ├── live-portfolio.html                # Main portfolio dashboard
│   ├── individual-tearsheet-generator.js  # Individual stock PDF generator
│   ├── tearsheet-generator.js             # Portfolio PDF generator
│   └── portfolio-config.js                # Configuration utilities
│
├── 📊 Data
│   └── Portfolio_Positions_Oct-27-2025.csv # Current portfolio positions
│
└── 📚 Documentation
    ├── README.md                          # This file
    └── CONTRIBUTING.md                    # Development guide
```

## 🏗️ Architecture

The system uses a two-server architecture:

```
┌─────────────────────────────────────┐
│   Frontend (localhost:3001)         │
│   ├── Static HTML/CSS/JS            │
│   ├── Client-side PDF generation    │
│   └── Responsive UI                 │
└──────────────┬──────────────────────┘
               │
               │ API Calls
               ▼
┌─────────────────────────────────────┐
│   Backend API (localhost:3001)      │
│   ├── Express server                │
│   ├── Alpha Vantage integration     │
│   ├── Rate limiting                 │
│   └── CORS configuration            │
└─────────────────────────────────────┘
```

### How It Works
1. **Express server** serves both static files and API endpoints
2. **Frontend** makes AJAX calls to `/api/*` endpoints
3. **Backend** fetches data from Alpha Vantage API
4. **Rate limiting** prevents quota overuse
5. **Fallback to static data** if API unavailable

## 🔐 Security & Privacy

### API Key Protection
✅ **Never committed to GitHub** - `.env` file excluded via `.gitignore`  
✅ **Backend-only access** - API key only used in server-side code  
✅ **Environment variables** - Secure configuration management  
✅ **No client exposure** - Frontend never sees the API key  

### Best Practices
- Keep your `.env` file secure and never share it
- Use `.env.example` as a template for team members
- Rotate API keys periodically
- Monitor API usage on Alpha Vantage dashboard

## 🛠️ Troubleshooting

### "Failed to connect to live data"
- **Solution**: Ensure backend server is running (`npm start`)
- **Check**: `.env` file has correct API key
- **Verify**: API key works at [Alpha Vantage](https://www.alphavantage.co/support/#api-key)

### "API rate limit reached"
- **Wait**: 1 minute and try again
- **Info**: Free tier allows 25 requests/day, 5/minute
- **System**: Automatically handles rate limiting
- **Upgrade**: Consider Alpha Vantage Premium for higher limits

### Server won't start
- **Check**: Port 3001 is not already in use
- **Solution**: Kill process using port: `lsof -ti:3001 | xargs kill -9`
- **Alternative**: Change port in `.env` file

### Symbols not updating
- **Reason**: Some symbols may not be available in Alpha Vantage
- **Fallback**: System keeps last known prices
- **Note**: US stocks work best (international may be limited)

## 📊 Portfolio Sections

### All Holdings (23 positions)
Complete view of all positions with market values, weights, and performance.

### Broad Market ETFs (3 positions)
- **VOO** - Vanguard S&P 500 ETF
- **VTV** - Vanguard Value ETF  
- **SPY** - SPDR S&P 500 ETF Trust

Passive core holdings for broad market exposure.

### DIG Active Positions (17 positions)
Individual stock picks across 11 GICS sectors:
- Information Technology (7)
- Health Care (3)
- Financials (2)
- Communication Services (2)
- Industrials (2)
- Consumer Discretionary (2)
- Plus Materials, Energy, Utilities, Consumer Staples, Real Estate

### Sector ETFs (3 positions)
- **NUKZ** - Range Nuclear Renaissance Index ETF
- **IHI** - iShares U.S. Medical Devices ETF
- **XLRE** - Real Estate Select Sector SPDR Fund

Targeted sector exposure for strategic positioning.

## 🚢 Deployment

### For GitHub Pages (Static Only)
This repository can be deployed to GitHub Pages, but **note that live data features will not work** without a backend server. The static portfolio data will still display correctly.

1. Push to GitHub
2. Enable GitHub Pages in repository settings
3. Select main branch, root directory
4. Access at `https://yourusername.github.io/repository-name`

**Important**: Live data requires the backend server running. For production deployment with live data, consider:
- Heroku
- Vercel
- AWS EC2
- DigitalOcean

### Environment Variables for Production
Create `.env` file with:
```
ALPHA_VANTAGE_API_KEY=your_production_key
PORT=3001
NODE_ENV=production
API_RATE_LIMIT=60
ALLOWED_ORIGINS=https://yourdomain.com
```

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines, testing procedures, and code standards.

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- **Alpha Vantage** for real-time market data API
- **jsPDF** for PDF generation capabilities
- **Chart.js** for portfolio visualizations
- **UCSB Dean's Investment Group** for portfolio management

## 📞 Support

For questions or issues:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review [CONTRIBUTING.md](CONTRIBUTING.md)
3. Contact the DIG team

---

**Version**: 1.0.0  
**Last Updated**: December 2025  
**Status**: Production Ready ✅
