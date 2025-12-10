# Contributing to UCSB DIG Live Portfolio

This guide covers development setup, architecture details, testing procedures, and best practices.

## 🛠️ Development Setup

### Prerequisites
- **Node.js 18+** and npm
- **Git** for version control
- **VS Code** (recommended) with Live Preview extension
- **Alpha Vantage API key** (free tier sufficient for development)

### Initial Setup

1. **Clone and install**
```bash
git clone <repo-url>
cd Website
npm install
```

2. **Environment configuration**
```bash
cp .env.example .env
# Edit .env with your API key
```

3. **Start development server**
```bash
npm start
```

4. **Open in browser**
```bash
# Option 1: Direct access
open http://localhost:3001

# Option 2: VS Code Live Preview
# Right-click index.html → Show Preview
```

## 🏗️ Detailed Architecture

### Two-Server Development Setup

The system uses **one Express server** that serves both static files and API endpoints:

```
┌──────────────────────────────────────────────────┐
│         Express Server (Port 3001)               │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │    Static File Server                  │    │
│  │    ├── Serves HTML, CSS, JS            │    │
│  │    ├── Serves images, CSV files        │    │
│  │    └── Root: ./ (current directory)    │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │    API Endpoints                       │    │
│  │    ├── GET /api/health                 │    │
│  │    ├── GET /api/stock/:symbol          │    │
│  │    ├── POST /api/stocks/batch          │    │
│  │    └── Alpha Vantage integration       │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │    Middleware                          │    │
│  │    ├── CORS (allows all origins)       │    │
│  │    ├── Rate limiting                   │    │
│  │    ├── Error handling                  │    │
│  │    └── Request logging                 │    │
│  └────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

### File Responsibilities

#### Backend (`server.js`)
- Express server configuration
- API endpoint handlers
- Alpha Vantage integration
- Rate limiting logic
- CORS configuration
- Static file serving
- Error handling

#### Frontend Components

**`live-portfolio.html`** (Main Dashboard)
- Portfolio data display
- Live data connection UI
- Sector breakdown visualization
- Holdings tables (All/ETFs/Active positions)
- Modal dialogs for sector details
- Keyboard shortcut handlers

**`individual-tearsheet-generator.js`** (Single Stock PDFs)
- Individual stock PDF generation
- 4-page report layout
- Position analysis
- Risk metrics
- Peer comparisons
- Investment thesis formatting

**`tearsheet-generator.js`** (Portfolio PDFs)
- Full portfolio tear sheet
- Multi-page PDF layout
- Sector allocation charts
- Holdings summary tables
- Performance metrics

**`portfolio-config.js`** (Utilities)
- CSV parsing
- Data transformation
- Sector classification (GICS)
- Portfolio segmentation logic
- Helper functions

## 🔌 API Endpoints

### Health Check
```
GET /api/health
Response: { status: 'ok', timestamp: '2025-12-10T...' }
```

### Individual Stock Quote
```
GET /api/stock/:symbol
Parameters:
  - symbol: Stock ticker (e.g., AAPL)
Response:
  {
    symbol: 'AAPL',
    price: 195.50,
    change: 2.30,
    changePercent: 1.19,
    timestamp: '2025-12-10T...'
  }
```

### Batch Stock Quotes
```
POST /api/stocks/batch
Body:
  {
    symbols: ['AAPL', 'MSFT', 'GOOGL']
  }
Response:
  {
    AAPL: { price: 195.50, change: 2.30, ... },
    MSFT: { price: 415.20, change: -1.50, ... },
    GOOGL: { price: 142.80, change: 0.90, ... }
  }
