# Polygon.io Setup Guide

## Quick Start

The portfolio page now calls Polygon.io API directly from the browser (no Vercel proxy needed!).

### Option 1: Browser localStorage (Recommended for local testing)

Open your browser console on the portfolio page and run:

```javascript
localStorage.setItem('POLYGON_API_KEY', 'YOUR_ACTUAL_POLYGON_KEY_HERE');
```

Then refresh the page. The performance chart will load historical data automatically.

### Option 2: Add to JavaScript file (For deployment)

**Warning:** Only use this if your GitHub repo is private, as the API key will be visible in the source code.

Create a file `/website/polygon-config.js`:

```javascript
// polygon-config.js
window.POLYGON_API_KEY = 'YOUR_ACTUAL_POLYGON_KEY_HERE';
```

Then add it to `portfolio.html` before `portfolio-data.js`:

```html
<script src="polygon-config.js"></script>
<script src="portfolio-data.js"></script>
```

**Add to .gitignore:**
```
polygon-config.js
```

### Option 3: Use a simple PHP proxy (GoDaddy-friendly)

If you want to keep your API key secret, create a simple PHP proxy on GoDaddy:

**Create `/api/polygon.php`:**

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$apiKey = 'YOUR_POLYGON_KEY_HERE'; // Only visible on server

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

Then update `portfolio-data.js` line 356:

```javascript
// Replace the direct Polygon call with:
const url = `/api/polygon.php?ticker=${symbol}&timespan=day&from=${from}&to=${to}`;
```

## Testing

1. Open `portfolio.html` in browser
2. Open Developer Console (F12)
3. Look for:
   - ✅ "Fetching Polygon: TSM" (loading prices)
   - ✅ "Success: TSM" (data loaded)
   - ❌ "API key not found" (need to set key)

## Rate Limits

With Polygon.io **paid tier** ($29/month):
- **Unlimited** API calls
- No delays needed
- Perfect for this use case

With **free tier** (5 calls/minute):
- Add delays between calls
- May take 5-10 minutes to load all data
- Not recommended for production

## Deployment Checklist

### GitHub → GoDaddy

1. **Option A: Use localStorage**
   - Pros: No code changes, API key not in repo
   - Cons: Each user needs to set it (fine for internal use)

2. **Option B: Use PHP proxy**
   - Pros: API key stays on server, works for all users
   - Cons: Requires PHP on GoDaddy (usually included)

3. **Option C: Commit polygon-config.js to private repo**
   - Pros: Simple, works automatically
   - Cons: Only if repo is private

### Recommended for Your Setup:

Since you're using GoDaddy, I recommend **Option B (PHP proxy)**:

1. Create `/api/polygon.php` on your GoDaddy server
2. Update `portfolio-data.js` to call `/api/polygon.php` instead of polygon.io directly
3. API key stays secret, works for all visitors

## Troubleshooting

### "API key not found"
- Check localStorage: `localStorage.getItem('POLYGON_API_KEY')`
- Set it: `localStorage.setItem('POLYGON_API_KEY', 'your-key')`

### "CORS error"
- Direct polygon.io calls should work (they support CORS)
- If not, use PHP proxy option

### "No historical data"
- Check browser console for errors
- Verify API key is valid
- Check if Polygon.io API is responding

### Performance chart not loading
- Make sure Polygon.io API key is set
- Check console for "Fetching Polygon" messages
- Verify no 401/403 errors (auth issues)

## API Key Security

**Important:** Never commit your API key directly to a public GitHub repo!

✅ Safe:
- localStorage (each user sets their own)
- PHP proxy (key on server only)
- Private repo with polygon-config.js

❌ Unsafe:
- Hardcoding in JavaScript on public repo
- Committing to public GitHub

---

**Questions?** Check the browser console for detailed error messages.
