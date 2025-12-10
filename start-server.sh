#!/bin/bash

# DIG Portfolio Live Data Server Startup Script

echo "🚀 Starting UCSB Dean's Investment Group Live Portfolio Server..."
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create .env file with your Alpha Vantage API key:"
    echo "ALPHA_VANTAGE_API_KEY=your_api_key_here"
    exit 1
fi

# Check if API key is set
if grep -q "your_api_key_here" .env; then
    echo "⚠️  Warning: Please update your API key in .env file"
    echo "Replace 'your_api_key_here' with your actual Alpha Vantage API key"
    echo ""
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "🔌 Starting server on http://localhost:3001"
echo "💡 Open live-portfolio.html and click 'Connect to Live Data'"
echo ""
echo "Press Ctrl+C to stop the server"
echo "----------------------------------------"

npm start
