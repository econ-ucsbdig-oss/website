# Quick Start - Polygon.io API Key Setup

## For Local Development (Your Current Setup)

Since you have the API key in `.env` (which is **correct** for keeping it out of GitHub), follow these steps:

### Step 1: Generate the browser config file

Run this command in the `/website/` directory:

```bash
node generate-env-js.js
```

This will:
- Read your `.env` file
- Extract the `POLYGON_API_KEY`
- Create `load-env.js` with your API key
- `load-env.js` is already in `.gitignore` so it won't be committed

### Step 2: Open portfolio.html

Just open `portfolio.html` in your browser. It will automatically:
- Load `load-env.js` (which sets `window.POLYGON_API_KEY`)
- Load the portfolio data
- Fetch historical prices from Polygon.io
- Display the performance chart

### Step 3: Verify it works

Open browser console (F12) and look for:
```
✅ Polygon.io API key loaded from config
```

You should see the performance chart load with historical data.

---

## For GoDaddy Deployment (Production)

You have **3 options** for production:

### Option A: PHP Proxy (Recommended - Most Secure)

1. Create `/api/polygon.php` on GoDaddy:

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Your API key stays on the server (not in browser)
$apiKey = 'your-polygon-key-here';

$ticker = $_GET['ticker'] ?? '';
$timespan = $_GET['timespan'] ?? 'day';
$from = $_GET['from'] ?? '';
$to = $_GET['to'] ?? '';

if (empty($ticker) || empty($from) || empty($to)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing parameters']);
    exit;
}

$url = "https://api.polygon.io/v2/aggs/ticker/$ticker/range/1/$timespan/$from/$to?adjusted=true&sort=asc&apiKey=$apiKey";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
curl_close($ch);

echo $response;
?>
```

2. Update `portfolio-data.js` line 356:
```javascript
// Change from:
const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${apiKey}`;

// To:
const url = `/api/polygon.php?ticker=${symbol}&timespan=day&from=${from}&to=${to}`;
```

**Pros:**
- ✅ API key stays secret on server
- ✅ Works for all visitors
- ✅ Safe for public GitHub repo

**Cons:**
- Requires PHP on GoDaddy (usually included)

---

### Option B: Environment Variable in Build Script

If you're using a build process, generate `load-env.js` during build:

1. Add to your deploy script:
```bash
node generate-env-js.js
```

2. Deploy `load-env.js` to GoDaddy (but never commit it to GitHub)

**Pros:**
- ✅ Simple
- ✅ Works automatically

**Cons:**
- ❌ API key visible in browser source (not ideal for public sites)
- ❌ Need to regenerate on each deploy

---

### Option C: Manual Setup on Server

1. Create `load-env.js` directly on GoDaddy server with your API key
2. Don't include it in your GitHub repo

**Pros:**
- ✅ API key not in repo
- ✅ Simple to set up

**Cons:**
- ❌ API key visible in browser source
- ❌ Manual step on each deployment

---

## Recommended Workflow

### Development (Local):
```bash
# 1. Make sure .env exists with POLYGON_API_KEY
# 2. Generate browser config
node generate-env-js.js

# 3. Open portfolio.html in browser
# Performance chart should load!
```

### Production (GoDaddy):
**Use Option A (PHP Proxy)** for best security.

---

## Troubleshooting

### "API key not found" warning
- Run: `node generate-env-js.js`
- Check that `load-env.js` was created
- Open browser console, verify: "✅ Polygon.io API key loaded"

### Performance chart shows message instead of data
- Check browser console for API errors
- Verify `load-env.js` is loaded before `portfolio-data.js`
- Check Network tab for failed API calls

### "File not found: load-env.js"
- Run: `node generate-env-js.js`
- Make sure you're in the `/website/` directory

---

## Security Notes

✅ **Safe:**
- `.env` file (never committed - in .gitignore)
- `load-env.js` (never committed - in .gitignore)
- PHP proxy on server (API key not in browser)

❌ **Unsafe:**
- Hardcoding API key directly in JavaScript
- Committing `load-env.js` to GitHub
- Using API key in browser on public websites

---

## Quick Commands

```bash
# Generate config from .env
node generate-env-js.js

# Test locally
open portfolio.html

# Check if API key is set
# (Open browser console and type:)
localStorage.getItem('POLYGON_API_KEY')
```

Done! Your portfolio dashboard should now work with the Polygon.io API key from your `.env` file.
