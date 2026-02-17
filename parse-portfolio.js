#!/usr/bin/env node
/**
 * Parse all DIG Activity CSV files (2021-2026) to reconstruct current portfolio holdings.
 * 
 * Tracks:
 *   - YOU BOUGHT     -> adds shares at given price
 *   - YOU SOLD       -> removes shares (quantity is negative in CSV)
 *   - RECEIVED FROM YOU -> transfer in (no cost recorded)
 *   - REINVESTMENT   -> mutual fund dividend reinvestment (adds shares)
 *   - DISTRIBUTION   -> stock split distribution (adds shares, no cost — adjusts avg cost)
 *
 * Computes net shares and approximate weighted-average cost basis per symbol.
 * Skips SPAXX (money market) and Treasury bills.
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;
const CSV_FILES = [
  'DIG_2021_Activity.csv',
  'DIG_2022_Activity.csv',
  'DIG_2023_Activity.csv',
  'DIG_2024_Activity.csv',
  'DIG_2025_Activity.csv',
  'DIG_2026_Activity.csv',
];

const SKIP_SYMBOLS = new Set(['SPAXX', '']);

/**
 * Simple CSV line parser that handles quoted fields with commas.
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// Holdings: symbol -> { shares, totalCost }
const holdings = {};

function ensureSymbol(symbol) {
  if (!holdings[symbol]) {
    holdings[symbol] = { shares: 0, totalCost: 0 };
  }
}

const stats = { buys: 0, sells: 0, transfers: 0, reinvestments: 0, distributions: 0 };

for (const file of CSV_FILES) {
  const filePath = path.join(BASE_DIR, file);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const content = raw.replace(/^\uFEFF/, ''); // Remove BOM
  const lines = content.split(/\r?\n/).filter(l => l.trim());

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 7) continue;

    const action = fields[1] || '';
    const symbol = fields[2] || '';
    const price = parseFloat(fields[5]) || 0;
    const quantity = parseFloat(fields[6]) || 0;

    if (!symbol || SKIP_SYMBOLS.has(symbol)) continue;
    if (action.includes('TREAS BILLS') || action.includes('REDEMPTION PAYOUT')) continue;

    const isBuy = action.startsWith('YOU BOUGHT');
    const isSell = action.startsWith('YOU SOLD');
    const isTransferIn = action.startsWith('RECEIVED FROM YOU');
    const isReinvestment = action.startsWith('REINVESTMENT') && symbol !== 'SPAXX';
    // DISTRIBUTION = stock split shares (e.g., SCHG 3-for-1 split adds shares)
    const isDistribution = action.startsWith('DISTRIBUTION');

    if (isBuy || isTransferIn || isReinvestment) {
      ensureSymbol(symbol);
      const qty = Math.abs(quantity);
      holdings[symbol].shares += qty;
      if (price > 0) {
        holdings[symbol].totalCost += qty * price;
      }
      if (isBuy) stats.buys++;
      if (isTransferIn) stats.transfers++;
      if (isReinvestment) stats.reinvestments++;

    } else if (isDistribution) {
      // Stock split: new shares arrive, total cost basis stays the same
      // (average cost per share decreases proportionally)
      ensureSymbol(symbol);
      const qty = Math.abs(quantity);
      holdings[symbol].shares += qty;
      // Do NOT add to totalCost — cost basis is spread across more shares
      stats.distributions++;

    } else if (isSell) {
      ensureSymbol(symbol);
      const qty = Math.abs(quantity);
      // Reduce average cost proportionally
      if (holdings[symbol].shares > 0) {
        const avgCost = holdings[symbol].totalCost / holdings[symbol].shares;
        holdings[symbol].totalCost -= qty * avgCost;
      }
      holdings[symbol].shares -= qty;
      stats.sells++;
    }
  }
}

// Collect and sort results — only positions with meaningful share counts
const results = [];
for (const [symbol, data] of Object.entries(holdings)) {
  const shares = Math.round(data.shares * 1000) / 1000;
  if (Math.abs(shares) < 0.001) continue;
  const avgCost = shares > 0 ? data.totalCost / shares : 0;
  results.push({ symbol, shares, avgCost, totalCost: data.totalCost });
}

results.sort((a, b) => b.totalCost - a.totalCost);

// Print results
console.log('='.repeat(80));
console.log('DIG PORTFOLIO HOLDINGS - Reconstructed from Activity CSVs (2021-2026)');
console.log('='.repeat(80));
console.log('');
console.log(
  'Symbol'.padEnd(10) +
  'Shares'.padStart(12) +
  'Avg Cost'.padStart(12) +
  'Cost Basis'.padStart(14)
);
console.log('-'.repeat(48));

let grandTotal = 0;
for (const r of results) {
  const costStr = r.avgCost > 0 ? '$' + r.avgCost.toFixed(2) : 'N/A';
  console.log(
    r.symbol.padEnd(10) +
    r.shares.toFixed(3).padStart(12) +
    costStr.padStart(12) +
    ('$' + r.totalCost.toFixed(2)).padStart(14)
  );
  grandTotal += r.totalCost;
}

console.log('-'.repeat(48));
console.log(
  'TOTAL'.padEnd(10) +
  ''.padStart(12) +
  ''.padStart(12) +
  ('$' + grandTotal.toFixed(2)).padStart(14)
);
console.log('');
console.log('Positions: ' + results.length);
console.log('Transactions: ' + stats.buys + ' buys, ' + stats.sells + ' sells, ' +
  stats.transfers + ' transfers, ' + stats.reinvestments + ' reinvestments, ' +
  stats.distributions + ' distributions');
console.log('');
console.log('NOTE: SPY was transferred in (RECEIVED FROM YOU) with no price data,');
console.log('      so its average cost and cost basis show as $0 / N/A.');
console.log('');

// JSON output
const jsonOutput = results.map(r => ({
  symbol: r.symbol,
  shares: r.shares,
  avgCost: Math.round(r.avgCost * 100) / 100,
  costBasis: Math.round(r.totalCost * 100) / 100,
}));
console.log('JSON output:');
console.log(JSON.stringify(jsonOutput, null, 2));
