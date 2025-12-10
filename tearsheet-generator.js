/**
 * Enhanced Tear Sheet Generator for UCSB DIG Portfolio
 * Generates comprehensive PDF reports with charts, tables, and analysis
 */

class TearSheetGenerator {
    /**
     * Generate the complete tear sheet PDF
     */
    static async generate(portfolioData, config = {}) {
        const defaultConfig = {
            companyName: 'UCSB Dean\'s Investment Group',
            logo: 'DIG',
            contactInfo: 'University of California, Santa Barbara',
            disclaimer: 'This report is for informational purposes only and does not constitute investment advice. Past performance does not guarantee future results.',
            includeCharts: true,
            includeDetailedHoldings: true,
            includeSectorAnalysis: true,
            includeRiskMetrics: false,
            ...config
        };

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Calculate portfolio statistics
        const stats = TearSheetGenerator.calculatePortfolioStats(portfolioData);

        // Generate PDF pages
        TearSheetGenerator.addHeaderPage(doc, stats, defaultConfig);
        TearSheetGenerator.addPortfolioSummary(doc, stats, defaultConfig);
        TearSheetGenerator.addHoldingsTable(doc, stats, portfolioData, defaultConfig);
        TearSheetGenerator.addSectorAnalysis(doc, stats, portfolioData, defaultConfig);
        TearSheetGenerator.addPerformanceMetrics(doc, stats, portfolioData, defaultConfig);
        TearSheetGenerator.addFooter(doc, defaultConfig);

        // Generate filename and save
        const fileName = `DIG_Portfolio_TearSheet_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);

        return fileName;
    }

    /**
     * Calculate comprehensive portfolio statistics
     */
    static calculatePortfolioStats(portfolioData) {
        const totalValue = portfolioData.reduce((sum, holding) => {
            return sum + (holding.quantity * holding.lastPrice);
        }, 0);

        const totalDayChange = portfolioData.reduce((sum, holding) => {
            return sum + (holding.change ? holding.quantity * holding.change : 0);
        }, 0);

        const dayChangePercent = (totalDayChange / (totalValue - totalDayChange)) * 100;

        // Sector allocations
        const sectorData = {};
        portfolioData.forEach(holding => {
            const marketValue = holding.quantity * holding.lastPrice;
            if (sectorData[holding.sector]) {
                sectorData[holding.sector] += marketValue;
            } else {
                sectorData[holding.sector] = marketValue;
            }
        });

        // Top holdings
        const topHoldings = [...portfolioData]
            .sort((a, b) => (b.quantity * b.lastPrice) - (a.quantity * a.lastPrice))
            .slice(0, 10);

        // Risk metrics (simplified)
        const positions = portfolioData.map(h => (h.quantity * h.lastPrice) / totalValue);
        const concentration = Math.max(...positions) * 100; // Largest position %

        return {
            totalValue,
            totalDayChange,
            dayChangePercent,
            numberOfHoldings: portfolioData.length,
            sectorData,
            topHoldings,
            concentration,
            averagePositionSize: totalValue / portfolioData.length,
            generatedAt: new Date()
        };
    }

    /**
     * Add header page with title and key metrics
     */
    static addHeaderPage(doc, stats, config) {
        // Header background
        doc.setFillColor(0, 54, 96);
        doc.rect(0, 0, 210, 50, 'F');

        // Logo and title
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(28);
        doc.text(config.logo, 20, 30);

        doc.setFontSize(18);
        doc.text(config.companyName, 50, 25);
        doc.setFontSize(14);
        doc.text('Portfolio Analysis & Holdings Report', 50, 35);

        // Date and status
        doc.setFontSize(10);
        doc.text(`Report Date: ${stats.generatedAt.toLocaleDateString()}`, 20, 60);
        doc.text(`Report Time: ${stats.generatedAt.toLocaleTimeString()}`, 20, 68);

        // Key metrics boxes
        TearSheetGenerator.addMetricBox(doc, 20, 85, 'Total Portfolio Value', TearSheetGenerator.formatCurrency(stats.totalValue));
        TearSheetGenerator.addMetricBox(doc, 75, 85, 'Day Change',
            `${TearSheetGenerator.formatCurrency(stats.totalDayChange)} (${stats.dayChangePercent >= 0 ? '+' : ''}${stats.dayChangePercent.toFixed(2)}%)`);
        TearSheetGenerator.addMetricBox(doc, 130, 85, 'Number of Holdings', stats.numberOfHoldings.toString());

        // Performance summary
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.text('Portfolio Highlights', 20, 130);

        doc.setFontSize(10);
        doc.text(`• Largest Position: ${stats.topHoldings[0].symbol} (${stats.concentration.toFixed(1)}%)`, 25, 145);
        doc.text(`• Average Position Size: ${TearSheetGenerator.formatCurrency(stats.averagePositionSize)}`, 25, 155);
        doc.text(`• Most Allocated Sector: ${TearSheetGenerator.getLargestSector(stats.sectorData)}`, 25, 165);
        doc.text(`• Portfolio Concentration: ${stats.concentration.toFixed(1)}% in top position`, 25, 175);

        doc.addPage();
    }

    /**
     * Add portfolio summary with allocation breakdown
     */
    static addPortfolioSummary(doc, stats, config) {
        doc.setFontSize(16);
        doc.setTextColor(0, 54, 96);
        doc.text('Portfolio Summary', 20, 30);

        // Sector allocation table
        doc.setFontSize(12);
        doc.text('Sector Allocation', 20, 50);

        let y = 65;
        doc.setFontSize(9);
        doc.text('Sector', 25, y);
        doc.text('Value', 80, y);
        doc.text('% of Portfolio', 130, y);
        
        y += 5;
        doc.line(25, y, 170, y); // Header line
        y += 10;

        // Sort sectors by value
        const sortedSectors = Object.entries(stats.sectorData)
            .sort(([,a], [,b]) => b - a);

        sortedSectors.forEach(([sector, value]) => {
            const percentage = (value / stats.totalValue) * 100;
            doc.text(sector, 25, y);
            doc.text(TearSheetGenerator.formatCurrency(value), 80, y);
            doc.text(`${percentage.toFixed(1)}%`, 130, y);
            y += 12;
        });

        // Risk metrics
        doc.setFontSize(12);
        doc.text('Risk Analysis', 20, y + 20);
        
        doc.setFontSize(9);
        y += 35;
        doc.text(`Portfolio Concentration: ${stats.concentration.toFixed(1)}% (Single largest position)`, 25, y);
        y += 12;
        doc.text(`Number of Sectors: ${Object.keys(stats.sectorData).length}`, 25, y);
        y += 12;
        doc.text(`Diversification Score: ${TearSheetGenerator.calculateDiversificationScore(stats)}`, 25, y);

        doc.addPage();
    }

    /**
     * Add detailed holdings table
     */
    static addHoldingsTable(doc, stats, portfolioData, config) {
        doc.setFontSize(16);
        doc.setTextColor(0, 54, 96);
        doc.text('Detailed Holdings', 20, 30);

        // Table headers
        let y = 50;
        doc.setFontSize(8);
        doc.text('Symbol', 20, y);
        doc.text('Description', 40, y);
        doc.text('Qty', 100, y);
        doc.text('Price', 120, y);
        doc.text('Market Value', 140, y);
        doc.text('% Port', 170, y);
        doc.text('Day Chg', 185, y);

        y += 5;
        doc.line(20, y, 200, y); // Header line
        y += 10;

        // Sort holdings by market value
        const sortedHoldings = [...portfolioData]
            .sort((a, b) => (b.quantity * b.lastPrice) - (a.quantity * a.lastPrice));

        sortedHoldings.forEach(holding => {
            if (y > 270) { // Check if we need a new page
                doc.addPage();
                y = 30;
                // Re-add headers
                doc.setFontSize(8);
                doc.text('Symbol', 20, y);
                doc.text('Description', 40, y);
                doc.text('Qty', 100, y);
                doc.text('Price', 120, y);
                doc.text('Market Value', 140, y);
                doc.text('% Port', 170, y);
                doc.text('Day Chg', 185, y);
                y += 5;
                doc.line(20, y, 200, y);
                y += 10;
            }

            const marketValue = holding.quantity * holding.lastPrice;
            const percentage = (marketValue / stats.totalValue) * 100;
            const dayChange = holding.change ? holding.change : 0;

            doc.text(holding.symbol, 20, y);
            doc.text(TearSheetGenerator.truncateText(holding.description, 25), 40, y);
            doc.text(holding.quantity.toFixed(1), 100, y);
            doc.text(`$${holding.lastPrice.toFixed(2)}`, 120, y);
            doc.text(TearSheetGenerator.formatCurrency(marketValue), 140, y);
            doc.text(`${percentage.toFixed(1)}%`, 170, y);
            
            // Color code day change
            if (dayChange > 0) {
                doc.setTextColor(0, 128, 0); // Green for positive
            } else if (dayChange < 0) {
                doc.setTextColor(220, 53, 69); // Red for negative
            }
            doc.text(`${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)}%`, 185, y);
            doc.setTextColor(0, 0, 0); // Reset to black

            y += 10;
        });

        doc.addPage();
    }

    /**
     * Add sector analysis page
     */
    static addSectorAnalysis(doc, stats, portfolioData, config) {
        doc.setFontSize(16);
        doc.setTextColor(0, 54, 96);
        doc.text('Sector Analysis', 20, 30);

        // Sector performance table
        doc.setFontSize(12);
        doc.text('Sector Performance Breakdown', 20, 50);

        let y = 70;
        doc.setFontSize(9);
        
        Object.entries(stats.sectorData).forEach(([sector, value]) => {
            const percentage = (value / stats.totalValue) * 100;
            const holdingsInSector = portfolioData.filter(h => h.sector === sector);
            const avgReturn = holdingsInSector.reduce((sum, h) => sum + (h.changePercent || 0), 0) / holdingsInSector.length;
            
            doc.text(`${sector}:`, 25, y);
            doc.text(`${percentage.toFixed(1)}% allocation`, 80, y);
            doc.text(`${holdingsInSector.length} holdings`, 130, y);
            doc.text(`Avg: ${avgReturn.toFixed(2)}%`, 170, y);
            y += 15;
        });

        // Strategic allocation commentary
        y += 20;
        doc.setFontSize(12);
        doc.text('Portfolio Strategy Notes', 20, y);
        
        doc.setFontSize(9);
        y += 15;
        doc.text('• This portfolio follows a diversified approach across multiple sectors', 25, y);
        y += 12;
        doc.text('• Technology allocation reflects growth-focused investment strategy', 25, y);
        y += 12;
        doc.text('• Broad market ETF holdings provide core stability and market exposure', 25, y);
        y += 12;
        doc.text('• Position sizing demonstrates risk management and diversification principles', 25, y);

        doc.addPage();
    }

    /**
     * Add performance metrics and analysis
     */
    static addPerformanceMetrics(doc, stats, portfolioData, config) {
        doc.setFontSize(16);
        doc.setTextColor(0, 54, 96);
        doc.text('Performance & Risk Metrics', 20, 30);

        // Top performers section
        doc.setFontSize(12);
        doc.text('Top Holdings by Market Value', 20, 50);

        let y = 65;
        doc.setFontSize(9);
        stats.topHoldings.slice(0, 5).forEach((holding, index) => {
            const marketValue = holding.quantity * holding.lastPrice;
            const percentage = (marketValue / stats.totalValue) * 100;
            
            doc.text(`${index + 1}. ${holding.symbol}:`, 25, y);
            doc.text(`${TearSheetGenerator.formatCurrency(marketValue)} (${percentage.toFixed(1)}%)`, 80, y);
            y += 12;
        });

        // Portfolio composition analysis
        y += 20;
        doc.setFontSize(12);
        doc.text('Portfolio Composition Analysis', 20, y);
        
        y += 15;
        doc.setFontSize(9);
        
        const etfCount = portfolioData.filter(h => h.symbol.includes('ETF') || ['VOO', 'SPY', 'VTV', 'IHI', 'NUKZ'].includes(h.symbol)).length;
        const stockCount = portfolioData.length - etfCount;
        
        doc.text(`Individual Stocks: ${stockCount} positions`, 25, y);
        y += 12;
        doc.text(`ETF Holdings: ${etfCount} positions`, 25, y);
        y += 12;
        doc.text(`Average Position Size: ${TearSheetGenerator.formatCurrency(stats.averagePositionSize)}`, 25, y);
        y += 12;
        doc.text(`Largest Position Weight: ${stats.concentration.toFixed(1)}%`, 25, y);

        // Risk assessment
        y += 25;
        doc.setFontSize(12);
        doc.text('Risk Assessment Summary', 20, y);
        
        y += 15;
        doc.setFontSize(9);
        const riskLevel = TearSheetGenerator.assessRiskLevel(stats);
        doc.text(`Overall Risk Level: ${riskLevel}`, 25, y);
        y += 12;
        doc.text(`Sector Diversification: ${Object.keys(stats.sectorData).length} sectors`, 25, y);
        y += 12;
        doc.text(`Concentration Risk: ${stats.concentration > 20 ? 'Moderate' : 'Low'} (Top position: ${stats.concentration.toFixed(1)}%)`, 25, y);
    }

    /**
     * Add footer with disclaimers and contact info
     */
    static addFooter(doc, config) {
        const pageCount = doc.internal.getNumberOfPages();
        
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            
            // Footer line
            doc.line(20, 280, 190, 280);
            
            // Disclaimer
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text(config.disclaimer, 20, 288);

            // Contact and page info
            doc.text(config.contactInfo, 20, 295);
            doc.text(`Page ${i} of ${pageCount}`, 170, 295);
            doc.text(`Generated: ${new Date().toLocaleString()}`, 120, 295);
        }
    }

    /**
     * Utility methods
     */
    static addMetricBox(doc, x, y, label, value) {
        doc.setDrawColor(200);
        doc.rect(x, y, 50, 25);
        
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(label, x + 2, y + 10);
        
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(value, x + 2, y + 20);
    }

    static formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }

    static truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    static getLargestSector(sectorData) {
        return Object.entries(sectorData)
            .sort(([,a], [,b]) => b - a)[0][0];
    }

    static calculateDiversificationScore(stats) {
        // Simple diversification score based on sector count and concentration
        const sectorCount = Object.keys(stats.sectorData).length;
        const concentrationPenalty = stats.concentration / 100;
        const score = Math.min(100, (sectorCount * 10) - (concentrationPenalty * 50));
        return `${score.toFixed(0)}/100`;
    }

    static assessRiskLevel(stats) {
        if (stats.concentration > 30) return 'High';
        if (stats.concentration > 15) return 'Moderate';
        return 'Low';
    }
}

// Make available globally
window.TearSheetGenerator = TearSheetGenerator;
