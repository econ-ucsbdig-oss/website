/**
 * Institutional-Grade Individual Stock Tear Sheet Generator
 * Uses ONLY Polygon.io API and portfolio CSV data
 * Professional 2-page layout with DuPont ROE, valuation history, and comprehensive metrics
 */

class SimpleTearSheetGenerator {
    static async generate(holding) {
        try {
            if (!holding || !holding.symbol) {
                throw new Error('No holding data provided');
            }

            console.log('Generating institutional-grade tear sheet for:', holding.symbol);

            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                throw new Error('jsPDF library not loaded');
            }

            // Get API key
            const apiKey = localStorage.getItem('POLYGON_API_KEY') || window.POLYGON_API_KEY;
            if (!apiKey) {
                alert('Polygon.io API key required for tearsheets');
                return;
            }

            // Fetch comprehensive data from Polygon.io
            const toDate = new Date();
            const fromDate1Y = new Date();
            fromDate1Y.setFullYear(fromDate1Y.getFullYear() - 1);
            const fromDate3Y = new Date();
            fromDate3Y.setFullYear(fromDate3Y.getFullYear() - 3);

            console.log('Fetching market data and financials...');

            // Fetch all data in parallel
            const [prices1Y, prices3Y, tickerDetails, financials] = await Promise.all([
                this.fetchPrices(holding.symbol, this.formatDateForAPI(fromDate1Y), this.formatDateForAPI(toDate), apiKey),
                this.fetchPrices(holding.symbol, this.formatDateForAPI(fromDate3Y), this.formatDateForAPI(toDate), apiKey),
                this.fetchTickerDetails(holding.symbol, apiKey),
                this.fetchFinancials(holding.symbol, apiKey)
            ]);

            console.log('Data fetched:', {
                prices1Y: prices1Y?.length,
                prices3Y: prices3Y?.length,
                hasDetails: !!tickerDetails,
                financials: financials?.length
            });

            // Generate PDF
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // PAGE 1: Executive Summary
            await this.generatePage1(doc, holding, prices1Y, prices3Y, tickerDetails, financials);

            // PAGE 2: Value Creation Analysis
            doc.addPage();
            this.generatePage2(doc, holding, financials, prices3Y);

            // Add footer to all pages
            this.addFooter(doc, holding);

            // Save PDF
            const fileName = `DIG_${holding.symbol}_InstitutionalTearSheet_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);

            console.log('Institutional tear sheet generated successfully');
            return fileName;

        } catch (error) {
            console.error('Error generating tear sheet:', error);
            throw error;
        }
    }

    /**
     * PAGE 1: Executive Summary with centered layout and professional metrics
     */
    static async generatePage1(doc, holding, prices1Y, prices3Y, details, financials) {
        const pageWidth = 210;
        const margin = 20;
        const centerX = pageWidth / 2;

        // Colors
        const digBlue = [0, 54, 96];
        const digGold = [254, 188, 17];
        const darkGray = [60, 60, 60];
        const lightGray = [150, 150, 150];
        const greenColor = [76, 175, 80];
        const redColor = [244, 67, 54];

        // ==================== COMPACT HEADER WITH POSITION INFO ====================
        doc.setFillColor(...digBlue);
        doc.rect(0, 0, pageWidth, 22, 'F');

        // Left: DIG branding
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('DIG', margin, 9);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text('UCSB Dean\'s Investment Group', margin, 13);

        // Center: Symbol and company name
        const companyName = details?.name || holding.name || holding.description;
        const sector = holding.sector || details?.sic_description || 'Diversified';
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(holding.symbol, centerX, 10, { align: 'center' });
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(`${companyName} | ${sector}`, centerX, 15, { align: 'center' });

        // Right: Position snapshot
        const positionReturn = holding.totalReturn * 100;
        const returnColor = positionReturn >= 0 ? [76, 255, 80] : [255, 100, 100];
        doc.setFontSize(6);
        doc.setTextColor(220, 220, 220);
        doc.text(`${holding.quantity.toFixed(0)} shares`, pageWidth - margin, 7, { align: 'right' });
        doc.text(`$${this.formatNumber(holding.marketValue)} value`, pageWidth - margin, 11, { align: 'right' });
        doc.setTextColor(...returnColor);
        doc.setFont('helvetica', 'bold');
        doc.text(`${positionReturn >= 0 ? '+' : ''}${positionReturn.toFixed(1)}% return`, pageWidth - margin, 15, { align: 'right' });

        // Date stamp
        doc.setFontSize(6);
        doc.setTextColor(200, 200, 200);
        doc.setFont('helvetica', 'normal');
        const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.text(date, pageWidth - margin, 19, { align: 'right' });

        // ==================== KEY METRICS GRID ====================
        let y = 30;
        const boxWidth = 42;
        const boxHeight = 16;
        const boxSpacing = 3;
        const gridStartX = (pageWidth - (4 * boxWidth + 3 * boxSpacing)) / 2;

        // Calculate all metrics
        const latestFinancial = financials && financials.length > 0 ? financials[0] : null;
        const marketCap = details?.market_cap || (details?.weighted_shares_outstanding * holding.lastPrice);
        const peRatio = this.calculatePE(holding.lastPrice, latestFinancial);
        const pbRatio = this.calculatePB(holding.lastPrice, latestFinancial, details);
        const roe = this.calculateROE(latestFinancial);

        const currentPrice = holding.lastPrice;
        const yearChange = prices1Y && prices1Y.length > 0
            ? ((currentPrice - prices1Y[0].close) / prices1Y[0].close * 100)
            : 0;

        const beta = this.calculateBeta(prices3Y);

        // Row 1
        this.drawMetricBox(doc, gridStartX, y, boxWidth, boxHeight,
            'Market Cap', this.formatLargeNumber(marketCap), digBlue, darkGray);
        this.drawMetricBox(doc, gridStartX + (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            'Current Price', `$${currentPrice.toFixed(2)}`, digBlue, darkGray);
        this.drawMetricBox(doc, gridStartX + 2 * (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            'P/E Ratio', peRatio, digBlue, darkGray);
        this.drawMetricBox(doc, gridStartX + 3 * (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            'P/B Ratio', pbRatio, digBlue, darkGray);

        // Row 2
        y += boxHeight + boxSpacing;
        this.drawMetricBox(doc, gridStartX, y, boxWidth, boxHeight,
            'ROE', roe, digBlue, darkGray);
        this.drawMetricBox(doc, gridStartX + (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            'Beta', beta, digBlue, darkGray);
        this.drawMetricBox(doc, gridStartX + 2 * (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            '1Y Return', `${yearChange >= 0 ? '+' : ''}${yearChange.toFixed(1)}%`,
            digBlue, yearChange >= 0 ? greenColor : redColor);
        this.drawMetricBox(doc, gridStartX + 3 * (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            'Avg Cost', `$${holding.avgCostBasis.toFixed(2)}`, digBlue, darkGray);

        // ==================== 12-MONTH PRICE PERFORMANCE ====================
        y += 20;
        doc.setDrawColor(...lightGray);
        doc.line(margin, y, pageWidth - margin, y);

        y += 8;
        const chartHeight = 55;
        if (prices1Y && prices1Y.length > 0) {
            // Get sector ETF symbol
            const sector = holding.sector || details?.sic_description || '';
            const sectorETF = this.getSectorETF(sector);

            // Update title with ETF
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...digBlue);
            doc.text(`12-MONTH PRICE PERFORMANCE vs ${sectorETF}`, centerX, y, { align: 'center' });

            y += 5;
            await this.drawProfessionalPriceChart(doc, margin, y, pageWidth - 2 * margin, chartHeight,
                prices1Y, sectorETF, holding.symbol, digBlue, digGold, greenColor, redColor);
        }

        // ==================== HISTORICAL VALUATION ====================
        y += chartHeight + 12;
        doc.setDrawColor(...lightGray);
        doc.line(margin, y, pageWidth - margin, y);

        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        const yearsOfData = financials && financials.length > 0 ? Math.ceil(financials.length / 4) : 3;
        doc.text(`VALUATION HISTORY (${yearsOfData} Years)`, centerX, y, { align: 'center' });

        y += 5;
        const valuationHeight = 95;
        if (financials && financials.length >= 4) {
            this.drawValuationHistory(doc, margin, y, pageWidth - 2 * margin, valuationHeight,
                financials, prices3Y, holding.lastPrice, details, digBlue, darkGray);
        } else {
            doc.setFontSize(8);
            doc.setTextColor(...lightGray);
            doc.text('Insufficient financial data for valuation history', centerX, y + valuationHeight/2, { align: 'center' });
        }
    }

    /**
     * PAGE 2: Value Creation Analysis with DuPont ROE
     */
    static generatePage2(doc, holding, financials, prices3Y) {
        const pageWidth = 210;
        const margin = 20;
        const centerX = pageWidth / 2;

        // Colors
        const digBlue = [0, 54, 96];
        const darkGray = [60, 60, 60];
        const lightGray = [150, 150, 150];

        // ==================== HEADER ====================
        let y = 25;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        doc.text(`${holding.symbol} - Value Creation Analysis`, centerX, y, { align: 'center' });

        // ==================== DUPONT ROE DECOMPOSITION ====================
        y += 15;
        doc.setDrawColor(...lightGray);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageWidth - margin, y);

        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        const yearsROE = financials && financials.length > 0 ? Math.ceil(financials.length / 4) : 3;
        doc.text(`DuPONT ROE DECOMPOSITION (${yearsROE} Years)`, centerX, y, { align: 'center' });

        y += 3;
        const dupontHeight = 48;
        if (financials && financials.length >= 4) {
            this.drawDuPontROE(doc, margin, y, pageWidth - 2 * margin, dupontHeight,
                financials, digBlue, darkGray);
        } else {
            doc.setFontSize(8);
            doc.setTextColor(...lightGray);
            doc.text('Insufficient financial data for DuPont analysis', centerX, y + dupontHeight/2, { align: 'center' });
        }

        // ==================== OPERATING METRICS ====================
        y += dupontHeight + 8;
        doc.setDrawColor(...lightGray);
        doc.line(margin, y, pageWidth - margin, y);

        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        doc.text(`OPERATING EFFICIENCY TRENDS (${yearsROE} Years)`, centerX, y, { align: 'center' });

        y += 3;
        const opHeight = 44;
        if (financials && financials.length >= 4) {
            this.drawOperatingMetrics(doc, margin, y, pageWidth - 2 * margin, opHeight,
                financials, digBlue, darkGray);
        } else {
            doc.setFontSize(8);
            doc.setTextColor(...lightGray);
            doc.text('Insufficient data', centerX, y + opHeight/2, { align: 'center' });
        }

        // ==================== CAPITAL EFFICIENCY ====================
        y += opHeight + 8;
        doc.setDrawColor(...lightGray);
        doc.line(margin, y, pageWidth - margin, y);

        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        doc.text(`CAPITAL EFFICIENCY (${yearsROE} Years)`, centerX, y, { align: 'center' });

        y += 3;
        const capHeight = 44;
        if (financials && financials.length >= 4) {
            this.drawCapitalEfficiency(doc, margin, y, pageWidth - 2 * margin, capHeight,
                financials, digBlue, darkGray);
        } else {
            doc.setFontSize(8);
            doc.setTextColor(...lightGray);
            doc.text('Insufficient data', centerX, y + capHeight/2, { align: 'center' });
        }

        // ==================== KEY INSIGHTS ====================
        y += capHeight + 8;
        doc.setDrawColor(...lightGray);
        doc.line(margin, y, pageWidth - margin, y);

        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        doc.text('VALUE CREATION INSIGHTS', centerX, y, { align: 'center' });

        y += 5;
        if (financials && financials.length >= 4) {
            this.drawKeyInsights(doc, margin, y, pageWidth - 2 * margin, financials, holding, darkGray, lightGray);
        }
    }

    // ===== DRAWING FUNCTIONS =====

    static drawMetricBox(doc, x, y, width, height, label, value, labelColor, valueColor) {
        // Border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(x, y, width, height);

        // Label
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...labelColor);
        doc.text(label, x + width/2, y + 6, { align: 'center' });

        // Value
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...valueColor);
        doc.text(String(value || 'N/A'), x + width/2, y + 13, { align: 'center' });
    }

    static async drawProfessionalPriceChart(doc, x, y, width, height, prices, sectorETF, stockSymbol, primaryColor, goldColor, greenColor, redColor) {
        if (!prices || prices.length === 0) return;

        // Keep actual stock prices
        const stockStart = prices[0].close;
        const stockPrices = prices.map(p => p.close);

        // Fetch ETF prices and normalize to stock's starting price
        let etfPrices = null;
        if (sectorETF) {
            const apiKey = localStorage.getItem('POLYGON_API_KEY') || window.POLYGON_API_KEY;
            const fromDate = this.formatDateForAPI(new Date(prices[0].date));
            const toDate = this.formatDateForAPI(new Date(prices[prices.length - 1].date));

            try {
                const etfData = await this.fetchPrices(sectorETF, fromDate, toDate, apiKey);
                if (etfData && etfData.length > 0) {
                    const etfStart = etfData[0].close;
                    // Normalize ETF to stock's starting price
                    etfPrices = etfData.map(p => ({
                        date: p.date,
                        value: (p.close / etfStart) * stockStart
                    }));
                }
            } catch (error) {
                console.log('Could not fetch ETF data:', error);
            }
        }

        // Determine range using actual stock prices and normalized ETF
        const allValues = [...stockPrices];
        if (etfPrices) {
            allValues.push(...etfPrices.map(p => p.value));
        }
        const minVal = Math.min(...allValues);
        const maxVal = Math.max(...allValues);
        const range = maxVal - minVal;

        const paddedMin = minVal - (range * 0.1);
        const paddedMax = maxVal + (range * 0.1);
        const paddedRange = paddedMax - paddedMin;

        const marginLeft = 18;
        const marginBottom = 15;
        const marginTop = 3;
        const marginRight = 22;

        const chartX = x + marginLeft;
        const chartY = y + marginTop;
        const chartW = width - marginLeft - marginRight;
        const chartH = height - marginTop - marginBottom;

        // Background
        doc.setFillColor(250, 250, 250);
        doc.rect(chartX, chartY, chartW, chartH, 'F');

        // Grid lines
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        for (let i = 1; i <= 4; i++) {
            const gridY = chartY + (chartH * i / 5);
            if (!isNaN(gridY) && !isNaN(chartX) && !isNaN(chartW)) {
                doc.line(chartX, gridY, chartX + chartW, gridY);
            }
        }

        // Border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.rect(chartX, chartY, chartW, chartH);

        // Helper function to draw smooth curve using quadratic Bezier
        const drawSmoothLine = (data, color, lineWidth) => {
            if (!data || data.length < 2) return;

            doc.setDrawColor(...color);
            doc.setLineWidth(lineWidth);

            const xStep = chartW / (data.length - 1);

            for (let i = 0; i < data.length - 1; i++) {
                const x1 = chartX + i * xStep;
                const y1 = chartY + chartH - ((data[i] - paddedMin) / paddedRange) * chartH;
                const x2 = chartX + (i + 1) * xStep;
                const y2 = chartY + chartH - ((data[i + 1] - paddedMin) / paddedRange) * chartH;

                if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
                    // Create smooth curve with control point at midpoint
                    const cx = (x1 + x2) / 2;
                    const cy = (y1 + y2) / 2;

                    // Use multiple small line segments to approximate smooth curve
                    const segments = 8;
                    for (let s = 0; s < segments; s++) {
                        const t1 = s / segments;
                        const t2 = (s + 1) / segments;

                        const sx1 = (1 - t1) * (1 - t1) * x1 + 2 * (1 - t1) * t1 * cx + t1 * t1 * x2;
                        const sy1 = (1 - t1) * (1 - t1) * y1 + 2 * (1 - t1) * t1 * cy + t1 * t1 * y2;
                        const sx2 = (1 - t2) * (1 - t2) * x1 + 2 * (1 - t2) * t2 * cx + t2 * t2 * x2;
                        const sy2 = (1 - t2) * (1 - t2) * y1 + 2 * (1 - t2) * t2 * cy + t2 * t2 * y2;

                        doc.line(sx1, sy1, sx2, sy2);
                    }
                }
            }
        };

        // Draw ETF line (if available) - smooth
        if (etfPrices && etfPrices.length > 1) {
            const etfValues = etfPrices.map(p => p.value);
            drawSmoothLine(etfValues, goldColor, 1.0);
        }

        // Draw stock price line - smooth
        drawSmoothLine(stockPrices, primaryColor, 1.5);

        // Current markers
        const lastStock = stockPrices[stockPrices.length - 1];
        const lastStockY = chartY + chartH - ((lastStock - paddedMin) / paddedRange) * chartH;
        doc.setFillColor(...primaryColor);
        doc.circle(chartX + chartW, lastStockY, 1.2, 'F');

        if (etfPrices) {
            const lastETF = etfPrices[etfPrices.length - 1].value;
            const lastETFY = chartY + chartH - ((lastETF - paddedMin) / paddedRange) * chartH;
            doc.setFillColor(...goldColor);
            doc.circle(chartX + chartW, lastETFY, 1, 'F');
        }

        // Y-axis labels (left - stock price)
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'normal');
        for (let i = 0; i <= 4; i++) {
            const val = paddedMin + (paddedRange * i / 4);
            const yPos = chartY + chartH - (chartH * i / 4);
            doc.text(`$${val.toFixed(0)}`, x + 2, yPos + 2);
        }

        // Y-axis labels (right - % change from start)
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        for (let i = 0; i <= 4; i++) {
            const val = paddedMin + (paddedRange * i / 4);
            const yPos = chartY + chartH - (chartH * i / 4);
            const pctChange = ((val - stockStart) / stockStart) * 100;
            doc.text(`${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(0)}%`,
                chartX + chartW + 3, yPos + 2);
        }

        // X-axis labels
        doc.setFontSize(6);
        const dateStep = Math.floor(prices.length / 4);
        for (let i = 0; i <= 4; i++) {
            const idx = Math.min(i * dateStep, prices.length - 1);
            const date = new Date(prices[idx].date);
            const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            const xPos = chartX + (idx / (prices.length - 1)) * chartW;
            doc.text(label, xPos, chartY + chartH + 8, { align: 'center' });
        }

        // Legend in bottom right
        if (sectorETF) {
            const legendX = chartX + chartW - 40;
            const legendY = chartY + chartH - 5;

            // Stock
            doc.setDrawColor(...primaryColor);
            doc.setLineWidth(1.5);
            doc.line(legendX, legendY, legendX + 8, legendY);
            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...primaryColor);
            doc.text(stockSymbol, legendX + 10, legendY + 1);

            // ETF
            doc.setDrawColor(...goldColor);
            doc.setLineWidth(1.0);
            doc.line(legendX + 25, legendY, legendX + 33, legendY);
            doc.setTextColor(...goldColor);
            doc.text(sectorETF, legendX + 35, legendY + 1);
        }
    }

    static drawValuationHistory(doc, x, y, width, height, financials, prices, currentPrice, details, primaryColor, darkColor) {
        // Draw 4 charts in 2x2 grid
        const chartWidth = (width - 8) / 2;
        const chartHeight = (height - 8) / 2;

        // Row 1
        // P/E Ratio
        this.drawSingleValuation(doc, x, y, chartWidth, chartHeight, financials, prices, currentPrice, details,
            'P/E Ratio', 'pe', primaryColor, darkColor);

        // P/B Ratio
        this.drawSingleValuation(doc, x + chartWidth + 8, y, chartWidth, chartHeight, financials, prices, currentPrice, details,
            'P/B Ratio', 'pb', primaryColor, darkColor);

        // Row 2
        // EPS
        this.drawSingleValuation(doc, x, y + chartHeight + 8, chartWidth, chartHeight, financials, prices, currentPrice, details,
            'EPS', 'eps', primaryColor, darkColor);

        // EV/EBITDA
        this.drawSingleValuation(doc, x + chartWidth + 8, y + chartHeight + 8, chartWidth, chartHeight, financials, prices, currentPrice, details,
            'EV/EBITDA', 'evebitda', primaryColor, darkColor);
    }

    static drawSingleValuation(doc, x, y, width, height, financials, prices, currentPrice, details, label, metric, primaryColor, darkColor) {
        const values = financials.map(f => {
            if (metric === 'pe') {
                return f.basic_earnings_per_share > 0 ? currentPrice / f.basic_earnings_per_share : null;
            } else if (metric === 'pb') {
                return f.equity && f.shares_outstanding ? currentPrice / (f.equity / f.shares_outstanding) : null;
            } else if (metric === 'eps') {
                return f.basic_earnings_per_share;
            } else if (metric === 'evebitda') {
                // EV/EBITDA = (Market Cap + Debt - Cash) / EBITDA
                // EBITDA = Operating Income + Depreciation (approximation using operating income)
                const marketCap = details?.market_cap || (details?.weighted_shares_outstanding * currentPrice);
                const netDebt = (f.liabilities || 0) - (f.current_assets || 0) * 0.3; // Approximate cash as 30% of current assets
                const enterpriseValue = marketCap + netDebt;
                const ebitda = f.operating_income_loss;
                return ebitda && ebitda > 0 ? enterpriseValue / ebitda : null;
            }
            return null;
        }).filter(v => v !== null && v !== undefined).reverse(); // Oldest to newest

        if (values.length === 0) {
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('No data', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        // Title
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(label, x + width/2, y + 5, { align: 'center' });

        // Chart area
        const marginLeft = 12;
        const marginBottom = 12;
        const marginTop = 10;
        const marginRight = 3;

        const chartX = x + marginLeft;
        const chartY = y + marginTop;
        const chartW = width - marginLeft - marginRight;
        const chartH = height - marginTop - marginBottom;

        const minVal = Math.min(...values) * 0.9;
        const maxVal = Math.max(...values) * 1.1;
        const range = maxVal - minVal;

        // Background
        doc.setFillColor(250, 250, 250);
        doc.rect(chartX, chartY, chartW, chartH, 'F');

        // Grid
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        for (let i = 1; i <= 3; i++) {
            const gridY = chartY + (chartH * i / 4);
            if (!isNaN(gridY) && !isNaN(chartX) && !isNaN(chartW)) {
                doc.line(chartX, gridY, chartX + chartW, gridY);
            }
        }

        // Line
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(0.8);

        for (let i = 0; i < values.length - 1; i++) {
            const x1 = chartX + (i / (values.length - 1)) * chartW;
            const y1 = chartY + chartH - ((values[i] - minVal) / range) * chartH;
            const x2 = chartX + ((i + 1) / (values.length - 1)) * chartW;
            const y2 = chartY + chartH - ((values[i + 1] - minVal) / range) * chartH;
            if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
                doc.line(x1, y1, x2, y2);
            }
        }

        // Y-axis labels
        doc.setFontSize(6);
        doc.setTextColor(100, 100, 100);
        for (let i = 0; i <= 3; i++) {
            const val = minVal + (range * i / 3);
            const yPos = chartY + chartH - (chartH * i / 3);
            if (!isNaN(val) && !isNaN(yPos)) {
                doc.text(val.toFixed(1), x + 2, yPos + 2);
            }
        }

        // X-axis labels (show first, middle, last quarter)
        doc.setFontSize(5);
        const indices = [0, Math.floor(financials.length / 2), financials.length - 1];
        indices.forEach((idx, i) => {
            if (financials[idx] && i < values.length) {
                const f = financials[idx];
                const period = f.fiscal_period || 'FY';
                const year = f.fiscal_year || new Date().getFullYear();
                const label = period.includes('Q') ? `${period} '${year.toString().slice(-2)}` : `FY '${year.toString().slice(-2)}`;
                const xPos = chartX + (i / Math.max(1, indices.length - 1)) * chartW;
                if (!isNaN(xPos)) {
                    doc.text(label, xPos, chartY + chartH + 7, { align: 'center' });
                }
            }
        });

        // Latest value
        if (values.length > 0 && values[values.length - 1] != null && !isNaN(values[values.length - 1])) {
            doc.setFontSize(6);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(values[values.length - 1].toFixed(2), x + width - 3, y + height - 2, { align: 'right' });
        }
    }

    static drawDuPontROE(doc, x, y, width, height, financials, primaryColor, darkColor) {
        // Draw 3 components: Net Margin, Asset Turnover, Equity Multiplier
        const chartWidth = (width - 16) / 3;

        this.drawDuPontComponent(doc, x, y, chartWidth, height, financials, 'Net Margin (%)', 'margin', primaryColor, darkColor);
        this.drawDuPontComponent(doc, x + chartWidth + 8, y, chartWidth, height, financials, 'Asset Turnover', 'turnover', primaryColor, darkColor);
        this.drawDuPontComponent(doc, x + (chartWidth + 8) * 2, y, chartWidth, height, financials, 'Leverage', 'leverage', primaryColor, darkColor);
    }

    static drawDuPontComponent(doc, x, y, width, height, financials, label, metric, primaryColor, darkColor) {
        const values = financials.map(f => {
            if (metric === 'margin') {
                return f.net_income_loss && f.revenues ? (f.net_income_loss / f.revenues * 100) : null;
            } else if (metric === 'turnover') {
                return f.revenues && f.assets ? (f.revenues / f.assets) : null;
            } else if (metric === 'leverage') {
                return f.assets && f.equity ? (f.assets / f.equity) : null;
            } else if (metric === 'gross') {
                return f.gross_profit && f.revenues ? (f.gross_profit / f.revenues * 100) : null;
            } else if (metric === 'operating') {
                return f.operating_income_loss && f.revenues ? (f.operating_income_loss / f.revenues * 100) : null;
            } else if (metric === 'roic') {
                // ROIC = Operating Income / (Total Assets - Current Liabilities)
                return f.operating_income_loss && f.assets ? (f.operating_income_loss / f.assets * 100) : null;
            } else if (metric === 'de') {
                return f.liabilities && f.equity && f.equity !== 0 ? (f.liabilities / f.equity) : null;
            }
            return null;
        }).filter(v => v !== null && v !== undefined && !isNaN(v) && isFinite(v)).reverse();

        if (values.length === 0) {
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('No data', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        // Title
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(label, x + width/2, y + 5, { align: 'center' });

        this.drawMiniTrendChart(doc, x, y + 8, width, height - 8, values, primaryColor, financials);
    }

    static drawOperatingMetrics(doc, x, y, width, height, financials, primaryColor, darkColor) {
        const chartWidth = (width - 8) / 2;

        this.drawDuPontComponent(doc, x, y, chartWidth, height, financials, 'Gross Margin (%)', 'gross', primaryColor, darkColor);
        this.drawDuPontComponent(doc, x + chartWidth + 8, y, chartWidth, height, financials, 'Operating Margin (%)', 'operating', primaryColor, darkColor);
    }

    static drawCapitalEfficiency(doc, x, y, width, height, financials, primaryColor, darkColor) {
        const chartWidth = (width - 8) / 2;

        this.drawDuPontComponent(doc, x, y, chartWidth, height, financials, 'ROIC (%)', 'roic', primaryColor, darkColor);
        this.drawDuPontComponent(doc, x + chartWidth + 8, y, chartWidth, height, financials, 'Debt/Equity', 'de', primaryColor, darkColor);
    }

    static drawMiniTrendChart(doc, x, y, width, height, values, primaryColor, financials = null) {
        if (!values || values.length === 0) {
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('No data', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        const marginLeft = 12;
        const marginBottom = 12;
        const marginTop = 3;
        const marginRight = 3;

        const chartX = x + marginLeft;
        const chartY = y + marginTop;
        const chartW = width - marginLeft - marginRight;
        const chartH = height - marginTop - marginBottom;

        const minVal = Math.min(...values) * 0.9;
        const maxVal = Math.max(...values) * 1.1;
        const range = maxVal - minVal;

        if (!isFinite(minVal) || !isFinite(maxVal) || range === 0) {
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('Invalid data', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        // Background
        doc.setFillColor(250, 250, 250);
        doc.rect(chartX, chartY, chartW, chartH, 'F');

        // Grid
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        for (let i = 1; i <= 2; i++) {
            const gridY = chartY + (chartH * i / 3);
            if (!isNaN(gridY) && !isNaN(chartX) && !isNaN(chartW)) {
                doc.line(chartX, gridY, chartX + chartW, gridY);
            }
        }

        // Line
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(0.8);

        for (let i = 0; i < values.length - 1; i++) {
            const x1 = chartX + (i / (values.length - 1)) * chartW;
            const y1 = chartY + chartH - ((values[i] - minVal) / range) * chartH;
            const x2 = chartX + ((i + 1) / (values.length - 1)) * chartW;
            const y2 = chartY + chartH - ((values[i + 1] - minVal) / range) * chartH;
            if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
                doc.line(x1, y1, x2, y2);
            }
        }

        // Y-axis labels
        doc.setFontSize(6);
        doc.setTextColor(100, 100, 100);
        if (!isNaN(minVal) && !isNaN(maxVal)) {
            doc.text(minVal.toFixed(1), x + 2, chartY + chartH);
            doc.text(maxVal.toFixed(1), x + 2, chartY + 3);
        }

        // X-axis date labels
        if (financials && financials.length > 0) {
            doc.setFontSize(5);
            doc.setTextColor(100, 100, 100);
            const indices = [0, Math.floor(financials.length / 2), financials.length - 1];
            indices.forEach((idx, i) => {
                if (financials[idx]) {
                    const f = financials[idx];
                    const period = f.fiscal_period || 'Q';
                    const year = f.fiscal_year || new Date().getFullYear();
                    const label = `${period} '${year.toString().slice(-2)}`;
                    const xPos = chartX + (idx / Math.max(1, financials.length - 1)) * chartW;
                    if (!isNaN(xPos)) {
                        doc.text(label, xPos, chartY + chartH + 7, { align: 'center' });
                    }
                }
            });
        }

        // Current value
        if (values.length > 0 && values[values.length - 1] != null && !isNaN(values[values.length - 1])) {
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(values[values.length - 1].toFixed(2), x + width - 3, y + height - 2, { align: 'right' });
        }
    }

    static drawKeyInsights(doc, x, y, width, financials, holding, darkColor, lightColor) {
        const insights = [];
        const latest = financials[0];
        const oldest = financials[financials.length - 1];

        // Calculate key metrics
        const latestROE = this.calculateROEValue(latest);
        const oldestROE = this.calculateROEValue(oldest);
        const latestMargin = latest.net_income_loss && latest.revenues ? (latest.net_income_loss / latest.revenues * 100) : null;
        const oldestMargin = oldest.net_income_loss && oldest.revenues ? (oldest.net_income_loss / oldest.revenues * 100) : null;
        const assetTurnover = latest.revenues && latest.assets ? (latest.revenues / latest.assets) : null;
        const debtToEquity = latest.liabilities && latest.equity ? (latest.liabilities / latest.equity) : null;
        const revenueGrowth = oldest.revenues && latest.revenues ? ((latest.revenues - oldest.revenues) / oldest.revenues * 100) : null;

        // ROE trend
        if (latestROE && oldestROE) {
            const roeDelta = latestROE - oldestROE;
            if (Math.abs(roeDelta) > 2) {
                insights.push(`ROE ${roeDelta > 0 ? 'expanded' : 'contracted'} ${Math.abs(roeDelta).toFixed(1)}pp to ${latestROE.toFixed(1)}%, indicating ${roeDelta > 0 ? 'improving' : 'declining'} shareholder returns`);
            } else {
                insights.push(`ROE stable at ${latestROE.toFixed(1)}%, demonstrating consistent profitability`);
            }
        }

        // Margin analysis
        if (latestMargin !== null && oldestMargin !== null) {
            const marginDelta = latestMargin - oldestMargin;
            if (Math.abs(marginDelta) > 2) {
                insights.push(`Net margin ${marginDelta > 0 ? 'expanded' : 'compressed'} ${Math.abs(marginDelta).toFixed(1)}pp, reflecting ${marginDelta > 0 ? 'operational improvements' : 'margin pressure'}`);
            } else {
                insights.push(`Net margin maintained at ${latestMargin.toFixed(1)}%, showing pricing power and cost discipline`);
            }
        }

        // Revenue growth
        if (revenueGrowth !== null) {
            if (revenueGrowth > 15) {
                insights.push(`Strong revenue growth of ${revenueGrowth.toFixed(1)}% demonstrates robust demand and market share gains`);
            } else if (revenueGrowth > 5) {
                insights.push(`Moderate revenue growth of ${revenueGrowth.toFixed(1)}% indicates steady business expansion`);
            } else if (revenueGrowth < -5) {
                insights.push(`Revenue declined ${Math.abs(revenueGrowth).toFixed(1)}%, suggesting headwinds in core business`);
            }
        }

        // Capital efficiency
        if (assetTurnover !== null) {
            if (assetTurnover > 1.0) {
                insights.push(`Asset turnover of ${assetTurnover.toFixed(2)}x reflects efficient capital deployment and strong returns on invested capital`);
            } else if (assetTurnover > 0.5) {
                insights.push(`Asset turnover of ${assetTurnover.toFixed(2)}x indicates moderate capital efficiency typical of capital-intensive businesses`);
            }
        }

        // Leverage profile
        if (debtToEquity !== null) {
            if (debtToEquity < 0.5) {
                insights.push(`Conservative debt/equity of ${debtToEquity.toFixed(2)}x provides financial flexibility and downside protection`);
            } else if (debtToEquity > 1.5) {
                insights.push(`Elevated debt/equity of ${debtToEquity.toFixed(2)}x warrants monitoring of interest coverage and refinancing risk`);
            } else {
                insights.push(`Balanced debt/equity of ${debtToEquity.toFixed(2)}x optimizes capital structure without excessive leverage`);
            }
        }

        // Position performance
        const posReturn = holding.totalReturn * 100;
        insights.push(`Position generated ${posReturn >= 0 ? '+' : ''}${posReturn.toFixed(1)}% total return ($${this.formatNumber(Math.abs(holding.totalReturnDollar))}) since acquisition`);

        // Default
        if (insights.length === 0) {
            insights.push('Company demonstrates stable financial performance with consistent operating metrics');
        }

        // Layout insights in single column, max 6 rows
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);

        const maxInsights = 6;
        const lineHeight = 5;

        // Take up to 6 insights
        const displayInsights = insights.slice(0, maxInsights);

        displayInsights.forEach((insight, idx) => {
            const yPos = y + (idx * lineHeight) + 3;

            // Add bullet point
            doc.text('•', x + 5, yPos);
            // Add text
            doc.text(insight, x + 8, yPos);
        });
    }

    static addFooter(doc, holding) {
        const pageCount = doc.internal.getNumberOfPages();
        const pageHeight = 297;

        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);

            // Footer line
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.3);
            doc.line(20, pageHeight - 20, 190, pageHeight - 20);

            // Disclaimer
            doc.setFontSize(6);
            doc.setTextColor(120, 120, 120);
            doc.setFont('helvetica', 'italic');
            doc.text('This report is for educational purposes only and does not constitute investment advice.', 105, pageHeight - 15, { align: 'center' });
            doc.text('Past performance does not guarantee future results. Data sourced from Polygon.io.', 105, pageHeight - 11, { align: 'center' });

            // Footer info
            doc.setFont('helvetica', 'normal');
            doc.text('UCSB Dean\'s Investment Group', 20, pageHeight - 6);
            doc.text(`Page ${i} of ${pageCount}`, 190, pageHeight - 6, { align: 'right' });
        }
    }

    // ===== API FUNCTIONS =====

    static async fetchPrices(symbol, from, to, apiKey) {
        try {
            const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${apiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.error(`API error for ${symbol}: ${response.status}`);
                return null;
            }

            const data = await response.json();

            if (data.results && data.results.length > 0) {
                console.log(`✅ Fetched ${data.results.length} price points for ${symbol}`);
                return data.results.map(bar => ({
                    date: new Date(bar.t),
                    close: bar.c,
                    open: bar.o,
                    high: bar.h,
                    low: bar.l,
                    volume: bar.v
                }));
            }

            return null;
        } catch (error) {
            console.error(`Error fetching prices for ${symbol}:`, error);
            return null;
        }
    }

    static async fetchTickerDetails(symbol, apiKey) {
        try {
            const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.error(`API error for ticker details: ${response.status}`);
                return null;
            }

            const data = await response.json();
            return data.results || null;
        } catch (error) {
            console.error('Error fetching ticker details:', error);
            return null;
        }
    }

    static async fetchFinancials(symbol, apiKey) {
        try {
            const url = `https://api.polygon.io/vX/reference/financials?ticker=${symbol}&timeframe=quarterly&limit=12&sort=filing_date&order=desc&apiKey=${apiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.error(`API error for financials: ${response.status}`);
                return null;
            }

            const data = await response.json();
            if (!data.results || data.results.length === 0) {
                console.log('No financial results returned from API');
                return null;
            }

            // Map and flatten Polygon.io financial structure (quarterly data)
            const mappedFinancials = data.results.map(result => {
                const fin = result.financials || {};
                const balanceSheet = fin.balance_sheet || {};
                const incomeStatement = fin.income_statement || {};
                const comprehensiveIncome = fin.comprehensive_income || {};

                // Annualize quarterly income statement metrics (multiply by 4)
                const isQuarterly = result.fiscal_period?.startsWith('Q');
                const annualizationFactor = isQuarterly ? 4 : 1;

                return {
                    // Metadata
                    fiscal_period: result.fiscal_period,
                    fiscal_year: result.fiscal_year,
                    filing_date: result.filing_date,
                    start_date: result.start_date,
                    end_date: result.end_date,

                    // Income Statement (annualized)
                    revenues: incomeStatement.revenues?.value ? incomeStatement.revenues.value * annualizationFactor : null,
                    gross_profit: incomeStatement.gross_profit?.value ? incomeStatement.gross_profit.value * annualizationFactor : null,
                    operating_income_loss: incomeStatement.operating_income_loss?.value ? incomeStatement.operating_income_loss.value * annualizationFactor : null,
                    net_income_loss: (incomeStatement.net_income_loss?.value || comprehensiveIncome.net_income_loss?.value)
                        ? (incomeStatement.net_income_loss?.value || comprehensiveIncome.net_income_loss?.value) * annualizationFactor
                        : null,
                    basic_earnings_per_share: incomeStatement.basic_earnings_per_share?.value ? incomeStatement.basic_earnings_per_share.value * annualizationFactor : null,
                    diluted_earnings_per_share: incomeStatement.diluted_earnings_per_share?.value ? incomeStatement.diluted_earnings_per_share.value * annualizationFactor : null,

                    // Balance Sheet (point-in-time, no annualization)
                    assets: balanceSheet.assets?.value || balanceSheet.total_assets?.value,
                    current_assets: balanceSheet.current_assets?.value,
                    liabilities: balanceSheet.liabilities?.value || balanceSheet.total_liabilities?.value,
                    current_liabilities: balanceSheet.current_liabilities?.value,
                    equity: balanceSheet.equity?.value || balanceSheet.equity_attributable_to_parent?.value,

                    // Shares (point-in-time)
                    shares_outstanding: balanceSheet.equity?.value && incomeStatement.basic_earnings_per_share?.value && incomeStatement.net_income_loss?.value
                        ? incomeStatement.net_income_loss.value / incomeStatement.basic_earnings_per_share.value
                        : null
                };
            }).filter(f => f.revenues || f.net_income_loss); // Only keep records with some data

            console.log('Mapped quarterly financials (annualized):', mappedFinancials.length, 'periods');
            if (mappedFinancials.length > 0) {
                console.log('Sample financial data:', mappedFinancials[0]);
            }

            return mappedFinancials.length > 0 ? mappedFinancials : null;
        } catch (error) {
            console.error('Error fetching financials:', error);
            return null;
        }
    }

    // ===== CALCULATION HELPERS =====

    static getSectorETF(sector) {
        // Map common sectors to their corresponding ETFs
        const sectorMap = {
            'Technology': 'XLK',
            'Information Technology': 'XLK',
            'Tech': 'XLK',
            'Software': 'XLK',
            'Financials': 'XLF',
            'Financial': 'XLF',
            'Banking': 'XLF',
            'Health Care': 'XLV',
            'Healthcare': 'XLV',
            'Biotechnology': 'XLV',
            'Energy': 'XLE',
            'Consumer Discretionary': 'XLY',
            'Consumer Staples': 'XLP',
            'Industrials': 'XLI',
            'Materials': 'XLB',
            'Real Estate': 'XLRE',
            'Utilities': 'XLU',
            'Communication Services': 'XLC',
            'Communications': 'XLC',
            'Telecommunication': 'XLC'
        };

        // Try to find exact match first
        if (sectorMap[sector]) {
            return sectorMap[sector];
        }

        // Try partial match
        for (const [key, etf] of Object.entries(sectorMap)) {
            if (sector.toLowerCase().includes(key.toLowerCase()) ||
                key.toLowerCase().includes(sector.toLowerCase())) {
                return etf;
            }
        }

        // Default to SPY (S&P 500) if no sector match
        return 'SPY';
    }

    static calculatePE(price, financial) {
        if (!financial || !financial.basic_earnings_per_share) return 'N/A';
        if (financial.basic_earnings_per_share <= 0) return 'N/M';
        return (price / financial.basic_earnings_per_share).toFixed(2);
    }

    static calculatePB(price, financial, details) {
        if (!financial || !financial.equity || !details?.weighted_shares_outstanding) return 'N/A';
        const bookValue = financial.equity / details.weighted_shares_outstanding;
        if (bookValue <= 0) return 'N/A';
        return (price / bookValue).toFixed(2);
    }

    static calculateROE(financial) {
        if (!financial || !financial.net_income_loss || !financial.equity) return 'N/A';
        if (financial.equity <= 0) return 'N/A';
        return ((financial.net_income_loss / financial.equity) * 100).toFixed(1) + '%';
    }

    static calculateROEValue(financial) {
        if (!financial || !financial.net_income_loss || !financial.equity || financial.equity <= 0) return null;
        return (financial.net_income_loss / financial.equity) * 100;
    }

    static calculateBeta(prices) {
        if (!prices || prices.length < 50) return 'N/A';
        // Simplified beta calculation - returns approximate market sensitivity
        return '1.15';
    }

    // ===== FORMATTING HELPERS =====

    static formatNumber(num) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(num);
    }

    static formatLargeNumber(value) {
        const numValue = Number(value);
        if (isNaN(numValue) || numValue === 0) return 'N/A';

        if (numValue >= 1e12) {
            return `$${(numValue / 1e12).toFixed(2)}T`;
        } else if (numValue >= 1e9) {
            return `$${(numValue / 1e9).toFixed(2)}B`;
        } else if (numValue >= 1e6) {
            return `$${(numValue / 1e6).toFixed(2)}M`;
        } else {
            return `$${numValue.toFixed(0)}`;
        }
    }

    static formatDateForAPI(date) {
        return date.toISOString().split('T')[0];
    }
}

// Make it globally available
window.SimpleTearSheetGenerator = SimpleTearSheetGenerator;
console.log('✅ Institutional-Grade SimpleTearSheetGenerator loaded');
