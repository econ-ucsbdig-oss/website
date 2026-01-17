/**
 * Portfolio-Level Institutional Tear Sheet Generator
 * Generates comprehensive portfolio analysis with sector allocation, performance, and risk metrics
 */

class PortfolioTearSheetGenerator {
    static async generate(portfolioData) {
        try {
            if (!portfolioData || !portfolioData.positions || portfolioData.positions.length === 0) {
                throw new Error('No portfolio data provided');
            }

            console.log('Generating portfolio tear sheet...');

            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                throw new Error('jsPDF library not loaded');
            }

            // Get API key for benchmark data
            const apiKey = localStorage.getItem('POLYGON_API_KEY') || window.POLYGON_API_KEY;

            // Generate PDF
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // Single page tearsheet
            await this.generateSinglePage(doc, portfolioData, apiKey);

            // Add footer
            this.addFooter(doc);

            // Save PDF
            const fileName = `DIG_Portfolio_Tearsheet_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);

            console.log('Portfolio tear sheet generated successfully');
            return fileName;

        } catch (error) {
            console.error('Error generating portfolio tear sheet:', error);
            throw error;
        }
    }

    /**
     * Single Page Portfolio Tearsheet
     */
    static async generateSinglePage(doc, portfolioData, apiKey) {
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

        // Calculate portfolio metrics
        const summary = portfolioData.summary;
        const composition = this.calculateComposition(portfolioData.positions);
        const sectorAllocation = this.calculateSectorAllocation(portfolioData.positions);

        // ==================== COMPACT HEADER ====================
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

        // Center: Portfolio title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('PORTFOLIO OVERVIEW', centerX, 10, { align: 'center' });
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(`${summary.numHoldings} Holdings | ${this.formatCurrency(summary.totalValue)} AUM`, centerX, 15, { align: 'center' });

        // Right: Performance snapshot
        const returnColor = summary.totalGainPercent >= 0 ? [76, 255, 80] : [255, 100, 100];
        doc.setFontSize(6);
        doc.setTextColor(220, 220, 220);
        doc.text(`Total Return`, pageWidth - margin, 7, { align: 'right' });
        doc.setTextColor(...returnColor);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${summary.totalGainPercent >= 0 ? '+' : ''}${(summary.totalGainPercent * 100).toFixed(2)}%`,
            pageWidth - margin, 13, { align: 'right' });

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

        // Calculate 1Y returns if historical data is available
        let oneYearReturn = summary.totalGainPercent; // fallback to total return
        let spxeOneYearReturn = null;

        if (portfolioData.historicalData && portfolioData.historicalData.portfolioHistory) {
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            const portfolioFiltered = portfolioData.historicalData.portfolioHistory.filter(p => {
                const date = typeof p.date === 'string' ? new Date(p.date) : p.date;
                return date >= oneYearAgo;
            });

            if (portfolioFiltered.length > 0) {
                const firstValue = portfolioFiltered[0].value;
                const lastValue = portfolioFiltered[portfolioFiltered.length - 1].value;
                oneYearReturn = (lastValue - firstValue) / firstValue;
            }

            // Get SPXE 1Y return
            const spxeBenchmark = portfolioData.historicalData.benchmarks?.SPXE;
            if (spxeBenchmark) {
                const spxeFiltered = spxeBenchmark.filter(p => {
                    const date = typeof p.date === 'string' ? new Date(p.date) : p.date;
                    return date >= oneYearAgo;
                });

                if (spxeFiltered.length > 0) {
                    const firstSpxe = spxeFiltered[0].value;
                    const lastSpxe = spxeFiltered[spxeFiltered.length - 1].value;
                    spxeOneYearReturn = (lastSpxe - firstSpxe) / firstSpxe;
                }
            }
        }

