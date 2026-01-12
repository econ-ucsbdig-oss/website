# Quick Start Guide

## What Changed?

✅ **API key is now hidden from students**
- No more API key input field in the HTML
- API key stored securely in `.env` file (not committed to git)
- Students just use the tool - no setup needed on their end

✅ **Speed improvements ready**
- Free tier: Same speed as before (for testing)
- Paid tier ($29/mo): 60x faster (just change one line in `.env`)

✅ **GitHub safe**
- `.gitignore` prevents secrets from being committed
- `.env.example` shows what's needed without exposing secrets

---

## To Test Right Now:

### 1. Add Your API Key

Edit the `.env` file:
```bash
POLYGON_API_KEY=pk_xxxxxxxxxxxxx  # Your actual key here
POLYGON_TIER=free
```

### 2. Start the Server

```bash
npm start
```

You should see:
```
✅ Multi-API Proxy Server running on http://localhost:3000
📊 Polygon.io: free tier (5 calls/min)
```

### 3. Test the App

1. Open `tracking_error_analyzer.html` in your browser
2. Add some holdings (start with 5-10 to keep it fast)
3. Click "Calculate Tracking Error"
4. Watch the console to see it working!

---

## When Ready to Go Faster

1. Upgrade at https://polygon.io/pricing (Starter = $29/mo)
2. Change `.env`:
   ```
   POLYGON_TIER=paid
   ```
3. Restart server
4. Enjoy 60x faster speeds! 🚀

---

## Git Safety Check

Before you commit to GitHub:

```bash
# Check what will be committed:
git status

# You should NOT see:
# - .env (your actual API key)

# You SHOULD see:
# - .env.example (template without real key)
# - .gitignore (protects .env)
# - proxy-server.js (uses environment variables)
```

The `.gitignore` file will automatically protect your `.env` file!

---

## Files You Can Safely Commit to GitHub:

- ✅ `proxy-server.js` - uses `process.env`, no hardcoded keys
- ✅ `.env.example` - template only, no real secrets
- ✅ `.gitignore` - protects your `.env` file
- ✅ `package.json` - dependencies list
- ✅ `tracking_error_analyzer.html` - client-side code
- ✅ All markdown documentation files

## Files That Should NEVER Be Committed:

- ❌ `.env` - contains your actual API key (protected by `.gitignore`)
- ❌ `node_modules/` - dependencies folder (protected by `.gitignore`)

---

## Deploying to GoDaddy

When you deploy to production:

1. Upload all files EXCEPT `.env` to GoDaddy
2. On GoDaddy server, create a new `.env` file with your production key
3. Make sure Node.js is installed on GoDaddy
4. Run `npm install` on the server
5. Start the proxy server
6. Update `PROXY_URL` in the HTML to your production domain

---

## Need Help?

See `SETUP_INSTRUCTIONS.md` for detailed instructions and troubleshooting.
