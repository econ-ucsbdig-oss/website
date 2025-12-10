/**
 * Individual Stock Tear Sheet Generator for UCSB DIG Portfolio
 * Generates a single-page PDF analysis for individual holdings
 */

class IndividualTearSheetGenerator {
    static async generate(holding) {
        try {
            // Validate input
            if (!holding) {
                throw new Error('No holding data provided');
            }
            
            if (!holding.symbol) {
                throw new Error('Holding must have a symbol');
            }
            
            console.log('Generating tear sheet for:', holding.symbol);
            console.log('Holding data:', JSON.stringify(holding, null, 2));
            
            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                throw new Error('jsPDF library not loaded');
            }

            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });

            // Get market data with fallbacks
            const quantity = parseFloat(holding.quantity) || 0;
            const lastPrice = parseFloat(holding.lastPrice) || 0;
            const marketValue = quantity * lastPrice;
            const dayChange = parseFloat(holding.change) || 0;
            const dayChangePercent = parseFloat(holding.changePercent) || 0;
            const positionPL = dayChange * quantity;

            // Colors
            const digBlue = [0, 54, 96];
            const digGold = [254, 188, 17];
            const darkGray = [60, 60, 60];
            const lightGray = [150, 150, 150];

            // ===== HEADER =====
            // DIG Logo (top right)
            console.log('Drawing header...');
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...digBlue);
            doc.text('DIG', 270, 15);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text('UCSB Dean\'s Investment Group', 256, 20);

            // Company Name and Ticker (top left)
            console.log('Drawing company info...');
            doc.setFontSize(24);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkGray);
            const companyName = (holding.description || holding.symbol || 'Unknown').split(' ').slice(0, 4).join(' ');
            console.log('Company name:', companyName);
            doc.text(companyName, 15, 20);

            doc.setFontSize(16);
            doc.setTextColor(...lightGray);
            console.log('Drawing ticker and sector...');
            doc.text(`Ticker: ${holding.symbol || 'N/A'}`, 15, 30);
            doc.text(`Sector: ${holding.gicsSector || 'Unknown'}`, 100, 30);

                // Tagline
                doc.setFontSize(10);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(...darkGray);
                const tagline = IndividualTearSheetGenerator.getTagline(holding);
                console.log('Drawing tagline:', tagline);
                doc.text(tagline, 15, 40);

                // ===== LEFT COLUMN: METRICS & ACTIVITY =====
                let leftY = 55;

                // Market Cap box
                console.log('Drawing market cap box...');
                doc.setDrawColor(...lightGray);
                doc.setLineWidth(0.5);
                doc.rect(15, leftY, 60, 30);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...darkGray);
                doc.text('Market Cap:', 18, leftY + 8);
                doc.text('52 week h/l:', 18, leftY + 16);
                doc.text('EPS:', 18, leftY + 24);

                doc.setFont('helvetica', 'normal');
                doc.text('$862.30B', 50, leftY + 8);
                doc.text('$202.45-322.24', 50, leftY + 16);
                doc.text('20.23', 50, leftY + 24);

                leftY += 35;

            // DIG Investment Activity
            console.log('Drawing investment activity...');
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...digBlue);
            doc.text('DIG Investment Activity', 15, leftY);
            doc.setLineWidth(1.5);
            doc.line(15, leftY + 2, 67, leftY + 2);

            leftY += 8;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...darkGray);
            const purchaseDate = '03/04/25';
            const purchasePrice = lastPrice * 0.8; // Approximate
            const purchaseValue = purchasePrice * quantity;
            const purchaseLine = `${purchaseDate}: Purchase of ~${IndividualTearSheetGenerator.formatCurrency(purchaseValue)} at ${IndividualTearSheetGenerator.formatCurrency(purchasePrice)} a share`;
            console.log('Purchase line:', purchaseLine);
            // Split long text into multiple lines if needed
            const maxWidth = 60;
            const splitText = doc.splitTextToSize(purchaseLine, maxWidth);
            console.log('Split text:', splitText);
            doc.text(splitText, 15, leftY);
            console.log('Purchase line drawn successfully');

            leftY += 12;

            // Portfolio Composition
            console.log('Drawing portfolio composition...');
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...digBlue);
            doc.text('Portfolio Composition', 15, leftY);
            doc.setLineWidth(1.5);
            doc.line(15, leftY + 2, 67, leftY + 2);
            console.log('Portfolio composition title drawn');

            leftY += 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(...darkGray);
            const quantityText = Math.floor(quantity).toString();
            console.log('Drawing quantity:', quantityText);
            doc.text(quantityText, 15, leftY);
            console.log('Quantity drawn');
            
            doc.setFont('helvetica', 'normal');
            const sharesLine = `Shares purchased at ${IndividualTearSheetGenerator.formatCurrency(purchasePrice)} (~${IndividualTearSheetGenerator.formatCurrency(purchaseValue)})`;
            console.log('Drawing shares line:', sharesLine);
            doc.text(sharesLine, 25, leftY);
            console.log('Shares line drawn');

            leftY += 8;
            doc.setFont('helvetica', 'normal');
            const totalValueLine = `Total Current Value: ${IndividualTearSheetGenerator.formatCurrency(marketValue)}`;
            console.log('Drawing total value line:', totalValueLine);
            doc.text(totalValueLine, 15, leftY);
            console.log('Total value line drawn');

            leftY += 8;
            console.log('About to calculate gain percent. purchasePrice:', purchasePrice, 'lastPrice:', lastPrice);
            const gainPercent = purchasePrice > 0 ? ((lastPrice - purchasePrice) / purchasePrice * 100) : 0;
            console.log('Calculated gain percent:', gainPercent);
            const gainColor = gainPercent >= 0 ? [0, 128, 0] : [220, 53, 69];
            console.log('Setting gain color:', gainColor);
            doc.setTextColor(...gainColor);
            console.log('Color set successfully');
            const gainLine = `${gainPercent.toFixed(2)}% gain since purchase`;
            console.log('Drawing gain line:', gainLine);
            doc.text(gainLine, 15, leftY);
            console.log('Gain line drawn');

            // ===== RIGHT COLUMN: CHART & FINANCIALS =====
            const chartX = 90;
            const chartY = 55;
            const chartWidth = 190;
            const chartHeight = 80;

            // Stock Price Performance Chart
            doc.setDrawColor(...lightGray);
            doc.setLineWidth(0.5);
            doc.rect(chartX, chartY, chartWidth, chartHeight);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkGray);
            doc.text('Stock Price Performance', chartX + 5, chartY - 3);

            // Legend
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...lightGray);
            doc.text(`${holding.symbol}`, chartX + 90, chartY - 3);
            doc.text('VOO (S&P 500 ETF)', chartX + 110, chartY - 3);
            doc.text('USD | NYSE | End of Date as of Dec 4, 2025', chartX + 145, chartY - 3);

            // Simulate chart with lines
            doc.setDrawColor(66, 133, 244); // Blue for stock
            doc.setLineWidth(1);
            // Upward trending line for stock
            doc.line(chartX + 10, chartY + 60, chartX + 50, chartY + 40, 'S');
            doc.line(chartX + 50, chartY + 40, chartX + 90, chartY + 55, 'S');
            doc.line(chartX + 90, chartY + 55, chartX + 130, chartY + 30, 'S');
            doc.line(chartX + 130, chartY + 30, chartX + 170, chartY + 25, 'S');

            doc.setDrawColor(220, 53, 69); // Red for benchmark
            doc.setLineWidth(0.8);
            // Moderate line for benchmark
            doc.line(chartX + 10, chartY + 60, chartX + 50, chartY + 50, 'S');
            doc.line(chartX + 50, chartY + 50, chartX + 90, chartY + 48, 'S');
            doc.line(chartX + 90, chartY + 48, chartX + 130, chartY + 42, 'S');
            doc.line(chartX + 130, chartY + 42, chartX + 170, chartY + 40, 'S');

            // Y-axis labels
            doc.setFontSize(6);
            doc.setTextColor(...lightGray);
            doc.text('45.00', chartX + 2, chartY + 10);
            doc.text('30.00', chartX + 2, chartY + 25);
            doc.text('15.00', chartX + 2, chartY + 40);
            doc.text('0.00', chartX + 2, chartY + 55);
            doc.text('-15.00', chartX + 2, chartY + 70);

            // X-axis labels (months)
            doc.text('Jan', chartX + 10, chartY + 78);
            doc.text('Feb', chartX + 40, chartY + 78);
            doc.text('Mar', chartX + 70, chartY + 78);
            doc.text('Apr', chartX + 100, chartY + 78);
            doc.text('May', chartX + 130, chartY + 78);
            doc.text('Jun', chartX + 155, chartY + 78);

            // Financial Performance Table
            const tableY = chartY + chartHeight + 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkGray);
            doc.text('Financial Performance', chartX + 5, tableY);

            // Table header
            const tableStartY = tableY + 8;
            doc.setFillColor(240, 240, 240);
            doc.rect(chartX, tableStartY, chartWidth, 8, 'F');

            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(...lightGray);
            doc.text('(in Millions $ USD except EPS)', chartX + 5, tableStartY + 5);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkGray);
            doc.text('Q3 2025', chartX + 120, tableStartY + 5);
            doc.text('FY 2024', chartX + 155, tableStartY + 5);
            doc.text('FY 2023', chartX + 190, tableStartY + 5);

            // Table rows
            const rows = [
                { label: 'Revenue', q3: '178,842', fy24: '169,439', fy23: '154,952' },
                { label: '% Growth', q3: '8.23%', fy24: '9.35%', fy23: '21.32%' },
                { label: 'Pre-Tax Income', q3: '72,810', fy24: '75,081', fy23: '61,612' },
                { label: '% Margin', q3: '40.71%', fy24: '44.31%', fy23: '39.76%' },
                { label: 'Net Income', q3: '56,660', fy24: '56,870', fy23: '47,760' },
                { label: '% Margin', q3: '31.68%', fy24: '33.56%', fy23: '30.82%' },
                { label: 'EPS', q3: '20.23', fy24: '19.79', fy23: '16.25' }
            ];

            let rowY = tableStartY + 8;
            doc.setFont('helvetica', 'normal');
            rows.forEach((row, idx) => {
                // Alternate row colors
                if (idx % 2 === 0) {
                    doc.setFillColor(250, 250, 250);
                    doc.rect(chartX, rowY, chartWidth, 6, 'F');
                }

                doc.setFontSize(8);
                doc.setTextColor(...darkGray);

                // Bold for main metrics
                if (['Revenue', 'Pre-Tax Income', 'Net Income', 'EPS'].includes(row.label)) {
                    doc.setFont('helvetica', 'bold');
                } else {
                    doc.setFont('helvetica', 'italic');
                    doc.setTextColor(...lightGray);
                }

                doc.text(String(row.label), chartX + 5, rowY + 4);

                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...darkGray);
                doc.text(String(row.q3), chartX + 125, rowY + 4, { align: 'right' });
                doc.text(String(row.fy24), chartX + 165, rowY + 4, { align: 'right' });
                doc.text(String(row.fy23), chartX + 205, rowY + 4, { align: 'right' });

                rowY += 6;
            });

            // Save the PDF
            const fileName = `DIG_${holding.symbol}_TearSheet_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);

            return fileName;
        } catch (error) {
            console.error('Error generating tear sheet:', error);
            throw error;
        }
    }

    static formatCurrency(value) {
        // Ensure value is a valid number
        const numValue = Number(value);
        if (isNaN(numValue)) {
            return '$0.00';
        }
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(numValue);
    }

    static getTagline(holding) {
        const taglines = {
            'Financials': 'A leading bank with exceptional leadership and market position.',
            'Information Technology': 'Leading technology innovator driving digital transformation.',
            'Health Care': 'Healthcare leader improving patient outcomes through innovation.',
            'Consumer Discretionary': 'Consumer brand leader with strong market position.',
            'Consumer Staples': 'Essential consumer goods provider with stable demand.',
            'Communication Services': 'Communications leader in the digital age.',
            'Industrials': 'Industrial leader driving infrastructure development.',
            'Materials': 'Materials provider supporting global economic growth.',
            'Energy': 'Energy leader in transition and infrastructure.',
            'Utilities': 'Utility provider with stable returns and essential services.',
            'Real Estate': 'Real estate leader with diversified portfolio.'
        };
        return taglines[holding.gicsSector] || 'A leading company in its sector with strong fundamentals.';
    }
}

// Make available globally
window.IndividualTearSheetGenerator = IndividualTearSheetGenerator;

// Log successful loading
console.log('IndividualTearSheetGenerator loaded successfully');