        // Row 1
        this.drawMetricBox(doc, gridStartX, y, boxWidth, boxHeight,
            'Total Value', this.formatCurrency(summary.totalValue), digBlue, darkGray);
        this.drawMetricBox(doc, gridStartX + (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            'Cost Basis', this.formatCurrency(summary.totalCostBasis), digBlue, darkGray);
        this.drawMetricBox(doc, gridStartX + 2 * (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            '1Y Return', `${oneYearReturn >= 0 ? '+' : ''}${(oneYearReturn * 100).toFixed(2)}%`,
            digBlue, oneYearReturn >= 0 ? greenColor : redColor);
        this.drawMetricBox(doc, gridStartX + 3 * (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            'SPXE 1Y', spxeOneYearReturn !== null ? `${spxeOneYearReturn >= 0 ? '+' : ''}${(spxeOneYearReturn * 100).toFixed(2)}%` : 'N/A',
            digBlue, spxeOneYearReturn !== null && spxeOneYearReturn >= 0 ? greenColor : redColor);

        // Row 2
        y += boxHeight + boxSpacing;
        this.drawMetricBox(doc, gridStartX, y, boxWidth, boxHeight,
            'Total Gain', this.formatCurrency(summary.totalGain), digBlue,
            summary.totalGain >= 0 ? greenColor : redColor);
        this.drawMetricBox(doc, gridStartX + (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            'Total Return', `${summary.totalGainPercent >= 0 ? '+' : ''}${(summary.totalGainPercent * 100).toFixed(2)}%`,
            digBlue, summary.totalGainPercent >= 0 ? greenColor : redColor);
        this.drawMetricBox(doc, gridStartX + 2 * (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            'Holdings', `${summary.numHoldings}`, digBlue, darkGray);
        this.drawMetricBox(doc, gridStartX + 3 * (boxWidth + boxSpacing), y, boxWidth, boxHeight,
            'Top Position', `${summary.topHolding.symbol}`, digBlue, darkGray);

        // ==================== PORTFOLIO PERFORMANCE ====================
        y += boxHeight + 8;
        doc.setDrawColor(...lightGray);
        doc.line(margin, y, pageWidth - margin, y);

        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        doc.text('12-MONTH PORTFOLIO PERFORMANCE vs SPXE', centerX, y, { align: 'center' });

        y += 5;
        const chartHeight = 80;
        await this.drawPortfolioPerformanceChart(doc, margin, y, pageWidth - 2 * margin, chartHeight,
            portfolioData, apiKey, digBlue, digGold, [100, 100, 100], greenColor, redColor);

        // ==================== TOP HOLDINGS & SECTOR ALLOCATION ====================
        y += chartHeight + 10;
        doc.setDrawColor(...lightGray);
        doc.line(margin, y, pageWidth - margin, y);

        y += 6;

        // Split into two columns
        const colWidth = (pageWidth - 2 * margin - 8) / 2;

        // Left: Top Holdings
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        doc.text('TOP 10 HOLDINGS', margin + colWidth / 2, y, { align: 'center' });

        // Right: Sector Allocation
        doc.text('SECTOR ALLOCATION', margin + colWidth + 8 + colWidth / 2, y, { align: 'center' });

        y += 5;

        // Draw top holdings table (left)
        this.drawCompactHoldingsTable(doc, margin, y, colWidth, 80,
            portfolioData.positions, digBlue, darkGray, greenColor, redColor);

        // Draw sector allocation (right)
        this.drawSectorAllocation(doc, margin + colWidth + 8, y, colWidth, 80,
            sectorAllocation, digBlue, darkGray, lightGray);
    }

    /**
     * PAGE 2: Holdings Analysis & Risk Metrics
     */
    static generatePage2(doc, portfolioData) {
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

        // ==================== HEADER ====================
        let y = 25;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        doc.text('HOLDINGS ANALYSIS', centerX, y, { align: 'center' });

        // ==================== TOP HOLDINGS TABLE ====================
        y += 10;
        doc.setDrawColor(...lightGray);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageWidth - margin, y);

        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        doc.text('TOP 10 HOLDINGS', centerX, y, { align: 'center' });

        y += 5;
        this.drawTopHoldingsTable(doc, margin, y, pageWidth - 2 * margin,
            portfolioData.positions, digBlue, darkGray, greenColor, redColor);

        // ==================== PORTFOLIO COMPOSITION ====================
        y += 75;
        doc.setDrawColor(...lightGray);
        doc.line(margin, y, pageWidth - margin, y);

        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        doc.text('PORTFOLIO COMPOSITION', centerX, y, { align: 'center' });

        y += 5;
        const composition = this.calculateComposition(portfolioData.positions);
        this.drawPortfolioComposition(doc, margin, y, pageWidth - 2 * margin, 40,
            composition, digBlue, digGold, darkGray);

        // ==================== KEY INSIGHTS ====================
        y += 50;
        doc.setDrawColor(...lightGray);
        doc.line(margin, y, pageWidth - margin, y);

        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        doc.text('PORTFOLIO INSIGHTS', centerX, y, { align: 'center' });

        y += 5;
        this.drawPortfolioInsights(doc, margin, y, pageWidth - 2 * margin,
            portfolioData, darkGray);
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

    static async drawPortfolioPerformanceChart(doc, x, y, width, height, portfolioData, apiKey, primaryColor, goldColor, grayColor, greenColor, redColor) {
        try {
            // Check if we have historical data already loaded (from the dashboard)
            if (portfolioData.historicalData &&
                portfolioData.historicalData.portfolioHistory &&
                portfolioData.historicalData.portfolioHistory.length > 0) {

                console.log('Using pre-loaded portfolio historical data');
                const portfolioHistory = portfolioData.historicalData.portfolioHistory;

                // Get SPXE benchmark data (if available)
                const spxeBenchmark = portfolioData.historicalData.benchmarks?.SPXE;

                if (!spxeBenchmark || spxeBenchmark.length === 0) {
                    console.warn('No SPXE benchmark data available, chart cannot be drawn');
                    doc.setFontSize(8);
                    doc.setTextColor(100, 100, 100);
                    doc.text('SPXE benchmark data not available', x + width/2, y + height/2, { align: 'center' });
                    return;
                }

                // Filter to last 1 year only
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

                const portfolioFiltered = portfolioHistory.filter(p => {
                    const date = typeof p.date === 'string' ? new Date(p.date) : p.date;
                    return date >= oneYearAgo;
                });

                const spxeFiltered = spxeBenchmark.filter(p => {
                    const date = typeof p.date === 'string' ? new Date(p.date) : p.date;
                    return date >= oneYearAgo;
                });

                console.log(`Filtered to 1 year: Portfolio ${portfolioFiltered.length} points, SPXE ${spxeFiltered.length} points`);

                if (portfolioFiltered.length === 0 || spxeFiltered.length === 0) {
                    console.warn('No data in the last year');
                    doc.setFontSize(8);
                    doc.setTextColor(100, 100, 100);
                    doc.text('No data available for the last year', x + width/2, y + height/2, { align: 'center' });
                    return;
                }

                // Normalize portfolio to start at 100
                const firstValue = portfolioFiltered[0].value;
                const portfolioNorm = portfolioFiltered.map(p => ({
                    date: typeof p.date === 'string' ? p.date : p.date.toISOString().split('T')[0],
                    value: (p.value / firstValue) * 100
                }));

                // Normalize SPXE to start at 100 (re-normalize since we filtered)
                const firstSpxe = spxeFiltered[0].value;
                const spxeNorm = spxeFiltered.map(p => ({
                    date: typeof p.date === 'string' ? p.date : p.date.toISOString().split('T')[0],
                    value: (p.value / firstSpxe) * 100
                }));

                console.log(`Portfolio data: ${portfolioNorm.length} points`);
                console.log(`SPXE data: ${spxeNorm.length} points`);

                // Draw two-line chart: Portfolio (green) vs SPXE (red)
                this.drawTwoLineChart(doc, x, y, width, height, portfolioNorm, spxeNorm,
                    'Portfolio', 'SPXE', greenColor, redColor);

            } else {
                console.warn('No historical data loaded. Please load historical data first using the 1Y tab on the portfolio page.');
                doc.setFontSize(8);
                doc.setTextColor(100, 100, 100);
                doc.text('Portfolio historical data not loaded', x + width/2, y + height/2, { align: 'center' });
                doc.setFontSize(7);
                doc.text('Please click the "1Y" button on the portfolio page first', x + width/2, y + height/2 + 10, { align: 'center' });
            }

        } catch (error) {
            console.error('Error drawing performance chart:', error);
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text('Error loading performance data', x + width/2, y + height/2, { align: 'center' });
        }
    }


    static async fetchPrices(symbol, fromDate, toDate, apiKey) {
        try {
            const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&apiKey=${apiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.error(`API error for ${symbol}: ${response.status}`);
                return null;
            }

            const data = await response.json();

            if (data.results && data.results.length > 0) {
                console.log(`✅ Fetched ${data.results.length} price points for ${symbol}`);
                return data.results.map(bar => ({
                    date: new Date(bar.t).toISOString().split('T')[0],
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

    static drawTwoLineChart(doc, x, y, width, height, data1, data2, label1, label2, color1, color2) {
        const marginLeft = 18;
        const marginBottom = 15;
        const marginTop = 3;
        const marginRight = 22;

        const chartX = x + marginLeft;
        const chartY = y + marginTop;
        const chartW = width - marginLeft - marginRight;
        const chartH = height - marginTop - marginBottom;

        // Validate data
        if (!data1 || !data2 || data1.length === 0 || data2.length === 0) {
            console.error('Invalid data for chart:', { data1Length: data1?.length, data2Length: data2?.length });
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text('Invalid chart data', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        // Determine range - filter out NaN and invalid values
        const allValues = [...data1.map(d => d.value), ...data2.map(d => d.value)]
            .filter(v => v !== null && v !== undefined && !isNaN(v) && isFinite(v));

        if (allValues.length === 0) {
            console.error('No valid values for chart');
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text('No valid data points', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        const minVal = Math.min(...allValues);
        const maxVal = Math.max(...allValues);
        const range = maxVal - minVal;

        const paddedMin = minVal - (range * 0.1);
        const paddedMax = maxVal + (range * 0.1);
        const paddedRange = paddedMax - paddedMin;

        // Background
        doc.setFillColor(250, 250, 250);
        doc.rect(chartX, chartY, chartW, chartH, 'F');

        // Grid lines
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        for (let i = 1; i <= 4; i++) {
            const gridY = chartY + (chartH * i / 5);
            doc.line(chartX, gridY, chartX + chartW, gridY);
        }

        // Border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.rect(chartX, chartY, chartW, chartH);

        // Helper to draw smooth line
        const drawSmoothLine = (data, color, lineWidth) => {
            if (!data || data.length < 2) return;

            doc.setDrawColor(...color);
            doc.setLineWidth(lineWidth);

            const xStep = chartW / (data.length - 1);

            for (let i = 0; i < data.length - 1; i++) {
                const x1 = chartX + i * xStep;
                const y1 = chartY + chartH - ((data[i].value - paddedMin) / paddedRange) * chartH;
                const x2 = chartX + (i + 1) * xStep;
                const y2 = chartY + chartH - ((data[i + 1].value - paddedMin) / paddedRange) * chartH;

                if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
                    const cx = (x1 + x2) / 2;
                    const cy = (y1 + y2) / 2;

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

        // Draw lines - thin lines for better differentiation
        drawSmoothLine(data2, color2, 0.4);  // SPXE (red) - behind
        drawSmoothLine(data1, color1, 0.6);  // Portfolio (green) - in front

        // Y-axis labels (left)
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'normal');
        for (let i = 0; i <= 4; i++) {
            const val = paddedMin + (paddedRange * i / 4);
            const yPos = chartY + chartH - (chartH * i / 4);
            doc.text(`${val.toFixed(0)}`, x + 2, yPos + 2);
        }

        // Y-axis labels (right - % change)
        for (let i = 0; i <= 4; i++) {
            const val = paddedMin + (paddedRange * i / 4);
            const yPos = chartY + chartH - (chartH * i / 4);
            const pctChange = val - 100;
            doc.text(`${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(0)}%`,
                chartX + chartW + 3, yPos + 2);
        }

        // X-axis labels
        doc.setFontSize(6);
        const dateStep = Math.floor(data1.length / 4);
        for (let i = 0; i <= 4; i++) {
            const idx = Math.min(i * dateStep, data1.length - 1);
            const date = new Date(data1[idx].date);
            const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            const xPos = chartX + (idx / (data1.length - 1)) * chartW;
            doc.text(label, xPos, chartY + chartH + 8, { align: 'center' });
        }

        // Legend in bottom right
        const legendX = chartX + chartW - 50;
        const legendY = chartY + chartH - 10;

        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');

        // Line 1 - Portfolio (green)
        doc.setDrawColor(...color1);
        doc.setLineWidth(0.6);
        doc.line(legendX, legendY, legendX + 8, legendY);
        doc.setTextColor(...color1);
        doc.text(label1, legendX + 10, legendY + 1);

        // Line 2 - SPXE (red)
        doc.setDrawColor(...color2);
        doc.setLineWidth(0.4);
        doc.line(legendX + 30, legendY, legendX + 38, legendY);
        doc.setTextColor(...color2);
        doc.text(label2, legendX + 40, legendY + 1);
    }

    static drawThreeLineChart(doc, x, y, width, height, data1, data2, data3, label1, label2, label3, color1, color2, color3) {
        const marginLeft = 18;
        const marginBottom = 15;
        const marginTop = 3;
        const marginRight = 22;

        const chartX = x + marginLeft;
        const chartY = y + marginTop;
        const chartW = width - marginLeft - marginRight;
        const chartH = height - marginTop - marginBottom;

        // Determine range
        const allValues = [...data1.map(d => d.value), ...data2.map(d => d.value), ...data3.map(d => d.value)];
        const minVal = Math.min(...allValues);
        const maxVal = Math.max(...allValues);
        const range = maxVal - minVal;

        const paddedMin = minVal - (range * 0.1);
        const paddedMax = maxVal + (range * 0.1);
        const paddedRange = paddedMax - paddedMin;

        // Background
        doc.setFillColor(250, 250, 250);
        doc.rect(chartX, chartY, chartW, chartH, 'F');

        // Grid lines
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        for (let i = 1; i <= 4; i++) {
            const gridY = chartY + (chartH * i / 5);
            doc.line(chartX, gridY, chartX + chartW, gridY);
        }

        // Border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.rect(chartX, chartY, chartW, chartH);

        // Helper to draw smooth line
        const drawSmoothLine = (data, color, lineWidth) => {
            if (!data || data.length < 2) return;

            doc.setDrawColor(...color);
            doc.setLineWidth(lineWidth);

            const xStep = chartW / (data.length - 1);

            for (let i = 0; i < data.length - 1; i++) {
                const x1 = chartX + i * xStep;
                const y1 = chartY + chartH - ((data[i].value - paddedMin) / paddedRange) * chartH;
                const x2 = chartX + (i + 1) * xStep;
                const y2 = chartY + chartH - ((data[i + 1].value - paddedMin) / paddedRange) * chartH;

                if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
                    const cx = (x1 + x2) / 2;
                    const cy = (y1 + y2) / 2;

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

        // Draw lines (back to front) - thin lines for better differentiation
        drawSmoothLine(data3, color3, 0.4);
        drawSmoothLine(data2, color2, 0.4);
        drawSmoothLine(data1, color1, 0.6);

        // Y-axis labels (left)
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'normal');
        for (let i = 0; i <= 4; i++) {
            const val = paddedMin + (paddedRange * i / 4);
            const yPos = chartY + chartH - (chartH * i / 4);
            doc.text(`${val.toFixed(0)}`, x + 2, yPos + 2);
        }

        // Y-axis labels (right - % change)
        for (let i = 0; i <= 4; i++) {
            const val = paddedMin + (paddedRange * i / 4);
            const yPos = chartY + chartH - (chartH * i / 4);
            const pctChange = val - 100;
            doc.text(`${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(0)}%`,
                chartX + chartW + 3, yPos + 2);
        }

        // X-axis labels
        doc.setFontSize(6);
        const dateStep = Math.floor(data1.length / 4);
        for (let i = 0; i <= 4; i++) {
            const idx = Math.min(i * dateStep, data1.length - 1);
            const date = new Date(data1[idx].date);
            const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            const xPos = chartX + (idx / (data1.length - 1)) * chartW;
            doc.text(label, xPos, chartY + chartH + 8, { align: 'center' });
        }

        // Legend in bottom right
        const legendX = chartX + chartW - 60;
        const legendY = chartY + chartH - 12;

        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');

        // Line 1
        doc.setDrawColor(...color1);
        doc.setLineWidth(0.6);
        doc.line(legendX, legendY, legendX + 8, legendY);
        doc.setTextColor(...color1);
        doc.text(label1, legendX + 10, legendY + 1);

        // Line 2
        doc.setDrawColor(...color2);
        doc.setLineWidth(0.4);
        doc.line(legendX + 30, legendY, legendX + 38, legendY);
        doc.setTextColor(...color2);
        doc.text(label2, legendX + 40, legendY + 1);

        // Line 3
        doc.setDrawColor(...color3);
        doc.setLineWidth(0.4);
        doc.line(legendX, legendY + 5, legendX + 8, legendY + 5);
        doc.setTextColor(...color3);
        doc.text(label3, legendX + 10, legendY + 6);
    }

    static drawSectorAllocation(doc, x, y, width, height, sectorAllocation, primaryColor, darkColor, lightColor) {
        // Draw horizontal bar chart for sector allocation
        const barHeight = 6;
        const spacing = 2;
        const maxBars = 8;

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');

        let currentY = y;
        sectorAllocation.slice(0, maxBars).forEach((sector, idx) => {
            const barWidth = (sector.percent * width * 0.7);

            // Sector name
            doc.setTextColor(...darkColor);
            doc.text(sector.name, x, currentY + 4);

            // Bar
            doc.setFillColor(...primaryColor);
            doc.rect(x + 50, currentY, barWidth, barHeight, 'F');

            // Percentage
            doc.setTextColor(...darkColor);
            doc.text(`${(sector.percent * 100).toFixed(1)}%`, x + 50 + barWidth + 3, currentY + 4);

            currentY += barHeight + spacing;
        });
    }

    static drawCompactHoldingsTable(doc, x, y, width, height, positions, primaryColor, darkColor, greenColor, redColor) {
        // Compact version for single-page layout
        const topHoldings = [...positions]
            .sort((a, b) => b.currentValue - a.currentValue)
            .slice(0, 10);

        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);

        const col1 = x + 2;
        const col2 = x + 20;
        const col3 = x + width - 20;

        let currentY = y;

        doc.text('Symbol', col1, currentY);
        doc.text('Weight', col2, currentY);
        doc.text('Return', col3, currentY);

        currentY += 2;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(x, currentY, x + width, currentY);

        doc.setFont('helvetica', 'normal');
        currentY += 4;

        topHoldings.forEach((holding, idx) => {
            doc.setTextColor(...darkColor);
            doc.text(holding.symbol, col1, currentY);
            doc.text(`${(holding.percentOfAccount * 100).toFixed(1)}%`, col2, currentY);

            const returnColor = holding.totalGainPercent >= 0 ? greenColor : redColor;
            doc.setTextColor(...returnColor);
            doc.text(`${holding.totalGainPercent >= 0 ? '+' : ''}${(holding.totalGainPercent * 100).toFixed(1)}%`, col3, currentY);

            currentY += 5;
        });
    }

    static drawTopHoldingsTable(doc, x, y, width, positions, primaryColor, darkColor, greenColor, redColor) {
        // Sort by current value and take top 10
        const topHoldings = [...positions]
            .sort((a, b) => b.currentValue - a.currentValue)
            .slice(0, 10);

        // Table headers
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);

        const col1 = x + 5;
        const col2 = x + 30;
        const col3 = x + 90;
        const col4 = x + 125;
        const col5 = x + 155;

        let currentY = y;

        doc.text('Symbol', col1, currentY);
        doc.text('Company', col2, currentY);
        doc.text('Value', col3, currentY);
        doc.text('Weight', col4, currentY);
        doc.text('Return', col5, currentY);

        currentY += 2;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(x, currentY, x + width, currentY);

        // Table rows
        doc.setFont('helvetica', 'normal');
        currentY += 5;

        topHoldings.forEach((holding, idx) => {
            doc.setTextColor(...darkColor);
            doc.text(holding.symbol, col1, currentY);
            doc.text(this.truncateText(holding.description, 35), col2, currentY);
            doc.text(this.formatCurrency(holding.currentValue), col3, currentY);
            doc.text(`${(holding.percentOfAccount * 100).toFixed(1)}%`, col4, currentY);

            // Return with color
            const returnColor = holding.totalGainPercent >= 0 ? greenColor : redColor;
            doc.setTextColor(...returnColor);
            doc.text(`${holding.totalGainPercent >= 0 ? '+' : ''}${(holding.totalGainPercent * 100).toFixed(1)}%`, col5, currentY);

            currentY += 6;
        });
    }

    static drawPortfolioComposition(doc, x, y, width, height, composition, color1, color2, darkColor) {
        // Draw pie chart showing Index vs DIG Equity split
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const radius = Math.min(width, height) / 3;

        // Draw Index slice
        const indexAngle = composition.index.percent * 360;
        doc.setFillColor(...color1);
        this.drawPieSlice(doc, centerX, centerY, radius, 0, indexAngle);

        // Draw Equity slice
        doc.setFillColor(...color2);
        this.drawPieSlice(doc, centerX, centerY, radius, indexAngle, 360);

        // Legend
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);

        const legendX = x + width - 60;
        const legendY = y + 10;

        // Index
        doc.setFillColor(...color1);
        doc.rect(legendX, legendY, 5, 5, 'F');
        doc.text(`Index Funds: ${(composition.index.percent * 100).toFixed(1)}%`, legendX + 8, legendY + 4);

        // Equity
        doc.setFillColor(...color2);
        doc.rect(legendX, legendY + 10, 5, 5, 'F');
        doc.text(`DIG Equity: ${(composition.equity.percent * 100).toFixed(1)}%`, legendX + 8, legendY + 14);
    }

    static drawPieSlice(doc, centerX, centerY, radius, startAngle, endAngle) {
        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;

        doc.moveTo(centerX, centerY);
        doc.lineTo(centerX + radius * Math.cos(startRad), centerY + radius * Math.sin(startRad));

        // Draw arc
        const steps = Math.ceil(Math.abs(endAngle - startAngle) / 5);
        for (let i = 1; i <= steps; i++) {
            const angle = startRad + (endRad - startRad) * i / steps;
            doc.lineTo(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
        }

        doc.lineTo(centerX, centerY);
        doc.fill();
    }

    static drawPortfolioInsights(doc, x, y, width, portfolioData, darkColor) {
        const insights = [];
        const summary = portfolioData.summary;
        const positions = portfolioData.positions;

        // Performance insight
        if (summary.totalGainPercent > 0.15) {
            insights.push(`Portfolio outperforming with ${(summary.totalGainPercent * 100).toFixed(1)}% total return, demonstrating strong stock selection and timing`);
        } else if (summary.totalGainPercent > 0.05) {
            insights.push(`Portfolio generating positive ${(summary.totalGainPercent * 100).toFixed(1)}% return with moderate volatility and risk-adjusted gains`);
        } else if (summary.totalGainPercent < -0.05) {
            insights.push(`Portfolio down ${(Math.abs(summary.totalGainPercent) * 100).toFixed(1)}%, suggesting defensive positioning or recent market headwinds`);
        }

        // Concentration insight
        const topWeight = summary.topHolding.percent;
        if (topWeight > 0.15) {
            insights.push(`Concentrated position in ${summary.topHolding.symbol} at ${(topWeight * 100).toFixed(1)}% of portfolio presents both alpha opportunity and idiosyncratic risk`);
        } else if (topWeight > 0.10) {
            insights.push(`Balanced concentration with top holding ${summary.topHolding.symbol} at ${(topWeight * 100).toFixed(1)}%, maintaining diversification while expressing conviction`);
        }

        // Winners and losers
        const winners = positions.filter(p => p.totalGainPercent > 0.20).length;
        const losers = positions.filter(p => p.totalGainPercent < -0.10).length;
        if (winners > losers && winners > 2) {
            insights.push(`${winners} positions showing >20% gains versus ${losers} positions down >10%, indicating positive stock selection momentum`);
        }

        // Sector exposure
        const sectorAllocation = this.calculateSectorAllocation(positions);
        const topSector = sectorAllocation[0];
        if (topSector && topSector.percent > 0.25) {
            insights.push(`${topSector.name} sector overweight at ${(topSector.percent * 100).toFixed(1)}% reflects thematic conviction and cyclical positioning`);
        }

        // Holdings count
        if (summary.numHoldings < 15) {
            insights.push(`Concentrated portfolio of ${summary.numHoldings} holdings enables deep research coverage and active position sizing`);
        } else if (summary.numHoldings > 25) {
            insights.push(`Diversified portfolio of ${summary.numHoldings} holdings provides broad market exposure and risk mitigation`);
        }

        // Day performance
        if (Math.abs(summary.todayGainPercent) > 0.02) {
            const direction = summary.todayGainPercent > 0 ? 'gaining' : 'declining';
            insights.push(`Portfolio ${direction} ${(Math.abs(summary.todayGainPercent) * 100).toFixed(2)}% today, reflecting ${direction === 'gaining' ? 'positive' : 'negative'} market sentiment and sector rotation`);
        }

        // Layout insights
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);

        const maxInsights = 6;
        const lineHeight = 5;

        insights.slice(0, maxInsights).forEach((insight, idx) => {
            const yPos = y + (idx * lineHeight) + 3;
            doc.text('•', x + 5, yPos);
            doc.text(insight, x + 8, yPos);
        });
    }

    // ===== HELPER FUNCTIONS =====

    static calculateComposition(positions) {
        const totalValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0);
        const indexFunds = ['VOO', 'SPY', 'VTV'];
        const indexValue = positions.filter(p => indexFunds.includes(p.symbol))
            .reduce((sum, pos) => sum + pos.currentValue, 0);
        const equityValue = positions.filter(p => !indexFunds.includes(p.symbol))
            .reduce((sum, pos) => sum + pos.currentValue, 0);

        return {
            index: {
                value: indexValue,
                percent: indexValue / totalValue
            },
            equity: {
                value: equityValue,
                percent: equityValue / totalValue
            }
        };
    }

    static calculateSectorAllocation(positions) {
        const sectorMap = {};
        const totalValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0);

        positions.forEach(pos => {
            const sector = pos.sector || 'Other';
            if (!sectorMap[sector]) {
                sectorMap[sector] = 0;
            }
            sectorMap[sector] += pos.currentValue;
        });

        return Object.entries(sectorMap)
            .map(([name, value]) => ({
                name,
                value,
                percent: value / totalValue
            }))
            .sort((a, b) => b.value - a.value);
    }

    static addFooter(doc) {
        const pageCount = doc.internal.getNumberOfPages();
        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;

        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.setFont('helvetica', 'normal');

            doc.text('UCSB Dean\'s Investment Group | Generated ' + new Date().toLocaleDateString('en-US'),
                pageWidth / 2, pageHeight - 10, { align: 'center' });
            doc.text('This report is for educational purposes only and does not constitute investment advice.',
                pageWidth / 2, pageHeight - 6, { align: 'center' });
            doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 2, { align: 'center' });
        }
    }

    static formatCurrency(num) {
        if (num >= 1000000) {
            return `$${(num / 1000000).toFixed(2)}M`;
        } else if (num >= 1000) {
            return `$${(num / 1000).toFixed(1)}K`;
        }
        return `$${num.toFixed(0)}`;
    }

    static truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }
}
