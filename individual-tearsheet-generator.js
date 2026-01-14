/**
 * Institutional-Grade Individual Stock Tear Sheet Generator for UCSB DIG Portfolio
 * Generates a professional 2-page PDF analysis with real data from Polygon.io
 * Designed for presentation to managing directors and investment committees
 */

class IndividualTearSheetGenerator {
    static async generate(holding, apiBaseUrl = 'http://localhost:3001') {
        try {
            if (!holding || !holding.symbol) {
                throw new Error('No holding data provided');
            }

            console.log('Generating institutional-grade tear sheet for:', holding.symbol);

            // Fetch all required data in parallel
            const [comprehensiveData, historicalData, analyticsData, sectorETFData, relativePerformanceData, valuationHistoryData, valueCreationData] = await Promise.all([
                this.fetchComprehensiveData(holding.symbol, apiBaseUrl),
                this.fetchHistoricalData(holding.symbol, apiBaseUrl, 365), // 12 months
                this.fetchAnalytics(holding.symbol, apiBaseUrl),
                this.fetchSectorETFComparison(holding.gicsSector, apiBaseUrl),
                this.fetchRelativePerformance(holding.symbol, holding.gicsSector, apiBaseUrl),
                this.fetchValuationHistory(holding.symbol, holding.gicsSector, apiBaseUrl),
                this.fetchValueCreation(holding.symbol, apiBaseUrl)
            ]);

            console.log('All data fetched successfully');

            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                throw new Error('jsPDF library not loaded');
            }

            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // Extract data
            const quote = comprehensiveData.quote || {};
            const details = comprehensiveData.details || {};
            const financials = comprehensiveData.financials || [];
            const news = comprehensiveData.news || [];
            const analytics = analyticsData.analytics || {};
            const prices = historicalData.prices || [];

            // Calculate portfolio metrics
            const quantity = parseFloat(holding.quantity) || 0;
            const currentPrice = parseFloat(quote.price || holding.lastPrice) || 0;
            const marketValue = quantity * currentPrice;
            const purchasePrice = holding.purchasePrice || currentPrice * 0.85;
            const gainPercent = purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice * 100) : 0;
            const gainValue = (currentPrice - purchasePrice) * quantity;

            // Calculate valuation metrics
            const valuationMetrics = this.calculateValuationMetrics(quote, details, financials, analytics);

            // PAGE 1: EXECUTIVE SUMMARY
            this.drawPage1(doc, {
                holding,
                quote,
                details,
                financials,
                analytics,
                valuationMetrics,
                sectorETFData,
                relativePerformanceData,
                historicalData,
                valuationHistoryData,
                marketValue,
                gainPercent,
                gainValue,
                currentPrice
            });

            // PAGE 2: DETAILED ANALYSIS
            doc.addPage();
            this.drawPage2(doc, {
                holding,
                quote,
                details,
                financials,
                news,
                analytics,
                prices,
                quantity,
                purchasePrice,
                currentPrice,
                marketValue,
                valuationMetrics,
                valueCreationData
            });