```

## 🧪 Testing

### Manual Testing Checklist

#### Basic Functionality
- [ ] Server starts without errors (`npm start`)
- [ ] Homepage loads at http://localhost:3001
- [ ] Live Portfolio page loads at http://localhost:3001/live-portfolio.html
- [ ] Navigation between pages works
- [ ] All images and CSS load correctly

#### API Integration
- [ ] "Connect to Live Data" button works
- [ ] Status changes to "Live Data Connected"
- [ ] Portfolio values update with live prices
- [ ] Progress indicator shows during updates
- [ ] Error messages display for failed connections
- [ ] System falls back to static data on API failure

#### Portfolio Features
- [ ] All Holdings tab shows 23 positions
- [ ] Broad Market ETFs tab shows 3 ETFs (VOO, VTV, SPY)
- [ ] DIG Active Positions tab shows 20 positions
- [ ] Sector column displays correct GICS sectors
- [ ] Portfolio totals calculate correctly
- [ ] Weight percentages sum to ~100%

#### PDF Generation
- [ ] "Download Tear Sheet" generates portfolio PDF
- [ ] Click on any symbol generates individual PDF
- [ ] PDFs open/download correctly
- [ ] PDF formatting is professional
- [ ] All data appears correctly in PDFs

#### CSV Export
- [ ] "Export CSV" button works
- [ ] CSV file downloads
- [ ] CSV contains all holdings
- [ ] Data is properly formatted

#### Keyboard Shortcuts
- [ ] Ctrl+R refreshes data
- [ ] Ctrl+P generates tear sheet
- [ ] Ctrl+E exports CSV
- [ ] Ctrl+S toggles sector breakdown
- [ ] Escape closes modals

### API Testing

Test rate limiting:
```bash
# Should succeed (under limit)
curl http://localhost:3001/api/stock/AAPL

# Should fail after many rapid requests
for i in {1..70}; do curl http://localhost:3001/api/stock/AAPL; done
```

Test batch endpoint:
```bash
curl -X POST http://localhost:3001/api/stocks/batch \
  -H "Content-Type: application/json" \
  -d '{"symbols":["AAPL","MSFT","GOOGL"]}'
```

### Browser Console Testing

Open browser console (F12) and test:

```javascript
// Test API connection
fetch('http://localhost:3001/api/health')
  .then(r => r.json())
  .then(console.log);

// Test stock quote
fetch('http://localhost:3001/api/stock/AAPL')
  .then(r => r.json())
  .then(console.log);

// Test batch quotes
fetch('http://localhost:3001/api/stocks/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ symbols: ['AAPL', 'MSFT'] })
})
  .then(r => r.json())
  .then(console.log);
```

## 🐛 Debugging

### Enable Debug Logging

All requests are logged by default:
```
2025-12-10T10:30:15.123Z - GET /api/stock/AAPL from http://localhost:3001
2025-12-10T10:30:16.456Z - POST /api/stocks/batch from http://localhost:3001
```

### Common Issues

#### CORS Errors
**Problem**: "Access-Control-Allow-Origin" error in console  
**Solution**: CORS is configured to allow all origins in development. Check that server is running.

#### Rate Limit Errors
**Problem**: "Too many requests" error  
**Solution**: Wait 1 minute. Free tier: 25 calls/day, 5/minute  
**Code location**: `server.js` line ~45 (API_RATE_LIMIT constant)

#### API Key Invalid
**Problem**: "Invalid API key" or 403 errors  
**Solution**: Verify `.env` file has correct key format  
**Test**: Visit Alpha Vantage dashboard to verify key status

#### Port Already in Use
**Problem**: "Port 3001 already in use"  
**Solution**:
```bash
# Find process
lsof -ti:3001

# Kill process
lsof -ti:3001 | xargs kill -9

