#!/usr/bin/env node
/**
 * Generate load-env.js from .env file
 *
 * Usage: node generate-env-js.js
 *
 * This reads your .env file and creates a load-env.js file
 * that can be included in the browser to load your Polygon.io API key
 */

const fs = require('fs');
const path = require('path');

// Read .env file
const envPath = path.join(__dirname, '.env');
const outputPath = path.join(__dirname, 'load-env.js');

if (!fs.existsSync(envPath)) {
    console.error('Error: .env file not found');
    console.error('Create a .env file with: POLYGON_API_KEY=your-key-here');
    process.exit(1);
}

// Parse .env file
const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');
let apiKey = null;

for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('POLYGON_API_KEY=')) {
        apiKey = trimmed.split('=')[1].trim();
        // Remove quotes if present
        apiKey = apiKey.replace(/['"]/g, '');
        break;
    }
}

if (!apiKey) {
    console.error('Error: POLYGON_API_KEY not found in .env file');
    process.exit(1);
}

// Generate load-env.js
const jsContent = `/**
 * Environment configuration for browser
 *
 * AUTO-GENERATED from .env file - DO NOT COMMIT TO GIT
 * Add load-env.js to .gitignore
 *
 * To regenerate: node generate-env-js.js
 */

// Set the API key in browser's global scope
window.POLYGON_API_KEY = '${apiKey}';

// Also set in localStorage for persistence
localStorage.setItem('POLYGON_API_KEY', window.POLYGON_API_KEY);
console.log('✅ Polygon.io API key loaded from config');
`;

fs.writeFileSync(outputPath, jsContent, 'utf8');

console.log('✅ Generated load-env.js successfully');
console.log('📝 Add this to portfolio.html:');
console.log('   <script src="load-env.js"></script>');
console.log('⚠️  Remember to add load-env.js to .gitignore!');