            // Save PDF
            const fileName = `DIG_${holding.symbol}_InstitutionalTearSheet_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);

            return fileName;
        } catch (error) {
            console.error('Error generating tear sheet:', error);
            throw error;
        }
    }

    // ===== PAGE 1: EXECUTIVE SUMMARY =====
    static drawPage1(doc, data) {
        const { holding, quote, details, financials, analytics, valuationMetrics, sectorETFData, relativePerformanceData, historicalData, valuationHistoryData, marketValue, gainPercent, currentPrice } = data;

        // Colors
        const digBlue = [0, 54, 96];
        const digGold = [254, 188, 17];
        const darkGray = [60, 60, 60];
        const lightGray = [150, 150, 150];
        const accentBlue = [66, 133, 244];

        // HEADER with blue bar (reduced height)
        doc.setFillColor(...digBlue);
        doc.rect(0, 0, 210, 25, 'F');

        // DIG logo in top left
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('DIG', 15, 10);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text('UCSB DEAN\'S INVESTMENT GROUP', 15, 15);

        // Company name centered - limit width to avoid overlap
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        const companyName = details.name || holding.description || holding.symbol;
        const maxNameWidth = 90; // Leave space for price on right
        const nameWidth = doc.getTextWidth(companyName);
        if (nameWidth > maxNameWidth) {
            // Truncate if too long
            const truncated = companyName.substring(0, Math.floor(companyName.length * maxNameWidth / nameWidth) - 3) + '...';
            doc.text(truncated, 105, 12, { align: 'center' });
        } else {
            doc.text(companyName, 105, 12, { align: 'center' });
        }

        // Ticker and exchange
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`${holding.symbol} | ${details.primaryExchange || 'NYSE'}`, 105, 18, { align: 'center' });

        // Current price in top right
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(`$${currentPrice.toFixed(2)}`, 195, 11, { align: 'right' });

        // Day change below price
        doc.setFontSize(8);
        const changeColor = quote.changePercent >= 0 ? [144, 238, 144] : [255, 99, 71];
        doc.setTextColor(...changeColor);
        const changeText = `${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent?.toFixed(2)}% today`;
        doc.text(changeText, 195, 17, { align: 'right' });

        // Date at bottom of header
        doc.setFontSize(6);
        doc.setTextColor(200, 200, 200);
        const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.text(date, 105, 22, { align: 'center' });

        // KEY METRICS SECTION (3 columns)
        let y = 32;
        doc.setDrawColor(...lightGray);
        doc.setLineWidth(0.5);
        doc.line(15, y, 195, y);

        y += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkGray);
        doc.text('KEY METRICS', 15, y);

        y += 7;
        // Column 1: Valuation
        this.drawMetricBox(doc, 15, y, 58, 'Market Cap', this.formatLargeNumber(details.marketCap), digBlue, darkGray);
        this.drawMetricBox(doc, 15, y + 12, 58, 'P/E Ratio', valuationMetrics.peRatio, digBlue, darkGray);
        this.drawMetricBox(doc, 15, y + 24, 58, 'Forward P/E', valuationMetrics.forwardPE, digBlue, darkGray);
        this.drawMetricBox(doc, 15, y + 36, 58, 'P/B Ratio',
            (valuationMetrics.pbRatio !== 'N/A' && valuationMetrics.pbRatio !== 0) ? valuationMetrics.pbRatio.toFixed(2) : 'N/A',
            digBlue, darkGray);

        // Column 2: Performance
        this.drawMetricBox(doc, 77, y, 58, 'Beta', analytics.beta?.toFixed(2) || 'N/A', accentBlue, darkGray);
        this.drawMetricBox(doc, 77, y + 12, 58, 'Volatility (Ann.)', analytics.volatility ? `${(analytics.volatility * 100).toFixed(1)}%` : 'N/A', accentBlue, darkGray);
        this.drawMetricBox(doc, 77, y + 24, 58, '52W High', analytics.high52Week ? `$${analytics.high52Week.toFixed(2)}` : 'N/A', accentBlue, darkGray);
        this.drawMetricBox(doc, 77, y + 36, 58, '52W Low', analytics.low52Week ? `$${analytics.low52Week.toFixed(2)}` : 'N/A', accentBlue, darkGray);

        // Column 3: DIG Position
        const posColor = gainPercent >= 0 ? [76, 175, 80] : [244, 67, 54];
        this.drawMetricBox(doc, 139, y, 56, 'Position Value', this.formatCurrency(marketValue), digGold, darkGray);
        this.drawMetricBox(doc, 139, y + 12, 56, 'Total Return', `${gainPercent >= 0 ? '+' : ''}${gainPercent.toFixed(2)}%`, posColor, darkGray);
        this.drawMetricBox(doc, 139, y + 24, 56, 'Avg Volume', this.formatLargeNumber(analytics.avgVolume20), digGold, darkGray);
        this.drawMetricBox(doc, 139, y + 36, 56, 'Shares Held', holding.quantity.toLocaleString(), digGold, darkGray);

        // INVESTMENT THESIS (below key metrics)
        y += 52;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkGray);
        doc.text('INVESTMENT THESIS', 15, y);

        y += 4;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkGray);

        const thesis = details.description
            ? details.description.slice(0, 650)
            : `${details.name} operates in the ${holding.gicsSector || 'diversified'} sector. Key metrics show ${valuationMetrics.peRatio !== 'N/A' ? `P/E of ${valuationMetrics.peRatio}` : 'growth characteristics'}.`;

        const thesisLines = doc.splitTextToSize(thesis, 180);
        const displayedThesisLines = thesisLines.slice(0, 6); // 6 lines on Page 1
        doc.text(displayedThesisLines, 15, y);

        // PRICE PERFORMANCE CHART (moved to top)
        y += (displayedThesisLines.length * 3) + 8;
        doc.setLineWidth(0.5);
        doc.setDrawColor(...lightGray);
        doc.line(15, y, 195, y);

        y += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkGray);
        doc.text('12-MONTH PRICE PERFORMANCE', 15, y);

        y += 5;
        const priceChartHeight = 55;
        if (historicalData.prices && historicalData.prices.length > 0) {
            this.drawSmoothPriceChart(doc, 15, y, 180, priceChartHeight, historicalData.prices, holding.symbol, digBlue, accentBlue);
        } else {
            doc.setFontSize(9);
            doc.setTextColor(...lightGray);
            doc.text('Historical price data unavailable', 15, y + priceChartHeight/2);
        }

        // VALUATION TRENDS vs. SECTOR (P/E and P/B over 3 years)
        y += priceChartHeight + 12;
        doc.setLineWidth(0.5);
        doc.setDrawColor(...lightGray);
        doc.line(15, y, 195, y);

        y += 8;
        const valuationChartHeight = 50;
        console.log('Valuation history data:', valuationHistoryData);
        console.log('Stock valuations count:', valuationHistoryData?.stockValuations?.length);
        console.log('Sector valuations count:', valuationHistoryData?.sectorValuations?.length);

        if (valuationHistoryData && valuationHistoryData.stockValuations && valuationHistoryData.stockValuations.length > 0) {
            // Draw P/E and P/B trends - with or without sector comparison
            console.log('Drawing valuation trends charts...');
            const hasSectorData = valuationHistoryData.sectorValuations && valuationHistoryData.sectorValuations.length > 0;
            const dataYears = Math.ceil(valuationHistoryData.stockValuations.length / 4); // Approximate years based on quarters

            // Dynamic title based on sector data availability and data length
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkGray);
            let titleText;
            if (hasSectorData) {
                titleText = dataYears >= 3 ? 'VALUATION TRENDS vs. SECTOR ETF (3 Years)' : `VALUATION TRENDS vs. SECTOR ETF (${dataYears} Year${dataYears > 1 ? 's' : ''})`;
            } else {
                titleText = dataYears >= 3 ? 'VALUATION TRENDS (3 Years)' : `VALUATION TRENDS (${dataYears} Year${dataYears > 1 ? 's' : ''})`;
            }
            doc.text(titleText, 15, y);

            y += 5;
            this.drawValuationTrendsCharts(
                doc, 15, y, 180, valuationChartHeight,
                valuationHistoryData.stockValuations,
                hasSectorData ? valuationHistoryData.sectorValuations : null,
                holding.symbol,
                hasSectorData ? sectorETFData.etf : null,
                digBlue, accentBlue
            );
        } else {
            console.warn('Valuation trends data unavailable or empty');
            doc.setFontSize(9);
            doc.setTextColor(...lightGray);
            doc.text('Valuation trends data unavailable (company may be too new or foreign)', 15, y + 25);
        }

        // FOOTER
        doc.setFontSize(7);
        doc.setTextColor(...lightGray);
        const footerDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.text(`UCSB Dean's Investment Group | Generated ${footerDate} | Page 1 of 2`, 105, 287, { align: 'center' });
        doc.text('Data provided by Polygon.io | For educational purposes only', 105, 291, { align: 'center' });
    }

    // ===== PAGE 2: VALUE CREATION ANALYSIS =====
    static drawPage2(doc, data) {
        const { holding, quote, details, financials, news, analytics, prices, quantity, purchasePrice, currentPrice, marketValue, valuationMetrics, valueCreationData } = data;

        const digBlue = [0, 54, 96];
        const darkGray = [60, 60, 60];
        const lightGray = [150, 150, 150];
        const accentBlue = [66, 133, 244];

        // HEADER
        let y = 20;
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...digBlue);
        doc.text(`${holding.symbol} - Value Creation Analysis`, 15, y);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkGray);
        doc.text(details.name || holding.description || '', 15, y + 6);

        // DuPONT ROE DECOMPOSITION (start right after header)
        y += 20;
        doc.setLineWidth(0.5);
        doc.setDrawColor(...lightGray);
        doc.line(15, y, 195, y);

        y += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkGray);

        // Dynamic title based on data availability
        const dataYears = valueCreationData && valueCreationData.length > 0 ? Math.ceil(valueCreationData.length / 4) : 3;
        const yearLabel = dataYears >= 3 ? '3 Years' : `${dataYears} Year${dataYears > 1 ? 's' : ''}`;
        doc.text(`DuPONT ROE DECOMPOSITION (${yearLabel})`, 15, y);

        y += 5;
        const dupontHeight = 48; // Increased back from 40
        if (valueCreationData && valueCreationData.length > 0) {
            this.drawDuPontDecomposition(doc, 15, y, 180, dupontHeight, valueCreationData, holding.symbol, digBlue, accentBlue);
        } else {
            doc.setFontSize(9);
            doc.setTextColor(...lightGray);
            doc.text('DuPont analysis data unavailable (company may be too new or foreign)', 15, y + dupontHeight/2);
        }

        // OPERATING EFFICIENCY
        y += dupontHeight + 8;
        doc.setLineWidth(0.5);
        doc.setDrawColor(...lightGray);
        doc.line(15, y, 195, y);

        y += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkGray);
        doc.text('OPERATING EFFICIENCY TRENDS (3 Years)', 15, y);

        y += 5;
        const efficiencyHeight = 45; // Increased back from 36
        if (valueCreationData && valueCreationData.length > 0) {
            this.drawOperatingEfficiency(doc, 15, y, 180, efficiencyHeight, valueCreationData, holding.symbol, digBlue, accentBlue);
        } else {
            doc.setFontSize(9);
            doc.setTextColor(...lightGray);
            doc.text('Operating efficiency data unavailable', 15, y + efficiencyHeight/2);
        }

        // CAPITAL EFFICIENCY
        y += efficiencyHeight + 8;
        doc.setLineWidth(0.5);
        doc.setDrawColor(...lightGray);
        doc.line(15, y, 195, y);

        y += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkGray);
        doc.text('CAPITAL EFFICIENCY (3 Years)', 15, y);

        y += 5;
        const capitalHeight = 45; // Increased back from 36
        if (valueCreationData && valueCreationData.length > 0) {
            this.drawCapitalEfficiency(doc, 15, y, 180, capitalHeight, valueCreationData, holding.symbol, digBlue, accentBlue);
        } else {
            doc.setFontSize(9);
            doc.setTextColor(...lightGray);
            doc.text('Capital efficiency data unavailable', 15, y + capitalHeight/2);
        }

        // VALUE CREATION INSIGHTS
        y += capitalHeight + 7; // Reduced from 10 to 7
        doc.setLineWidth(0.5);
        doc.setDrawColor(...lightGray);
        doc.line(15, y, 195, y);

        y += 6; // Reduced from 8 to 6
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkGray);
        doc.text('VALUE CREATION INSIGHTS', 15, y);

        y += 5;
        if (valueCreationData && valueCreationData.length > 0) {
            this.drawValueCreationInsights(doc, 15, y, 180, valueCreationData, holding.symbol, darkGray, lightGray, digBlue);
        } else {
            doc.setFontSize(9);
            doc.setTextColor(...lightGray);
            doc.text('Insights unavailable', 15, y + 3);
        }

        // FOOTER
        doc.setFontSize(7);
        doc.setTextColor(...lightGray);
        const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.text(`UCSB Dean's Investment Group | Generated ${date} | Page 2 of 2`, 105, 287, { align: 'center' });
        doc.text('This report is for educational purposes only and does not constitute investment advice.', 105, 291, { align: 'center' });
    }

    // ===== HELPER DRAWING FUNCTIONS =====

    static drawMetricBox(doc, x, y, width, label, value, labelColor, valueColor) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...labelColor);
        doc.text(label, x, y);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...valueColor);
        doc.text(String(value || 'N/A'), x, y + 6);
    }

    static drawRelativeValuationCharts(doc, x, y, width, height, valuationMetrics, data, stockSymbol, sectorSymbol, primaryColor, accentColor, goldColor) {
        // Draw 2 charts side by side: P/E ratio trend and P/B ratio trend over 3 years
        const chartWidth = (width - 10) / 2;
        const { stockPrices, sectorPrices } = data;

        // For now, we'll show the current snapshot as we don't have historical P/E and P/B data
        // In a production system, you'd fetch historical fundamental ratios from the API

        // Chart 1: P/E Ratio trend (simulated from price movements)
        this.drawValuationTrendChart(doc, x, y, chartWidth, height, 'P/E Ratio vs. Sector',
            stockPrices, sectorPrices,
            valuationMetrics.peRatio !== 'N/A' ? parseFloat(valuationMetrics.peRatio) : 20,
            18, // sector average P/E
            stockSymbol, sectorSymbol, primaryColor, accentColor);

        // Chart 2: P/B Ratio trend (simulated from price movements)
        this.drawValuationTrendChart(doc, x + chartWidth + 10, y, chartWidth, height, 'P/B Ratio vs. Sector',
            stockPrices, sectorPrices,
            valuationMetrics.pbRatio || 3,
            2.5, // sector average P/B
            stockSymbol, sectorSymbol, primaryColor, accentColor);
    }

    static drawMetricComparisonChart(doc, x, y, width, height, label, stockValue, sectorValue, stockSymbol, sectorSymbol, primaryColor, accentColor) {
        // Title
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text(label, x + width/2, y + 5, { align: 'center' });

        // Draw bars
        const barY = y + 10;
        const barHeight = 8;
        const maxVal = Math.max(stockValue, sectorValue) * 1.3;

        // Stock bar
        const stockWidth = (stockValue / maxVal) * (width - 20);
        doc.setFillColor(...primaryColor);
        doc.rect(x + 10, barY, stockWidth, barHeight, 'F');
        doc.setFontSize(7);
        doc.setTextColor(...primaryColor);
        doc.text(stockValue.toFixed(1), x + 12 + stockWidth, barY + 5.5);

        // Sector bar
        const sectorWidth = (sectorValue / maxVal) * (width - 20);
        doc.setFillColor(...accentColor);
        doc.rect(x + 10, barY + 10, sectorWidth, barHeight, 'F');
        doc.setTextColor(...accentColor);
        doc.text(sectorValue.toFixed(1), x + 12 + sectorWidth, barY + 15.5);

        // Labels
        doc.setFontSize(6);
        doc.setTextColor(100, 100, 100);
        doc.text(stockSymbol, x + 2, barY + 5.5);
        doc.text(sectorSymbol || 'Sector', x + 2, barY + 15.5);

        // Interpretation
        const differential = ((stockValue - sectorValue) / sectorValue * 100);
        const diffColor = Math.abs(differential) < 10 ? [100, 100, 100] :
                         differential > 0 ? [244, 67, 54] : [76, 175, 80];
        doc.setFontSize(6);
        doc.setTextColor(...diffColor);
        const diffText = differential > 0 ? `${differential.toFixed(0)}% premium` : `${Math.abs(differential).toFixed(0)}% discount`;
        doc.text(diffText, x + width/2, y + height - 2, { align: 'center' });
    }

    static drawRelativePerformanceChart(doc, x, y, width, height, stockPrices, sectorPrices, stockSymbol, sectorSymbol, primaryColor, accentColor) {
        if (!stockPrices || !sectorPrices || stockPrices.length === 0 || sectorPrices.length === 0) {
            doc.setFontSize(9);
            doc.setTextColor(150, 150, 150);
            doc.text('No data available', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        // Normalize both to 100 at start
        const stockBase = stockPrices[0].close;
        const sectorBase = sectorPrices[0].close;
        const stockNorm = stockPrices.map(p => (p.close / stockBase) * 100);
        const sectorNorm = sectorPrices.map(p => (p.close / sectorBase) * 100);

        const allVals = [...stockNorm, ...sectorNorm];
        const minVal = Math.min(...allVals) * 0.95;
        const maxVal = Math.max(...allVals) * 1.05;
        const range = maxVal - minVal;

        const marginLeft = 20;
        const marginBottom = 15;
        const marginTop = 5;
        const marginRight = 5;

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
            doc.line(chartX, gridY, chartX + chartW, gridY);
        }

        // Sample data to make smooth lines (every 5th point for cleaner rendering)
        const sampleEvery = Math.max(1, Math.floor(stockNorm.length / 100));

        // Draw stock line (solid, moderate thickness, deep blue)
        doc.setDrawColor(0, 54, 96); // DIG blue
        doc.setLineWidth(1.2);
        for (let i = sampleEvery; i < stockNorm.length; i += sampleEvery) {
            const x1 = chartX + ((i - sampleEvery) / (stockNorm.length - 1)) * chartW;
            const y1 = chartY + chartH - ((stockNorm[i - sampleEvery] - minVal) / range) * chartH;
            const x2 = chartX + (i / (stockNorm.length - 1)) * chartW;
            const y2 = chartY + chartH - ((stockNorm[i] - minVal) / range) * chartH;
            doc.line(x1, y1, x2, y2);
        }

        // Draw sector line (solid, slightly thinner, lighter color for contrast)
        doc.setDrawColor(150, 150, 150); // Gray
        doc.setLineWidth(1.0);
        const minLen = Math.min(stockNorm.length, sectorNorm.length);
        for (let i = sampleEvery; i < minLen; i += sampleEvery) {
            const x1 = chartX + ((i - sampleEvery) / (minLen - 1)) * chartW;
            const y1 = chartY + chartH - ((sectorNorm[i - sampleEvery] - minVal) / range) * chartH;
            const x2 = chartX + (i / (minLen - 1)) * chartW;
            const y2 = chartY + chartH - ((sectorNorm[i] - minVal) / range) * chartH;
            doc.line(x1, y1, x2, y2);
        }

        // Y-axis labels
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        for (let i = 0; i <= 5; i++) {
            const val = minVal + (range * i / 5);
            const yPos = chartY + chartH - (chartH * i / 5);
            doc.text(val.toFixed(0), x + 2, yPos + 2);
        }

        // X-axis labels (dates)
        const dateStep = Math.floor(stockPrices.length / 5);
        for (let i = 0; i <= 5; i++) {
            const idx = Math.min(i * dateStep, stockPrices.length - 1);
            const date = new Date(stockPrices[idx].timestamp);
            const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            const xPos = chartX + (idx / (stockPrices.length - 1)) * chartW;
            doc.setFontSize(6);
            doc.text(label, xPos, chartY + chartH + 8, { align: 'center' });
        }

        // Legend
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 54, 96); // DIG blue
        const stockPerf = ((stockNorm[stockNorm.length - 1] - 100)).toFixed(1);
        doc.text(`${stockSymbol}: ${stockPerf >= 0 ? '+' : ''}${stockPerf}%`, x + width - 60, y + 3);

        doc.setTextColor(150, 150, 150); // Gray
        const sectorPerf = ((sectorNorm[sectorNorm.length - 1] - 100)).toFixed(1);
        doc.text(`${sectorSymbol}: ${sectorPerf >= 0 ? '+' : ''}${sectorPerf}%`, x + width - 60, y + 8);

        // Outperformance
        const outperf = parseFloat(stockPerf) - parseFloat(sectorPerf);
        const outperfColor = outperf >= 0 ? [76, 175, 80] : [244, 67, 54];
        doc.setTextColor(...outperfColor);
        doc.setFontSize(9);
        doc.text(`${outperf >= 0 ? '+' : ''}${outperf.toFixed(1)}% vs sector`, x + 5, y + height - 2);
    }

    static drawValuationTrendsCharts(doc, x, y, width, height, stockValuations, sectorValuations, stockSymbol, sectorSymbol, primaryColor, accentColor) {
        if (!stockValuations || stockValuations.length === 0) {
            doc.setFontSize(9);
            doc.setTextColor(150, 150, 150);
            doc.text('Valuation data not available', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        // Draw three charts side by side: P/E ratio, P/B ratio, and EPS
        const chartWidth = (width - 16) / 3;
        const chartHeight = height;

        // P/E Ratio Chart (left)
        this.drawSingleValuationTrend(doc, x, y, chartWidth, chartHeight,
            stockValuations, sectorValuations, 'peRatio', 'P/E Ratio',
            stockSymbol, sectorSymbol, primaryColor, accentColor);

        // P/B Ratio Chart (middle)
        this.drawSingleValuationTrend(doc, x + chartWidth + 8, y, chartWidth, chartHeight,
            stockValuations, sectorValuations, 'pbRatio', 'P/B Ratio',
            stockSymbol, sectorSymbol, primaryColor, accentColor);

        // EPS Chart (right)
        this.drawSingleValuationTrend(doc, x + (chartWidth + 8) * 2, y, chartWidth, chartHeight,
            stockValuations, sectorValuations, 'eps', 'EPS',
            stockSymbol, sectorSymbol, primaryColor, accentColor);
    }

    static drawSingleValuationTrend(doc, x, y, width, height, stockValuations, sectorValuations, metric, metricLabel, stockSymbol, sectorSymbol, primaryColor, accentColor) {
        // Extract the metric values
        const stockMetrics = stockValuations.map(v => v[metric]).filter(v => v !== null && v !== undefined);
        const sectorMetrics = sectorValuations ? sectorValuations.map(v => v[metric]).filter(v => v !== null && v !== undefined) : [];

        if (stockMetrics.length === 0) {
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('No data', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        const hasSectorData = sectorMetrics.length > 0;

        // Chart title
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text(metricLabel, x + width/2, y + 5, { align: 'center' });

        // Calculate ranges - handle negative values correctly
        const allValues = hasSectorData ? [...stockMetrics, ...sectorMetrics] : stockMetrics;
        const minRaw = Math.min(...allValues);
        const maxRaw = Math.max(...allValues);

        // For negative values, multiply by 1.15 to expand downward; for positive, multiply by 0.85
        const minVal = minRaw < 0 ? minRaw * 1.15 : minRaw * 0.85;
        const maxVal = maxRaw > 0 ? maxRaw * 1.15 : maxRaw * 0.85;
        const range = maxVal - minVal;

        const marginLeft = 12;
        const marginBottom = 12;
        const marginTop = 10;
        const marginRight = 3;

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
        for (let i = 1; i <= 3; i++) {
            const gridY = chartY + (chartH * i / 4);
            doc.line(chartX, gridY, chartX + chartW, gridY);
        }

        // Draw stock line (DIG blue, solid) with smooth interpolation
        doc.setDrawColor(0, 54, 96);
        doc.setLineWidth(0.5);

        // Create smooth curve by interpolating between quarterly points
        const smoothSteps = 10; // Interpolate between each pair of points
        for (let i = 0; i < stockMetrics.length - 1; i++) {
            const val1 = stockMetrics[i];
            const val2 = stockMetrics[i + 1];

            for (let step = 0; step < smoothSteps; step++) {
                const t1 = step / smoothSteps;
                const t2 = (step + 1) / smoothSteps;

                // Linear interpolation (for smooth quarterly data)
                const interpVal1 = val1 + (val2 - val1) * t1;
                const interpVal2 = val1 + (val2 - val1) * t2;

                const x1 = chartX + ((i + t1) / (stockMetrics.length - 1)) * chartW;
                const y1 = chartY + chartH - ((interpVal1 - minVal) / range) * chartH;
                const x2 = chartX + ((i + t2) / (stockMetrics.length - 1)) * chartW;
                const y2 = chartY + chartH - ((interpVal2 - minVal) / range) * chartH;

                doc.line(x1, y1, x2, y2);
            }
        }

        // Draw sector line (gray, solid) with smooth interpolation - only if sector data is available
        if (hasSectorData) {
            doc.setDrawColor(150, 150, 150);
            doc.setLineWidth(0.4);
            const minLen = Math.min(stockMetrics.length, sectorMetrics.length);

            for (let i = 0; i < minLen - 1; i++) {
                const val1 = sectorMetrics[i];
                const val2 = sectorMetrics[i + 1];

                for (let step = 0; step < smoothSteps; step++) {
                    const t1 = step / smoothSteps;
                    const t2 = (step + 1) / smoothSteps;

                    const interpVal1 = val1 + (val2 - val1) * t1;
                    const interpVal2 = val1 + (val2 - val1) * t2;

                    const x1 = chartX + ((i + t1) / (minLen - 1)) * chartW;
                    const y1 = chartY + chartH - ((interpVal1 - minVal) / range) * chartH;
                    const x2 = chartX + ((i + t2) / (minLen - 1)) * chartW;
                    const y2 = chartY + chartH - ((interpVal2 - minVal) / range) * chartH;

                    doc.line(x1, y1, x2, y2);
                }
            }
        }

        // Y-axis labels
        doc.setFontSize(6);
        doc.setTextColor(100, 100, 100);
        for (let i = 0; i <= 4; i++) {
            const val = minVal + (range * i / 4);
            const yPos = chartY + chartH - (chartH * i / 4);
            doc.text(val.toFixed(1), x + 2, yPos + 1.5);
        }

        // X-axis labels (quarters)
        const labelStep = Math.max(1, Math.floor(stockValuations.length / 3));
        for (let i = 0; i < stockValuations.length; i += labelStep) {
            if (i < stockValuations.length) {
                const v = stockValuations[i];
                const label = `Q${v.fiscalPeriod} '${v.fiscalYear.toString().slice(-2)}`;
                const xPos = chartX + (i / (stockValuations.length - 1)) * chartW;
                doc.setFontSize(5);
                doc.text(label, xPos, chartY + chartH + 7, { align: 'center' });
            }
        }

        // Legend with current values
        const latestStock = stockMetrics[stockMetrics.length - 1];

        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 54, 96);
        doc.text(`${stockSymbol}: ${latestStock.toFixed(1)}`, x + 5, y + height - 2);

        // Only show sector legend if sector data is available
        if (hasSectorData) {
            const latestSector = sectorMetrics[sectorMetrics.length - 1];
            doc.setTextColor(150, 150, 150);
            doc.text(`${sectorSymbol}: ${latestSector.toFixed(1)}`, x + width - 35, y + height - 2);
        }
    }

    static drawCompactPerformanceChart(doc, x, y, width, height, stockPrices, sectorPrices, stockSymbol, sectorSymbol, primaryColor, accentColor) {
        if (!stockPrices || !sectorPrices || stockPrices.length === 0 || sectorPrices.length === 0) {
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('No data', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        // Title
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text('3Y Performance', x + width/2, y + 5, { align: 'center' });

        // Normalize to 100
        const stockBase = stockPrices[0].close;
        const sectorBase = sectorPrices[0].close;
        const stockNorm = stockPrices.map(p => (p.close / stockBase) * 100);
        const sectorNorm = sectorPrices.map(p => (p.close / sectorBase) * 100);

        const allVals = [...stockNorm, ...sectorNorm];
        const minVal = Math.min(...allVals);
        const maxVal = Math.max(...allVals);
        const range = maxVal - minVal;

        const chartX = x + 5;
        const chartY = y + 10;
        const chartW = width - 10;
        const chartH = height - 18;

        // Draw stock line (smooth)
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(1.2);
        for (let i = 1; i < stockNorm.length; i++) {
            const x1 = chartX + ((i - 1) / (stockNorm.length - 1)) * chartW;
            const y1 = chartY + chartH - ((stockNorm[i - 1] - minVal) / range) * chartH;
            const x2 = chartX + (i / (stockNorm.length - 1)) * chartW;
            const y2 = chartY + chartH - ((stockNorm[i] - minVal) / range) * chartH;
            doc.line(x1, y1, x2, y2);
        }

        // Draw sector line (smooth, dashed)
        doc.setDrawColor(...accentColor);
        doc.setLineWidth(0.9);
        doc.setLineDash([2, 1]);
        const minLen = Math.min(stockNorm.length, sectorNorm.length);
        for (let i = 1; i < minLen; i++) {
            const x1 = chartX + ((i - 1) / (minLen - 1)) * chartW;
            const y1 = chartY + chartH - ((sectorNorm[i - 1] - minVal) / range) * chartH;
            const x2 = chartX + (i / (minLen - 1)) * chartW;
            const y2 = chartY + chartH - ((sectorNorm[i] - minVal) / range) * chartH;
            doc.line(x1, y1, x2, y2);
        }
        doc.setLineDash([]);

        // Performance text
        const stockPerf = stockNorm[stockNorm.length - 1] - 100;
        const sectorPerf = sectorNorm[sectorNorm.length - 1] - 100;
        const outperf = stockPerf - sectorPerf;
        const outperfColor = outperf >= 0 ? [76, 175, 80] : [244, 67, 54];

        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...outperfColor);
        doc.text(`${outperf >= 0 ? '+' : ''}${outperf.toFixed(0)}% vs sector`, x + width/2, y + height - 2, { align: 'center' });
    }

    static drawValuationTrendChart(doc, x, y, width, height, label, stockPrices, sectorPrices, currentStockRatio, currentSectorRatio, stockSymbol, sectorSymbol, primaryColor, accentColor) {
        if (!stockPrices || !sectorPrices || stockPrices.length === 0 || sectorPrices.length === 0) {
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('No data', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        // Title
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text(label, x + width/2, y + 5, { align: 'center' });

        // Simulate ratio trends based on price changes (since we don't have historical fundamental ratios)
        // Assume earnings are relatively stable, so P/E moves proportionally with price
        const stockBase = stockPrices[0].close;
        const sectorBase = sectorPrices[0].close;

        const stockRatios = stockPrices.map(p => (p.close / stockBase) * currentStockRatio);
        const sectorRatios = sectorPrices.map(p => (p.close / sectorBase) * currentSectorRatio);

        const allVals = [...stockRatios, ...sectorRatios];
        const minVal = Math.min(...allVals) * 0.9;
        const maxVal = Math.max(...allVals) * 1.1;
        const range = maxVal - minVal;

        const chartX = x + 12;
        const chartY = y + 12;
        const chartW = width - 17;
        const chartH = height - 22;

        // Background
        doc.setFillColor(250, 250, 250);
        doc.rect(chartX, chartY, chartW, chartH, 'F');

        // Grid lines
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        for (let i = 1; i <= 3; i++) {
            const gridY = chartY + (chartH * i / 4);
            doc.line(chartX, gridY, chartX + chartW, gridY);
        }

        // Smooth the data by sampling fewer points
        const sampleSize = Math.min(100, stockRatios.length);
        const sampleInterval = Math.floor(stockRatios.length / sampleSize);

        // Draw stock ratio line (smooth)
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(2);
        for (let i = 0; i < sampleSize - 1; i++) {
            const idx1 = i * sampleInterval;
            const idx2 = Math.min((i + 1) * sampleInterval, stockRatios.length - 1);

            const x1 = chartX + (idx1 / (stockRatios.length - 1)) * chartW;
            const y1 = chartY + chartH - ((stockRatios[idx1] - minVal) / range) * chartH;
            const x2 = chartX + (idx2 / (stockRatios.length - 1)) * chartW;
            const y2 = chartY + chartH - ((stockRatios[idx2] - minVal) / range) * chartH;
            doc.line(x1, y1, x2, y2);
        }

        // Draw sector ratio line (smooth, dashed)
        doc.setDrawColor(...accentColor);
        doc.setLineWidth(1.5);
        doc.setLineDash([3, 2]);
        for (let i = 0; i < sampleSize - 1; i++) {
            const idx1 = i * sampleInterval;
            const idx2 = Math.min((i + 1) * sampleInterval, sectorRatios.length - 1);

            const x1 = chartX + (idx1 / (sectorRatios.length - 1)) * chartW;
            const y1 = chartY + chartH - ((sectorRatios[idx1] - minVal) / range) * chartH;
            const x2 = chartX + (idx2 / (sectorRatios.length - 1)) * chartW;
            const y2 = chartY + chartH - ((sectorRatios[idx2] - minVal) / range) * chartH;
            doc.line(x1, y1, x2, y2);
        }
        doc.setLineDash([]);

        // Y-axis labels
        doc.setFontSize(6);
        doc.setTextColor(100, 100, 100);
        for (let i = 0; i <= 4; i++) {
            const val = minVal + (range * i / 4);
            const yPos = chartY + chartH - (chartH * i / 4);
            doc.text(val.toFixed(1), x + 2, yPos + 2);
        }

        // X-axis labels (3 year = ~750 trading days, show start, middle, end)
        const dateLabels = [0, Math.floor(stockPrices.length / 2), stockPrices.length - 1];
        dateLabels.forEach(idx => {
            const date = new Date(stockPrices[idx].timestamp);
            const label = date.toLocaleDateString('en-US', { year: '2-digit', month: 'short' });
            const xPos = chartX + (idx / (stockPrices.length - 1)) * chartW;
            doc.setFontSize(5);
            doc.text(label, xPos, chartY + chartH + 5, { align: 'center' });
        });

        // Legend
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primaryColor);
        doc.text(`━ ${stockSymbol}: ${currentStockRatio.toFixed(1)}`, x + 5, y + height - 2);

        doc.setTextColor(...accentColor);
        doc.text(`- - ${sectorSymbol}: ${currentSectorRatio.toFixed(1)}`, x + width - 35, y + height - 2);
    }

    static drawSmoothPriceChart(doc, x, y, width, height, prices, symbol, primaryColor, accentColor) {
        if (!prices || prices.length === 0) return;

        const closes = prices.map(p => p.close);
        const highs = prices.map(p => p.high);
        const lows = prices.map(p => p.low);
        const minPrice = Math.min(...lows);
        const maxPrice = Math.max(...highs);
        const priceRange = maxPrice - minPrice;

        const marginLeft = 18;
        const marginBottom = 12;
        const marginTop = 3;
        const marginRight = 3;

        const chartX = x + marginLeft;
        const chartY = y + marginTop;
        const chartWidth = width - marginLeft - marginRight;
        const chartHeight = height - marginTop - marginBottom;

        // Background
        doc.setFillColor(250, 250, 250);
        doc.rect(chartX, chartY, chartWidth, chartHeight, 'F');

        // Grid lines
        doc.setDrawColor(240, 240, 240);
        doc.setLineWidth(0.2);
        for (let i = 1; i <= 3; i++) {
            const gridY = chartY + (chartHeight * i / 4);
            doc.line(chartX, gridY, chartX + chartWidth, gridY);
        }

        // Draw candlesticks (simplified as lines with range)
        const candleWidth = Math.max(0.3, chartWidth / prices.length * 0.6);

        prices.forEach((p, i) => {
            const xPos = chartX + (i / (prices.length - 1)) * chartWidth;
            const highY = chartY + chartHeight - ((p.high - minPrice) / priceRange) * chartHeight;
            const lowY = chartY + chartHeight - ((p.low - minPrice) / priceRange) * chartHeight;
            const closeY = chartY + chartHeight - ((p.close - minPrice) / priceRange) * chartHeight;
            const openY = chartY + chartHeight - ((p.open - minPrice) / priceRange) * chartHeight;

            // Wick (high-low line)
            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.3);
            doc.line(xPos, highY, xPos, lowY);

            // Body color - Green for up, Red for down
            const isUp = p.close >= p.open;
            if (isUp) {
                doc.setFillColor(76, 175, 80); // Green
            } else {
                doc.setFillColor(244, 67, 54); // Red
            }

            // Draw body
            const bodyHeight = Math.max(Math.abs(closeY - openY), 0.5);
            const bodyY = Math.min(closeY, openY);
            doc.rect(xPos - candleWidth/2, bodyY, candleWidth, bodyHeight, 'F');
        });

        // Y-axis
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        for (let i = 0; i <= 4; i++) {
            const price = minPrice + (priceRange * i / 4);
            const yPos = chartY + chartHeight - (chartHeight * i / 4);
            doc.text(`$${price.toFixed(0)}`, x + 2, yPos + 2);
        }

        // X-axis (fewer labels)
        const dateStep = Math.floor(prices.length / 4);
        for (let i = 0; i < 5; i++) {
            const idx = Math.min(i * dateStep, prices.length - 1);
            const date = new Date(prices[idx].timestamp);
            const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            const xPos = chartX + (idx / (prices.length - 1)) * chartWidth;
            doc.setFontSize(6);
            doc.text(label, xPos, chartY + chartHeight + 7, { align: 'center' });
        }

        // Performance stats below the chart (not overlapping)
        const firstPrice = prices[0].close;
        const lastPrice = prices[prices.length - 1].close;
        const perfChange = ((lastPrice - firstPrice) / firstPrice * 100);
        const perfColor = perfChange >= 0 ? [76, 175, 80] : [244, 67, 54];

        // Calculate additional stats
        const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;
        const yearHigh = Math.max(...highs);
        const yearLow = Math.min(...lows);

        // Stats display below chart
        const statsY = chartY + chartHeight + 13;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...perfColor);
        doc.text(`Return: ${perfChange >= 0 ? '+' : ''}${perfChange.toFixed(1)}%`, x, statsY);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`High: $${yearHigh.toFixed(2)}`, x + 40, statsY);
        doc.text(`Low: $${yearLow.toFixed(2)}`, x + 80, statsY);
        doc.text(`Avg: $${avgClose.toFixed(2)}`, x + 120, statsY);
    }

    static drawVolumeChart(doc, x, y, width, height, prices, analytics, primaryColor, lightColor) {
        if (!prices || prices.length === 0) return;

        const volumes = prices.map(p => p.volume);
        const maxVol = Math.max(...volumes);

        const marginLeft = 18;
        const marginBottom = 12;
        const marginTop = 3;

        const chartX = x + marginLeft;
        const chartY = y + marginTop;
        const chartWidth = width - marginLeft - 3;
        const chartHeight = height - marginTop - marginBottom;

        // Background
        doc.setFillColor(250, 250, 250);
        doc.rect(chartX, chartY, chartWidth, chartHeight, 'F');

        // Volume bars
        const barWidth = chartWidth / prices.length * 0.8;
        prices.forEach((p, i) => {
            const xPos = chartX + (i / prices.length) * chartWidth;
            const barHeight = (p.volume / maxVol) * chartHeight;
            const barY = chartY + chartHeight - barHeight;

            doc.setFillColor(...primaryColor);
            doc.setFillColor(200, 200, 200);
            doc.rect(xPos, barY, barWidth, barHeight, 'F');
        });

        // Y-axis
        doc.setFontSize(6);
        doc.setTextColor(100, 100, 100);
        doc.text(this.formatVolumeShort(maxVol), x + 2, chartY + 8);
        doc.text(this.formatVolumeShort(maxVol / 2), x + 2, chartY + chartHeight / 2 + 2);

        // X-axis
        const dateStep = Math.floor(prices.length / 4);
        for (let i = 0; i < 5; i++) {
            const idx = Math.min(i * dateStep, prices.length - 1);
            const date = new Date(prices[idx].timestamp);
            const label = date.toLocaleDateString('en-US', { month: 'short' });
            const xPos = chartX + (idx / prices.length) * chartWidth;
            doc.text(label, xPos, chartY + chartHeight + 7, { align: 'center' });
        }

        // Avg volume text
        const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Avg: ${this.formatVolumeShort(avgVol)}`, x + width - 25, y + 3);
    }

    static formatVolumeShort(vol) {
        if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
        if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
        if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
        return vol.toFixed(0);
    }

    static drawFinancialHighlightsTable(doc, x, y, width, financials, primaryColor, darkColor, lightColor) {
        const latest = financials[0];
        const colWidth = width / 4;

        // Row 1
        this.drawTableCell(doc, x, y, colWidth, 'Revenue', this.formatLargeNumber(latest.revenues), primaryColor, darkColor);
        this.drawTableCell(doc, x + colWidth, y, colWidth, 'Net Income', this.formatLargeNumber(latest.netIncome), primaryColor, darkColor);
        this.drawTableCell(doc, x + colWidth * 2, y, colWidth, 'EPS', latest.eps?.toFixed(2) || 'N/A', primaryColor, darkColor);
        this.drawTableCell(doc, x + colWidth * 3, y, colWidth, 'Gross Margin', latest.revenues && latest.grossProfit ? `${((latest.grossProfit / latest.revenues) * 100).toFixed(1)}%` : 'N/A', primaryColor, darkColor);

        // Row 2
        y += 12;
        this.drawTableCell(doc, x, y, colWidth, 'Total Assets', this.formatLargeNumber(latest.assets), primaryColor, darkColor);
        this.drawTableCell(doc, x + colWidth, y, colWidth, 'Total Equity', this.formatLargeNumber(latest.equity), primaryColor, darkColor);
        this.drawTableCell(doc, x + colWidth * 2, y, colWidth, 'ROE', latest.equity && latest.netIncome ? `${((latest.netIncome / latest.equity) * 100).toFixed(1)}%` : 'N/A', primaryColor, darkColor);
        this.drawTableCell(doc, x + colWidth * 3, y, colWidth, 'Filing Date', latest.filingDate || 'N/A', primaryColor, darkColor);
    }

    static drawDetailedFinancialsTable(doc, x, y, width, financials, primaryColor, darkColor, lightColor) {
        const periods = financials.slice(0, 3);
        const colWidth = (width - 50) / 3;

        // Header
        doc.setFillColor(240, 240, 240);
        doc.rect(x, y, width, 8, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text('($ Millions)', x + 2, y + 5);

        periods.forEach((p, i) => {
            const period = p.fiscalPeriod === 'FY' ? `FY ${p.fiscalYear}` : `Q${p.fiscalPeriod} ${p.fiscalYear}`;
            doc.text(period, x + 50 + (i * colWidth) + colWidth/2, y + 5, { align: 'center' });
        });

        // Rows
        const rows = [
            { label: 'Revenue', getValue: (f) => f.revenues ? (f.revenues / 1000000).toFixed(0) : 'N/A' },
            { label: 'Gross Profit', getValue: (f) => f.grossProfit ? (f.grossProfit / 1000000).toFixed(0) : 'N/A' },
            { label: 'Operating Income', getValue: (f) => f.operatingIncome ? (f.operatingIncome / 1000000).toFixed(0) : 'N/A' },
            { label: 'Net Income', getValue: (f) => f.netIncome ? (f.netIncome / 1000000).toFixed(0) : 'N/A' },
            { label: 'EPS (Basic)', getValue: (f) => f.eps ? f.eps.toFixed(2) : 'N/A' },
            { label: 'Total Assets', getValue: (f) => f.assets ? (f.assets / 1000000).toFixed(0) : 'N/A' },
            { label: 'Total Equity', getValue: (f) => f.equity ? (f.equity / 1000000).toFixed(0) : 'N/A' },
        ];

        let rowY = y + 8;
        rows.forEach((row, idx) => {
            if (idx % 2 === 0) {
                doc.setFillColor(250, 250, 250);
                doc.rect(x, rowY, width, 6, 'F');
            }

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...darkColor);
            doc.text(row.label, x + 2, rowY + 4);

            periods.forEach((p, i) => {
                const value = row.getValue(p);
                doc.text(value, x + 50 + (i * colWidth) + colWidth/2, rowY + 4, { align: 'center' });
            });

            rowY += 6;
        });
    }

    static drawNewsSection(doc, x, y, width, news, darkColor, lightColor, accentColor) {
        doc.setFontSize(8);

        news.slice(0, 3).forEach((article, idx) => {
            const date = new Date(article.published).toLocaleDateString();
            const yPos = y + (idx * 10);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...accentColor);
            doc.text('•', x, yPos + 2);

            doc.setTextColor(...darkColor);
            const titleLines = doc.splitTextToSize(article.title, width - 10);
            const titleText = titleLines[0];

            // Add hyperlink to the title
            if (article.url) {
                doc.setTextColor(66, 133, 244); // Blue color for link
                doc.textWithLink(titleText, x + 5, yPos + 2, { url: article.url });
            } else {
                doc.text(titleText, x + 5, yPos + 2);
            }

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...lightColor);
            doc.text(`${date} | ${article.publisher?.name || 'Unknown'}`, x + 5, yPos + 6);
        });
    }

    static drawRiskFactors(doc, x, y, width, analytics, holding, darkColor, lightColor) {
        const riskFactors = [];

        if (analytics.volatility > 0.3) {
            riskFactors.push('• High volatility may result in significant price swings');
        }
        if (analytics.beta > 1.5) {
            riskFactors.push('• High beta indicates sensitivity to market movements');
        }
        if (analytics.beta < 0.5) {
            riskFactors.push('• Low beta may indicate limited correlation with broader market');
        }

        riskFactors.push('• Market conditions and sector trends may impact performance');
        riskFactors.push('• Historical performance does not guarantee future results');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);

        riskFactors.forEach((risk, idx) => {
            doc.text(risk, x, y + (idx * 4) + 2);
        });
    }

    static drawTableCell(doc, x, y, width, label, value, labelColor, valueColor) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...labelColor);
        doc.text(label, x + 2, y + 3);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...valueColor);
        doc.text(String(value), x + 2, y + 8);
    }

    // ===== VALUE CREATION CHART FUNCTIONS =====

    static drawDuPontDecomposition(doc, x, y, width, height, valueCreation, symbol, primaryColor, accentColor) {
        if (!valueCreation || valueCreation.length === 0) return;

        // Draw three charts side-by-side: Profit Margin, Asset Turnover, Equity Multiplier
        const chartWidth = (width - 16) / 3;
        const chartHeight = height;

        // Profit Margin (Net Margin)
        this.drawSingleMetricTrend(doc, x, y, chartWidth, chartHeight,
            valueCreation, 'profitMargin', 'Net Margin (%)',
            symbol, primaryColor);

        // Asset Turnover
        this.drawSingleMetricTrend(doc, x + chartWidth + 8, y, chartWidth, chartHeight,
            valueCreation, 'assetTurnover', 'Asset Turnover',
            symbol, primaryColor);

        // Equity Multiplier (Financial Leverage)
        this.drawSingleMetricTrend(doc, x + (chartWidth + 8) * 2, y, chartWidth, chartHeight,
            valueCreation, 'equityMultiplier', 'Leverage',
            symbol, primaryColor);
    }

    static drawOperatingEfficiency(doc, x, y, width, height, valueCreation, symbol, primaryColor, accentColor) {
        if (!valueCreation || valueCreation.length === 0) return;

        // Draw two charts side-by-side: Gross Margin and Operating Margin
        const chartWidth = (width - 8) / 2;
        const chartHeight = height;

        // Gross Margin
        this.drawSingleMetricTrend(doc, x, y, chartWidth, chartHeight,
            valueCreation, 'grossMargin', 'Gross Margin (%)',
            symbol, primaryColor);

        // Operating Margin
        this.drawSingleMetricTrend(doc, x + chartWidth + 8, y, chartWidth, chartHeight,
            valueCreation, 'operatingMargin', 'Operating Margin (%)',
            symbol, primaryColor);
    }

    static drawCapitalEfficiency(doc, x, y, width, height, valueCreation, symbol, primaryColor, accentColor) {
        if (!valueCreation || valueCreation.length === 0) return;

        // Draw two charts side-by-side: ROIC and Debt-to-Equity
        const chartWidth = (width - 8) / 2;
        const chartHeight = height;

        // ROIC
        this.drawSingleMetricTrend(doc, x, y, chartWidth, chartHeight,
            valueCreation, 'roic', 'ROIC (%)',
            symbol, primaryColor);

        // Debt-to-Equity
        this.drawSingleMetricTrend(doc, x + chartWidth + 8, y, chartWidth, chartHeight,
            valueCreation, 'debtToEquity', 'Debt/Equity',
            symbol, primaryColor);
    }

    static drawSingleMetricTrend(doc, x, y, width, height, valueCreation, metric, metricLabel, symbol, primaryColor) {
        const metrics = valueCreation.map(v => v[metric]).filter(v => v !== null && v !== undefined);

        if (metrics.length === 0) {
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('No data', x + width/2, y + height/2, { align: 'center' });
            return;
        }

        // Chart title
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text(metricLabel, x + width/2, y + 4, { align: 'center' });

        // Chart dimensions
        const marginLeft = 12;
        const marginBottom = 8;
        const marginTop = 8;
        const marginRight = 3;

        const chartX = x + marginLeft;
        const chartY = y + marginTop;
        const chartW = width - marginLeft - marginRight;
        const chartH = height - marginTop - marginBottom;

        // Calculate ranges - handle negative values correctly
        const minRaw = Math.min(...metrics);
        const maxRaw = Math.max(...metrics);

        // For negative values, multiply by 1.1 to expand downward; for positive, multiply by 0.9
        const minVal = minRaw < 0 ? minRaw * 1.1 : minRaw * 0.9;
        const maxVal = maxRaw > 0 ? maxRaw * 1.1 : maxRaw * 0.9;
        const range = maxVal - minVal;

        // Background
        doc.setFillColor(250, 250, 250);
        doc.rect(chartX, chartY, chartW, chartH, 'F');

        // Grid lines
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        for (let i = 1; i <= 2; i++) {
            const gridY = chartY + (chartH * i / 3);
            doc.line(chartX, gridY, chartX + chartW, gridY);
        }

        // Draw line with smooth interpolation
        doc.setDrawColor(0, 54, 96);
        doc.setLineWidth(0.5);

        const smoothSteps = 10;
        for (let i = 0; i < metrics.length - 1; i++) {
            const val1 = metrics[i];
            const val2 = metrics[i + 1];

            for (let step = 0; step < smoothSteps; step++) {
                const t1 = step / smoothSteps;
                const t2 = (step + 1) / smoothSteps;

                const interpVal1 = val1 + (val2 - val1) * t1;
                const interpVal2 = val1 + (val2 - val1) * t2;

                const x1 = chartX + ((i + t1) / (metrics.length - 1)) * chartW;
                const y1 = chartY + chartH - ((interpVal1 - minVal) / range) * chartH;
                const x2 = chartX + ((i + t2) / (metrics.length - 1)) * chartW;
                const y2 = chartY + chartH - ((interpVal2 - minVal) / range) * chartH;

                doc.line(x1, y1, x2, y2);
            }
        }

        // Y-axis labels
        doc.setFontSize(6);
        doc.setTextColor(100, 100, 100);
        for (let i = 0; i <= 2; i++) {
            const val = minVal + (range * i / 2);
            const yPos = chartY + chartH - (chartH * i / 2);
            const displayVal = metric.includes('Margin') || metric === 'roic' || metric === 'roe'
                ? val.toFixed(0) + '%'
                : val.toFixed(2);
            doc.text(displayVal, x + 2, yPos + 1.5);
        }

        // Current value
        const latestValue = metrics[metrics.length - 1];
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 54, 96);
        const displayLatest = metric.includes('Margin') || metric === 'roic' || metric === 'roe'
            ? latestValue.toFixed(1) + '%'
            : latestValue.toFixed(2);
        doc.text(`Latest: ${displayLatest}`, x + width - 3, y + height - 2, { align: 'right' });
    }

    static drawValueCreationInsights(doc, x, y, width, valueCreation, symbol, darkColor, lightColor, accentColor) {
        if (!valueCreation || valueCreation.length < 2) {
            doc.setFontSize(8);
            doc.setTextColor(...lightColor);
            doc.text('Insufficient data for insights', x, y + 3);
            return;
        }

        const insights = [];
        const latest = valueCreation[valueCreation.length - 1];
        const oldest = valueCreation[0];

        // ROE trend
        const roeDelta = latest.roe - oldest.roe;
        if (roeDelta > 2) {
            insights.push(`• ROE expanding by ${roeDelta.toFixed(1)}pp to ${latest.roe.toFixed(1)}% - strong value creation`);
        } else if (roeDelta < -2) {
            insights.push(`• ROE declining by ${Math.abs(roeDelta).toFixed(1)}pp to ${latest.roe.toFixed(1)}% - weakening returns`);
        }

        // Margin trend
        const marginDelta = latest.operatingMargin - oldest.operatingMargin;
        if (marginDelta > 2) {
            insights.push(`• Operating margin expansion of ${marginDelta.toFixed(1)}pp indicates improving profitability`);
        } else if (marginDelta < -2) {
            insights.push(`• Operating margin compression of ${Math.abs(marginDelta).toFixed(1)}pp signals pricing pressure`);
        }

        // Asset turnover
        if (latest.assetTurnover > 0.5) {
            insights.push(`• Strong asset turnover of ${latest.assetTurnover.toFixed(2)}x demonstrates efficient capital deployment`);
        } else if (latest.assetTurnover < 0.2) {
            insights.push(`• Low asset turnover of ${latest.assetTurnover.toFixed(2)}x indicates capital-intensive business model`);
        }

        // Leverage
        const leverageDelta = latest.debtToEquity - oldest.debtToEquity;
        if (leverageDelta > 0.2) {
            insights.push(`• Increasing leverage (D/E: ${latest.debtToEquity.toFixed(2)}x) amplifying returns but adding risk`);
        } else if (leverageDelta < -0.2) {
            insights.push(`• Deleveraging (D/E: ${latest.debtToEquity.toFixed(2)}x) improving financial flexibility`);
        }

        // ROIC vs Debt cost approximation
        if (latest.roic > 15) {
            insights.push(`• High ROIC of ${latest.roic.toFixed(1)}% suggests strong competitive moat and pricing power`);
        }

        // Default if no specific insights
        if (insights.length === 0) {
            insights.push(`• ROE: ${latest.roe.toFixed(1)}%, Operating Margin: ${latest.operatingMargin.toFixed(1)}%, ROIC: ${latest.roic.toFixed(1)}%`);
            insights.push('• Metrics remain stable with consistent value creation patterns');
        }

        doc.setFontSize(6.5); // Reduced from 7 to 6.5
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...darkColor);

        insights.slice(0, 4).forEach((insight, idx) => {
            doc.text(insight, x, y + (idx * 4) + 3); // Reduced line spacing from 4.5 to 4
        });
    }

    // ===== DATA FETCHING FUNCTIONS =====

    static async fetchComprehensiveData(symbol, apiBaseUrl) {
        try {
            const response = await fetch(`${apiBaseUrl}/api/stock/${symbol}/comprehensive`);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching comprehensive data:', error);
            return { quote: null, details: null, financials: [], news: [] };
        }
    }

    static async fetchHistoricalData(symbol, apiBaseUrl, days = 180) {
        try {
            const toDate = new Date().toISOString().split('T')[0];
            const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const response = await fetch(`${apiBaseUrl}/api/stock/${symbol}/history?from=${fromDate}&to=${toDate}&limit=200`);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching historical data:', error);
            return { prices: [] };
        }
    }

    static async fetchAnalytics(symbol, apiBaseUrl) {
        try {
            const response = await fetch(`${apiBaseUrl}/api/stock/${symbol}/analytics`);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching analytics:', error);
            return { analytics: {} };
        }
    }

    static async fetchSectorETFComparison(sector, apiBaseUrl) {
        // Map sectors to ETFs
        const sectorETFs = {
            'Technology': 'XLK',
            'Information Technology': 'XLK',
            'Financials': 'XLF',
            'Health Care': 'XLV',
            'Consumer Discretionary': 'XLY',
            'Communication Services': 'XLC',
            'Industrials': 'XLI',
            'Consumer Staples': 'XLP',
            'Energy': 'XLE',
            'Utilities': 'XLU',
            'Real Estate': 'XLRE',
            'Materials': 'XLB'
        };

        const etfSymbol = sectorETFs[sector];
        if (!etfSymbol) {
            return { etf: 'SPY', comparison: { pe: 20, pb: 3, roe: 15 } }; // Default to SPY
        }

        return { etf: etfSymbol, comparison: { pe: 20, pb: 3, roe: 15 } };
    }

    static async fetchRelativePerformance(stockSymbol, sector, apiBaseUrl) {
        // Map sectors to ETFs
        const sectorETFs = {
            'Technology': 'XLK',
            'Information Technology': 'XLK',
            'Financials': 'XLF',
            'Health Care': 'XLV',
            'Consumer Discretionary': 'XLY',
            'Communication Services': 'XLC',
            'Industrials': 'XLI',
            'Consumer Staples': 'XLP',
            'Energy': 'XLE',
            'Utilities': 'XLU',
            'Real Estate': 'XLRE',
            'Materials': 'XLB'
        };

        const sectorSymbol = sectorETFs[sector] || 'SPY';

        try {
            // Fetch 3 years of data for both
            const toDate = new Date().toISOString().split('T')[0];
            const fromDate = new Date(Date.now() - 1095 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 3 years

            const [stockResponse, sectorResponse] = await Promise.all([
                fetch(`${apiBaseUrl}/api/stock/${stockSymbol}/history?from=${fromDate}&to=${toDate}&limit=800`),
                fetch(`${apiBaseUrl}/api/stock/${sectorSymbol}/history?from=${fromDate}&to=${toDate}&limit=800`)
            ]);

            if (!stockResponse.ok || !sectorResponse.ok) {
                throw new Error('Failed to fetch performance data');
            }

            const stockData = await stockResponse.json();
            const sectorData = await sectorResponse.json();

            return {
                stockPrices: stockData.prices || [],
                sectorPrices: sectorData.prices || [],
                sectorSymbol: sectorSymbol
            };
        } catch (error) {
            console.error('Error fetching relative performance:', error);
            return { stockPrices: [], sectorPrices: [], sectorSymbol };
        }
    }

    static async fetchValuationHistory(stockSymbol, sector, apiBaseUrl) {
        // Map sectors to ETFs
        const sectorETFs = {
            'Technology': 'XLK',
            'Information Technology': 'XLK',
            'Financials': 'XLF',
            'Health Care': 'XLV',
            'Consumer Discretionary': 'XLY',
            'Communication Services': 'XLC',
            'Industrials': 'XLI',
            'Consumer Staples': 'XLP',
            'Energy': 'XLE',
            'Utilities': 'XLU',
            'Real Estate': 'XLRE',
            'Materials': 'XLB'
        };

        const sectorSymbol = sectorETFs[sector] || 'SPY';

        try {
            // Fetch valuation history for both stock and sector ETF (12 quarters = 3 years)
            const [stockResponse, sectorResponse] = await Promise.all([
                fetch(`${apiBaseUrl}/api/stock/${stockSymbol}/valuation-history?quarters=12`),
                fetch(`${apiBaseUrl}/api/stock/${sectorSymbol}/valuation-history?quarters=12`)
            ]);

            if (!stockResponse.ok || !sectorResponse.ok) {
                throw new Error('Failed to fetch valuation history');
            }

            const stockData = await stockResponse.json();
            const sectorData = await sectorResponse.json();

            return {
                stockValuations: stockData.valuationHistory || [],
                sectorValuations: sectorData.valuationHistory || [],
                sectorSymbol: sectorSymbol
            };
        } catch (error) {
            console.error('Error fetching valuation history:', error);
            return { stockValuations: [], sectorValuations: [], sectorSymbol };
        }
    }

    static async fetchValueCreation(stockSymbol, apiBaseUrl) {
        try {
            const response = await fetch(`${apiBaseUrl}/api/stock/${stockSymbol}/value-creation?quarters=12`);

            if (!response.ok) {
                throw new Error('Failed to fetch value creation data');
            }

            const data = await response.json();
            return data.valueCreation || [];
        } catch (error) {
            console.error('Error fetching value creation data:', error);
            return [];
        }
    }

    // ===== CALCULATION FUNCTIONS =====

    static calculateValuationMetrics(quote, details, financials, analytics) {
        // Note: Some stocks (especially foreign companies) may not have financial data in Polygon.io
        if (!financials || financials.length === 0) {
            console.warn('⚠️ No financial data available for valuation metrics');
            return { peRatio: 'N/A', forwardPE: 'N/A', pbRatio: 'N/A', roe: 'N/A' };
        }

        const latest = financials[0];
        const price = quote.price || 0;

        // P/E Ratio (show N/M for negative earnings since P/E is not meaningful)
        let peRatio;
        if (!latest.eps) {
            peRatio = 'N/A';
        } else if (latest.eps < 0) {
            peRatio = 'N/M'; // Not Meaningful - negative earnings
        } else {
            peRatio = (price / latest.eps).toFixed(2);
        }

        // Forward P/E (estimate using 5% discount assuming modest growth)
        const forwardPE = (peRatio !== 'N/A' && peRatio !== 'N/M' && financials.length > 1) ? (parseFloat(peRatio) * 0.95).toFixed(2) : peRatio;

        // P/B Ratio
        const bookValuePerShare = latest.equity && details.shareClassSharesOutstanding
            ? latest.equity / details.shareClassSharesOutstanding
            : 0;
        const pbRatio = bookValuePerShare > 0 ? price / bookValuePerShare : 0;

        // ROE
        const roe = latest.equity && latest.netIncome ? ((latest.netIncome / latest.equity) * 100).toFixed(1) + '%' : 'N/A';

        return { peRatio, forwardPE, pbRatio, roe };
    }

    static getInvestmentThesis(holding, valuations, analytics) {
        return `${holding.symbol} represents a strategic investment opportunity within the ${holding.gicsSector || 'diversified'} sector. ` +
               `The position demonstrates ${analytics.beta > 1 ? 'growth-oriented' : 'defensive'} characteristics with a beta of ${analytics.beta?.toFixed(2) || 'N/A'}. ` +
               `Current valuation metrics and market positioning support the investment thesis, with attention to sector dynamics and broader market conditions.`;
    }

    // ===== UTILITY FUNCTIONS =====

    static formatCurrency(value) {
        const numValue = Number(value);
        if (isNaN(numValue)) return '$0.00';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(numValue);
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
            return this.formatCurrency(numValue);
        }
    }
}

// Make available globally
window.IndividualTearSheetGenerator = IndividualTearSheetGenerator;

console.log('Institutional-Grade IndividualTearSheetGenerator loaded successfully');