# Or change port in .env
PORT=3002
```

## 📝 Code Style

### JavaScript
- Use ES6+ features (const, let, arrow functions)
- Async/await for asynchronous code
- Descriptive variable names
- Comments for complex logic
- Error handling with try/catch

### HTML
- Semantic HTML5 elements
- Accessible (ARIA labels where needed)
- Mobile-responsive design
- Progressive enhancement

### CSS
- Mobile-first approach
- CSS Grid and Flexbox for layouts
- CSS custom properties for theming
- BEM naming convention for components

## 🔄 Git Workflow

### Branching Strategy
```bash
main           # Production-ready code
├── develop    # Integration branch
├── feature/*  # New features
└── fix/*      # Bug fixes
```

### Commit Messages
Use conventional commits:
```
feat: add sector breakdown modal
fix: correct portfolio weight calculations
docs: update API documentation
style: improve mobile responsiveness
refactor: simplify PDF generation logic
test: add API endpoint tests
```

### Before Committing
```bash
# Verify .env is not staged
git status

# .env should be in .gitignore
cat .gitignore | grep .env

# If .env is staged, unstage it
git reset HEAD .env
```

## 🚀 Release Process

### Pre-Release Checklist
- [ ] All tests pass
- [ ] No console errors
- [ ] `.env` not in git
- [ ] Documentation updated
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated

### Version Numbering
Follow Semantic Versioning (SemVer):
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backwards compatible
- **Patch** (0.0.1): Bug fixes, backwards compatible

## 🔐 Security Best Practices

### API Key Management
- ✅ **DO**: Use `.env` file for API keys
- ✅ **DO**: Add `.env` to `.gitignore`
- ✅ **DO**: Use `.env.example` as template
- ✅ **DO**: Rotate keys periodically
- ❌ **DON'T**: Commit API keys to git
- ❌ **DON'T**: Share `.env` files
- ❌ **DON'T**: Hardcode keys in source code
- ❌ **DON'T**: Log API keys

### Rate Limiting
- Implemented in `server.js`
- Default: 60 calls per minute
- Configurable via `API_RATE_LIMIT` env variable
- Prevents accidental quota overuse

### CORS Configuration
- Development: Allows all origins
- Production: Restrict to specific domains via `ALLOWED_ORIGINS`

## 📚 Adding New Features

### Adding a New API Endpoint

1. **Add route in server.js**
```javascript
app.get('/api/your-endpoint', async (req, res) => {
  try {
    // Your logic here
    res.json({ success: true, data: yourData });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
```

2. **Update frontend to call endpoint**
```javascript
async function fetchYourData() {
  try {
    const response = await fetch('http://localhost:3001/api/your-endpoint');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch:', error);
    return null;
  }
}
```

3. **Add error handling and rate limiting**
```javascript
// Check rate limit before making API call
if (!checkRateLimit('your-endpoint')) {
  return res.status(429).json({ 
    error: 'Rate limit exceeded' 
  });
}
```

### Adding a New Portfolio Section

1. **Update HTML structure**
```html
<div class="portfolio-section">
  <h3>Your New Section</h3>
  <div id="your-section-content"></div>
</div>
```

2. **Add data processing logic**
```javascript
function processYourSection(holdings) {
  return holdings.filter(h => /* your criteria */);
}
```

3. **Update portfolio-config.js if needed**
```javascript
// Add new classification or utility function
```

## 🎨 UI/UX Guidelines

### Design Principles
- **Clear hierarchy**: Important info prominent
- **Consistent spacing**: Use standardized margins/padding
- **Color coding**: Green (positive), Red (negative), Blue (neutral)
- **Responsive**: Mobile-first, tablet-friendly, desktop-optimized
- **Accessible**: WCAG 2.1 AA compliance

### Component Patterns
- Use modals for detailed information
- Progress indicators for async operations
- Toast notifications for user feedback
- Keyboard shortcuts for power users
- Tooltips for contextual help

## 📖 Documentation Standards

### Code Comments
```javascript
/**
 * Fetches live stock quote from Alpha Vantage API
 * @param {string} symbol - Stock ticker symbol (e.g., 'AAPL')
 * @param {boolean} cache - Whether to use cached data
 * @returns {Promise<Object>} Stock quote data
 */
async function getStockQuote(symbol, cache = true) {
  // Implementation
}
```

### README Updates
- Update README.md for user-facing changes
- Update CONTRIBUTING.md for dev-facing changes
- Include examples and screenshots
- Keep troubleshooting section current

## 🤝 Getting Help

### Resources
- **Alpha Vantage Docs**: https://www.alphavantage.co/documentation/
- **jsPDF Docs**: https://rawgit.com/MrRio/jsPDF/master/docs/
- **Express Docs**: https://expressjs.com/
- **Chart.js Docs**: https://www.chartjs.org/docs/

### Team Communication
- Check existing issues before creating new ones
- Provide detailed bug reports with:
  - Steps to reproduce
  - Expected vs actual behavior
  - Browser/OS information
  - Console errors
  - Screenshots if relevant

---

**Thank you for contributing to UCSB DIG Live Portfolio!** 🎯
