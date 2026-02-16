/**
 * val-csv-export.js
 * Shared CSV generation and download utility for the UCSB DIG Valuation Analysis Lab.
 * Loaded via <script> tag in valuation.html -- all functions are globally accessible.
 */

// ---------------------------------------------------------------------------
// Global store for each model's most recent analysis data
// ---------------------------------------------------------------------------
if (!window._lastAnalysisData) {
    window._lastAnalysisData = {};
}

// ---------------------------------------------------------------------------
// storeAnalysisData(modelId, data)
//   Saves a standardized analysis-data object so it can be exported later.
// ---------------------------------------------------------------------------
function storeAnalysisData(modelId, data) {
    if (!window._lastAnalysisData) {
        window._lastAnalysisData = {};
    }
    window._lastAnalysisData[modelId] = data;
}

// ---------------------------------------------------------------------------
// escapeCSVValue(value)
//   Properly escapes a single cell value for CSV:
//     - Converts to string
//     - If the value contains a comma, double-quote, or newline it is wrapped
//       in double-quotes with internal double-quotes doubled.
// ---------------------------------------------------------------------------
function escapeCSVValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    var str = String(value);
    // If the value contains any special characters, quote it
    if (str.indexOf('"') !== -1 || str.indexOf(',') !== -1 ||
        str.indexOf('\n') !== -1 || str.indexOf('\r') !== -1) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// ---------------------------------------------------------------------------
// buildCSVRow(cells)
//   Accepts an array of cell values and returns a single CSV line (no
//   trailing newline).
// ---------------------------------------------------------------------------
function buildCSVRow(cells) {
    return cells.map(escapeCSVValue).join(',');
}

// ---------------------------------------------------------------------------
// generateAnalysisCSV(analysisData)
//   Takes a standardized analysis-data object and returns a complete CSV
//   string ready for download.
//
//   analysisData shape:
//   {
//     modelName:  string,          e.g. 'DCF Valuation'
//     firmStyle:  string,          e.g. 'Morgan Stanley'
//     runDate:    ISO string,
//     ticker:     string,          e.g. 'AAPL' or 'PORTFOLIO'
//     sections: [
//       { title, type:'metrics', rows:[{ label, value, formatted, formula }] },
//       { title, type:'table',   headers:[...], rows:[[...], ...] },
//       { title, type:'matrix',  headers:[...], rows:[[...], ...] }
//     ]
//   }
// ---------------------------------------------------------------------------
function generateAnalysisCSV(analysisData) {
    var lines = [];

    // ------------------------------------------------------------------
    // Metadata header rows
    // ------------------------------------------------------------------
    lines.push(buildCSVRow(['Model', analysisData.modelName || '']));
    lines.push(buildCSVRow(['Style', analysisData.firmStyle || '']));

    var dateStr = '';
    if (analysisData.runDate) {
        try {
            var d = new Date(analysisData.runDate);
            dateStr = d.toLocaleString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
            });
        } catch (e) {
            dateStr = analysisData.runDate;
        }
    }
    lines.push(buildCSVRow(['Date', dateStr]));
    lines.push(buildCSVRow(['Ticker', analysisData.ticker || '']));

    // Blank separator after metadata
    lines.push('');

    // ------------------------------------------------------------------
    // Sections
    // ------------------------------------------------------------------
    var sections = analysisData.sections || [];
    for (var i = 0; i < sections.length; i++) {
        var section = sections[i];

        // Section header
        lines.push(buildCSVRow(['=== ' + (section.title || 'Section') + ' ===']));

        if (section.type === 'metrics') {
            // Column headers for metrics
            lines.push(buildCSVRow(['Metric', 'Value', 'Formula / Source']));

            var rows = section.rows || [];
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                var displayValue = row.formatted !== undefined && row.formatted !== null
                    ? row.formatted
                    : (row.value !== undefined && row.value !== null ? row.value : '');
                lines.push(buildCSVRow([
                    row.label || '',
                    displayValue,
                    row.formula || ''
                ]));
            }

        } else if (section.type === 'table' || section.type === 'matrix') {
            // Headers
            if (section.headers && section.headers.length > 0) {
                lines.push(buildCSVRow(section.headers));
            }

            // Data rows
            var dataRows = section.rows || [];
            for (var r = 0; r < dataRows.length; r++) {
                lines.push(buildCSVRow(dataRows[r]));
            }
        }

        // Blank row between sections (but not after the last one)
        if (i < sections.length - 1) {
            lines.push('');
        }
    }

    // ------------------------------------------------------------------
    // Methodology note at the bottom
    // ------------------------------------------------------------------
    lines.push('');
    lines.push('');
    lines.push(buildCSVRow([
        'This analysis was generated by UCSB DIG Valuation Analysis Lab. ' +
        'All computations are performed client-side using live market data from Polygon.io. ' +
        'Results should be independently verified.'
    ]));

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// downloadCSV(csvString, filename)
//   Creates a Blob from the CSV string and triggers a browser download.
// ---------------------------------------------------------------------------
function downloadCSV(csvString, filename) {
    // Add BOM for Excel UTF-8 compatibility
    var bom = '\uFEFF';
    var blob = new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);

    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename || 'analysis.csv');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // Clean up
    document.body.removeChild(link);
    setTimeout(function () {
        URL.revokeObjectURL(url);
    }, 100);
}

// ---------------------------------------------------------------------------
// MODEL ID  ->  DISPLAY NAME  mapping
// ---------------------------------------------------------------------------
var _modelDisplayNames = {
    dcf:        'DCF Valuation',
    risk:       'Risk Analysis',
    comps:      'Comparable Companies',
    technical:  'Technical Analysis',
    dividend:   'Dividend Model',
    factor:     'Factor Analysis',
    esg:        'ESG Analysis',
    earnings:   'Earnings Quality',
    capital:    'Capital Allocation',
    macro:      'Macro Analysis'
};

// ---------------------------------------------------------------------------
// downloadModelCSV(modelId)
//   Dispatcher -- retrieves stored analysis data for a given model and
//   triggers a CSV download.  Each model should call storeAnalysisData()
//   after running its analysis so the data is available here.
//
//   Supported modelId values:
//     'dcf', 'risk', 'comps', 'technical', 'dividend',
//     'factor', 'esg', 'earnings', 'capital', 'macro'
// ---------------------------------------------------------------------------
function downloadModelCSV(modelId) {
    var data = window._lastAnalysisData && window._lastAnalysisData[modelId];

    if (!data) {
        alert('No analysis data available for ' +
            (_modelDisplayNames[modelId] || modelId) +
            '. Please run the analysis first.');
        return;
    }

    // If the model stored a buildCSVData function, call it to get
    // a freshly-assembled analysisData object; otherwise assume the
    // stored data is already in the standard analysisData format.
    var analysisData;
    if (typeof data.buildCSVData === 'function') {
        analysisData = data.buildCSVData();
    } else {
        analysisData = data;
    }

    var csv = generateAnalysisCSV(analysisData);

    // Build a descriptive filename
    var ticker = (analysisData.ticker || 'analysis').toUpperCase();
    var modelSlug = modelId.toLowerCase();
    var dateSlug = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    var filename = 'DIG_' + ticker + '_' + modelSlug + '_' + dateSlug + '.csv';

    downloadCSV(csv, filename);
}
