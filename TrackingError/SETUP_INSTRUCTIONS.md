# Tracking Error Analyzer - Setup Instructions

## Overview
The tracking error analyzer now uses a proxy server to handle API requests, so students don't need to enter their own API keys. The proxy server securely stores your Polygon.io API key and handles rate limiting automatically.

## Setup Steps

### 1. Get Your Polygon.io API Key

**For Testing (Free Tier):**
- Sign up at: https://polygon.io/dashboard/signup
- Get your free API key (5 calls/minute)
- No credit card required

**For Production (Paid Tier - Recommended):**
- Upgrade to Starter tier: $29/month
- Unlimited API calls
- 60x faster than free tier (5 seconds vs 5 minutes for 60 tickers)

### 2. Configure the Proxy Server

**IMPORTANT: We use environment variables to keep your API key secure!**

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your actual API key:
   ```
   POLYGON_API_KEY=your_actual_api_key_here
   POLYGON_TIER=free
   ```

3. **NEVER commit the `.env` file to git!** (it's already in `.gitignore`)

The `.env` file keeps your API key secret and out of your GitHub repository.

### 3. Test Locally

```bash
# Install dependencies (if not already installed)
npm install

# Start the proxy server
npm start
```

You should see:
```
✅ Multi-API Proxy Server running on http://localhost:3000
📊 Yahoo Finance: 2 requests/second
📊 Polygon.io: free tier (5 calls/min)
```

### 4. Test the HTML File

1. Open `tracking_error_analyzer.html` in your browser
2. The API Configuration section has been removed (no more API key input!)
3. Add some holdings and click "Calculate Tracking Error"
4. Check the browser console to see the proxy server handling requests

### 5. Deploy to GoDaddy

#### Option A: Deploy Proxy Server to GoDaddy

1. Upload `proxy-server.js`, `package.json`, and `node_modules` to your GoDaddy hosting
2. Configure GoDaddy to run Node.js apps (check their documentation)
3. Set the correct port in GoDaddy's configuration
4. Start the proxy server on GoDaddy

#### Option B: Update HTML for Production

Once your proxy is deployed, update `tracking_error_analyzer.html` line 2016:

```javascript
// Change from:
const PROXY_URL = 'http://localhost:3000';

// To your production URL:
const PROXY_URL = 'https://yourdomain.com';
// or wherever your proxy is hosted
```

### 6. Upgrade to Paid Tier (Optional but Recommended)

When you're ready to upgrade:

1. Go to https://polygon.io/pricing
2. Subscribe to Starter tier ($29/month)
3. Update your `.env` file:
   ```
   POLYGON_TIER=paid
   ```
4. Restart the proxy server

**Speed Comparison:**
- Free tier: ~5 minutes for 60 tickers (5 calls/min)
- Paid tier: ~5-10 seconds for 60 tickers (unlimited calls)

## Architecture

```
Student's Browser
      ↓
tracking_error_analyzer.html
      ↓
proxy-server.js (your server)
      ↓ (with your API key)
Polygon.io API
```

Students never see your API key - it stays secure on your server!

## Rate Limiting

The proxy server automatically handles rate limiting:

**Free Tier:**
- 5 calls per minute
- 12 second delay between requests
- Automatic retry on rate limit errors

**Paid Tier:**
- Unlimited calls
- Minimal 100ms delay for safety
- Much faster data fetching

## Troubleshooting

### "Failed to fetch any price data"
- Make sure proxy server is running (`npm start`)
- Check that `POLYGON_API_KEY` is set correctly
- Verify the `PROXY_URL` in the HTML matches your server

### "Polygon API key not configured"
- You haven't replaced `YOUR_POLYGON_API_KEY_HERE` in `proxy-server.js`

### "Rate limited after X retries"
- You're on free tier and hitting the 5 calls/min limit
- Consider upgrading to paid tier
- Or wait 1 minute between analysis runs

### Port 3000 already in use
- Change `PORT` in `proxy-server.js` line 6
- Update `PROXY_URL` in the HTML to match

## Health Check

Test if your proxy is working:
```bash
# Open in browser or curl:
http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "message": "Proxy server is running",
  "polygonTier": "free",
  "polygonConfigured": true,
  ...
}
```

## Security Notes

- ✅ `.env` file is in `.gitignore` - your API key will never be committed to git
- ✅ The API key is stored as an environment variable, not in code
- ✅ The API key is only visible on your server, not in the HTML
- ✅ Students can't access your API key from the browser
- ⚠️ Always use `.env.example` as a template (safe to commit)
- ⚠️ Never commit the actual `.env` file (contains your real key)

## Questions?

If you run into issues, check:
1. Is the proxy server running?
2. Is the API key configured correctly?
3. Is the PROXY_URL in the HTML pointing to the right place?
4. Check browser console and server terminal for error messages
