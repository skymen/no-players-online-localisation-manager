/**
 * Diff Page JavaScript Module
 * Handles file uploads, conversions, and diff generation for localization files
 */

// Import required modules
import { parseCSV, generateCSV } from "./csvParser.js";
import { csvToXlsx, xlsxToCsv } from "./converter.js";
import {
  generateDiffHTML,
  getDiffStats,
  getDiffSummary,
} from "./diffModule.js";

class DiffPageManager {
  constructor() {
    this.file1 = null;
    this.file2 = null;
    this.file1Data = null;
    this.file2Data = null;
    this.comparisonResults = null;
    this.availableLanguages = new Set(["English"]);

    this.initializeElements();
    this.attachEventListeners();
  }

  initializeElements() {
    // File upload elements
    this.uploadArea1 = document.getElementById("uploadArea1");
    this.uploadArea2 = document.getElementById("uploadArea2");
    this.fileInput1 = document.getElementById("fileInput1");
    this.fileInput2 = document.getElementById("fileInput2");
    this.fileInfo1 = document.getElementById("fileInfo1");
    this.fileInfo2 = document.getElementById("fileInfo2");
    this.fileName1 = document.getElementById("fileName1");
    this.fileName2 = document.getElementById("fileName2");
    this.fileSize1 = document.getElementById("fileSize1");
    this.fileSize2 = document.getElementById("fileSize2");

    // Options elements
    this.compareLanguage = document.getElementById("compareLanguage");
    this.csvSeparator = document.getElementById("csvSeparator");
    this.comparisonOptions = document.getElementById("comparisonOptions");

    // Control elements
    this.compareBtn = document.getElementById("compareBtn");
    this.clearBtn = document.getElementById("clearBtn");

    // Status and results elements
    this.status = document.getElementById("status");
    this.resultsSection = document.getElementById("resultsSection");
    this.diffStats = document.getElementById("diffStats");
    this.diffResults = document.getElementById("diffResults");
    this.overallSummary = document.getElementById("overallSummary");

    // Stats elements
    this.addedCount = document.getElementById("addedCount");
    this.modifiedCount = document.getElementById("modifiedCount");
    this.removedCount = document.getElementById("removedCount");
    this.unchangedCount = document.getElementById("unchangedCount");
    this.newlineOnlyCount = document.getElementById("newlineOnlyCount");

    // View controls
    this.viewBtns = document.querySelectorAll(".view-btn[data-view]");

    // Export controls
    this.exportCsvBtn = document.getElementById("exportCsvBtn");
    this.exportHtmlBtn = document.getElementById("exportHtmlBtn");
  }

  attachEventListeners() {
    // File upload area clicks
    this.uploadArea1.addEventListener("click", () => this.fileInput1.click());
    this.uploadArea2.addEventListener("click", () => this.fileInput2.click());

    // File input changes
    this.fileInput1.addEventListener("change", (e) =>
      this.handleFileSelect(e, 1)
    );
    this.fileInput2.addEventListener("change", (e) =>
      this.handleFileSelect(e, 2)
    );

    // Drag and drop
    this.setupDragAndDrop(this.uploadArea1, 1);
    this.setupDragAndDrop(this.uploadArea2, 2);

    // Control buttons
    this.compareBtn.addEventListener("click", () => this.compareFiles());
    this.clearBtn.addEventListener("click", () => this.clearAll());

    // View controls
    this.viewBtns.forEach((btn) => {
      btn.addEventListener("click", (e) =>
        this.switchView(e.target.dataset.view)
      );
    });

    // Export controls
    this.exportCsvBtn.addEventListener("click", () => this.exportDiff("csv"));
    this.exportHtmlBtn.addEventListener("click", () => this.exportDiff("html"));
  }

  setupDragAndDrop(uploadArea, fileNumber) {
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.classList.add("dragover");
    });

    uploadArea.addEventListener("dragleave", () => {
      uploadArea.classList.remove("dragover");
    });

    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFile(files[0], fileNumber);
      }
    });
  }

  handleFileSelect(event, fileNumber) {
    const files = event.target.files;
    if (files.length > 0) {
      this.handleFile(files[0], fileNumber);
    }
  }

  async handleFile(file, fileNumber) {
    if (!this.isValidFile(file)) {
      this.showStatus("Please select a CSV or XLSX file", "error");
      return;
    }

    try {
      this.showStatus(`Processing ${file.name}...`, "info");

      // Store file reference
      if (fileNumber === 1) {
        this.file1 = file;
        this.fileName1.textContent = file.name;
        this.fileSize1.textContent = this.formatFileSize(file.size);
        this.fileInfo1.classList.add("show");
      } else {
        this.file2 = file;
        this.fileName2.textContent = file.name;
        this.fileSize2.textContent = this.formatFileSize(file.size);
        this.fileInfo2.classList.add("show");
      }

      // Process file
      let csvData;
      if (file.name.toLowerCase().endsWith(".csv")) {
        csvData = await this.readFileAsText(file);
      } else {
        csvData = await xlsxToCsv(file, {
          returnString: true,
          expectedHeaders: [
            "termID",
            "notes",
            "shouldBeTranslated",
            "translationNeedsToBeUpdated",
            "English",
          ],
        });
      }

      // Parse CSV data
      const separator =
        this.csvSeparator.value === "auto"
          ? null
          : this.csvSeparator.value === "\\t"
          ? "\t"
          : this.csvSeparator.value;

      const parseOptions = separator ? { delimiter: separator } : {};
      const parsedData = parseCSV(csvData, parseOptions);

      // Store parsed data
      if (fileNumber === 1) {
        this.file1Data = parsedData;
      } else {
        this.file2Data = parsedData;
      }

      // Extract languages from the data
      this.updateAvailableLanguages(parsedData);

      // Update compare button state
      this.updateCompareButton();

      this.showStatus(`${file.name} loaded successfully`, "success");
    } catch (error) {
      console.error("Error processing file:", error);
      this.showStatus(
        `Error processing ${file.name}: ${error.message}`,
        "error"
      );

      // Clear failed file
      if (fileNumber === 1) {
        this.clearFile(1);
      } else {
        this.clearFile(2);
      }
    }
  }

  isValidFile(file) {
    const validExtensions = [".csv", ".xlsx"];
    return validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  updateAvailableLanguages(data) {
    if (!data || data.length === 0) return;

    const firstRow = data[0];
    const standardColumns = [
      "termID",
      "notes",
      "shouldBeTranslated",
      "translationNeedsToBeUpdated",
      "English",
    ];

    Object.keys(firstRow).forEach((key) => {
      if (!standardColumns.includes(key) && key.trim() !== "") {
        this.availableLanguages.add(key);
      }
    });

    this.updateLanguageSelector();
  }

  updateLanguageSelector() {
    const currentValue = this.compareLanguage.value;

    // Clear existing options except the first two
    while (this.compareLanguage.children.length > 2) {
      this.compareLanguage.removeChild(this.compareLanguage.lastChild);
    }

    // Add language options
    Array.from(this.availableLanguages)
      .sort()
      .forEach((lang) => {
        if (lang !== "English") {
          const option = document.createElement("option");
          option.value = lang;
          option.textContent = lang;
          this.compareLanguage.appendChild(option);
        }
      });

    // Restore previous selection if still available
    if (
      currentValue &&
      Array.from(this.compareLanguage.options).some(
        (opt) => opt.value === currentValue
      )
    ) {
      this.compareLanguage.value = currentValue;
    }
  }

  updateCompareButton() {
    this.compareBtn.disabled = !(this.file1Data && this.file2Data);
  }

  async compareFiles() {
    if (!this.file1Data || !this.file2Data) {
      this.showStatus("Please upload both files before comparing", "error");
      return;
    }

    try {
      this.showStatus("Comparing files...", "info");

      const language = this.compareLanguage.value;
      if (language === "auto") {
        // Auto-detect first available language
        const availableLangs = Array.from(this.availableLanguages).filter(
          (l) => l !== "English"
        );
        if (availableLangs.length > 0) {
          this.compareLanguage.value = availableLangs[0];
        } else {
          this.compareLanguage.value = "English";
        }
      }

      const compareLanguage = this.compareLanguage.value;
      const comparisonOptions = this.getComparisonOptions();

      // Generate diff for each term
      const diffResults = this.generateTermDiffs(
        this.file1Data,
        this.file2Data,
        compareLanguage,
        comparisonOptions
      );

      this.comparisonResults = diffResults;
      this.displayResults(diffResults, compareLanguage);
      this.showStatus("Comparison completed successfully", "success");
    } catch (error) {
      console.error("Error comparing files:", error);
      this.showStatus(`Error comparing files: ${error.message}`, "error");
    }
  }

  getComparisonOptions() {
    const value = this.comparisonOptions.value;
    return {
      ignoreCase: value === "ignoreCase" || value === "ignoreBoth",
      ignoreWhitespace: value === "ignoreWhitespace" || value === "ignoreBoth",
    };
  }

  generateTermDiffs(file1Data, file2Data, language, options) {
    // Create maps for quick lookup
    const file1Map = new Map();
    const file2Map = new Map();

    file1Data.forEach((row) => {
      if (row.termID) {
        file1Map.set(row.termID, row);
      }
    });

    file2Data.forEach((row) => {
      if (row.termID) {
        file2Map.set(row.termID, row);
      }
    });

    // Get all unique term IDs
    const allTermIds = new Set([...file1Map.keys(), ...file2Map.keys()]);
    const results = [];

    let addedCount = 0;
    let removedCount = 0;
    let modifiedCount = 0;
    let unchangedCount = 0;
    let newlineOnlyCount = 0;

    allTermIds.forEach((termId) => {
      const term1 = file1Map.get(termId);
      const term2 = file2Map.get(termId);

      if (!term1) {
        // Term added in file 2
        results.push({
          termId,
          type: "added",
          newValue: term2[language] || "",
          oldValue: "",
          englishText: term2.English || "",
          notes: term2.notes || "",
        });
        addedCount++;
      } else if (!term2) {
        // Term removed in file 2
        results.push({
          termId,
          type: "removed",
          oldValue: term1[language] || "",
          newValue: "",
          englishText: term1.English || "",
          notes: term1.notes || "",
        });
        removedCount++;
      } else {
        // Term exists in both files
        const oldValue = term1[language] || "";
        const newValue = term2[language] || "";

        if (this.areValuesEqual(oldValue, newValue, options)) {
          results.push({
            termId,
            type: "unchanged",
            oldValue,
            newValue,
            englishText: term2.English || term1.English || "",
            notes: term2.notes || term1.notes || "",
          });
          unchangedCount++;
        } else if (this.isNewlineOnlyDiff(oldValue, newValue)) {
          // Check if difference is only due to newline characters
          results.push({
            termId,
            type: "newline-only",
            oldValue,
            newValue,
            englishText: term2.English || term1.English || "",
            notes: term2.notes || term1.notes || "",
            diff: this.generateNewlineDiffHTML(oldValue, newValue),
          });
          newlineOnlyCount++;
        } else {
          results.push({
            termId,
            type: "modified",
            oldValue,
            newValue,
            englishText: term2.English || term1.English || "",
            notes: term2.notes || term1.notes || "",
            diff: this.generateSimpleDiffHTML(oldValue, newValue),
          });
          modifiedCount++;
        }
      }
    });

    return {
      terms: results,
      stats: {
        added: addedCount,
        removed: removedCount,
        modified: modifiedCount,
        unchanged: unchangedCount,
        newlineOnly: newlineOnlyCount,
        total: allTermIds.size,
      },
    };
  }

  areValuesEqual(val1, val2, options) {
    let a = val1;
    let b = val2;

    // Strip leading single quote (Google Sheets/Excel escape character)
    if (a.startsWith("'")) {
      a = a.substring(1);
    }
    if (b.startsWith("'")) {
      b = b.substring(1);
    }

    if (options.ignoreCase) {
      a = a.toLowerCase();
      b = b.toLowerCase();
    }

    if (options.ignoreWhitespace) {
      a = a.replace(/\s+/g, " ").trim();
      b = b.replace(/\s+/g, " ").trim();
    }

    return a === b;
  }

  isNewlineOnlyDiff(val1, val2) {
    // Strip leading single quote (Google Sheets/Excel escape character)
    let v1 = val1.startsWith("'") ? val1.substring(1) : val1;
    let v2 = val2.startsWith("'") ? val2.substring(1) : val2;

    // Normalize newlines and check if the only difference is in line endings
    const normalized1 = v1.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const normalized2 = v2.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // If they're equal after normalization, it's a newline-only diff
    if (normalized1 === normalized2) {
      return true;
    }

    // Additional check: see if the difference is only whitespace-related
    const trimmed1 = v1.replace(/\s+/g, " ").trim();
    const trimmed2 = v2.replace(/\s+/g, " ").trim();

    return trimmed1 === trimmed2 && v1 !== v2;
  }

  generateNewlineDiffHTML(val1, val2) {
    // Show a simple indication that this is a newline/whitespace difference
    const escaped1 = this.escapeHtml(val1);
    const escaped2 = this.escapeHtml(val2);

    return `
      <div style="font-size: 0.8em; color: #9c27b0; font-style: italic; margin-bottom: 8px;">
        Line ending / whitespace difference only
      </div>
      <div style="border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
        <div style="background: #f8d7da; color: #842029; padding: 4px 8px; border-bottom: 1px solid #ddd;">
          <strong>Original:</strong> "${escaped1
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")}"
        </div>
        <div style="background: #d1f2d1; color: #0f5132; padding: 4px 8px;">
          <strong>Updated:</strong> "${escaped2
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")}"
        </div>
      </div>
    `;
  }

  generateSimpleDiffHTML(oldValue, newValue) {
    // Simple diff implementation as fallback
    try {
      // Try to use the external diff function first
      if (typeof generateDiffHTML === "function") {
        return generateDiffHTML(oldValue, newValue);
      }
    } catch (error) {
      console.warn("External diff function not available, using fallback");
    }

    // Fallback: simple side-by-side comparison
    const escaped1 = this.escapeHtml(oldValue);
    const escaped2 = this.escapeHtml(newValue);

    return `
      <div style="border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
        <div style="background: #f8d7da; padding: 4px 8px; border-bottom: 1px solid #ddd;">
          <strong>Original:</strong> ${escaped1}
        </div>
        <div style="background: #d1f2d1; padding: 4px 8px;">
          <strong>Updated:</strong> ${escaped2}
        </div>
      </div>
    `;
  }

  displayResults(results, language) {
    // Update stats
    this.addedCount.textContent = results.stats.added;
    this.modifiedCount.textContent = results.stats.modified;
    this.removedCount.textContent = results.stats.removed;
    this.unchangedCount.textContent = results.stats.unchanged;
    this.newlineOnlyCount.textContent = results.stats.newlineOnly;

    // Update overall summary
    this.overallSummary.textContent = `${results.stats.total} terms compared for ${language}`;

    // Generate diff table
    this.generateDiffTable(results.terms);

    // Show results section
    this.resultsSection.classList.add("show");

    // Set default view to "All Changes"
    this.switchView("all");
  }

  generateDiffTable(terms) {
    if (terms.length === 0) {
      this.diffResults.innerHTML =
        '<div class="no-changes">No terms found to compare.</div>';
      return;
    }

    let html = `
      <table class="diff-table">
        <thead>
          <tr>
            <th>Term ID</th>
            <th>Type</th>
            <th>Original</th>
            <th>Updated</th>
            <th>English Text</th>
          </tr>
        </thead>
        <tbody>
    `;

    terms.forEach((term, index) => {
      const typeClass = term.type;
      let typeText;

      if (term.type === "newline-only") {
        typeText = "Newline Only";
      } else {
        typeText = term.type.charAt(0).toUpperCase() + term.type.slice(1);
      }

      html += `
        <tr class="diff-row diff-row-${term.type}" data-type="${term.type}">
          <td class="term-id">${this.escapeHtml(term.termId)}</td>
          <td><span class="stat-value ${typeClass}">${typeText}</span></td>
          <td class="language-cell">
            ${
              term.type === "added"
                ? "<em>N/A</em>"
                : this.escapeHtml(term.oldValue)
            }
          </td>
          <td class="language-cell">
            ${
              term.type === "removed"
                ? "<em>Removed</em>"
                : term.type === "modified" || term.type === "newline-only"
                ? term.diff
                : this.escapeHtml(term.newValue)
            }
          </td>
          <td class="language-cell">${this.escapeHtml(term.englishText)}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    this.diffResults.innerHTML = html;
  }

  switchView(viewType) {
    // Update active button
    this.viewBtns.forEach((btn) => btn.classList.remove("active"));
    const activeBtn = document.querySelector(`[data-view="${viewType}"]`);
    if (activeBtn) {
      activeBtn.classList.add("active");
    }

    // Show/hide rows based on view type
    const rows = document.querySelectorAll(".diff-row");
    rows.forEach((row) => {
      const rowType = row.dataset.type;

      if (viewType === "all") {
        row.style.display = "";
      } else if (viewType === rowType) {
        row.style.display = "";
      } else {
        row.style.display = "none";
      }
    });
  }

  async exportDiff(format) {
    if (!this.comparisonResults) {
      this.showStatus("No comparison results to export", "error");
      return;
    }

    try {
      if (format === "csv") {
        await this.exportDiffAsCsv();
      } else if (format === "html") {
        await this.exportDiffAsHtml();
      }
    } catch (error) {
      console.error("Export error:", error);
      this.showStatus(`Export failed: ${error.message}`, "error");
    }
  }

  async exportDiffAsCsv() {
    const csvData = [];

    // Add header
    csvData.push([
      "Term ID",
      "Type",
      "Original Value",
      "Updated Value",
      "English Text",
      "Notes",
    ]);

    // Add data rows
    this.comparisonResults.terms.forEach((term) => {
      csvData.push([
        term.termId,
        term.type,
        term.oldValue,
        term.newValue,
        term.englishText,
        term.notes || "",
      ]);
    });

    const csvContent = csvData
      .map((row) =>
        row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    this.downloadFile(csvContent, "diff-report.csv", "text/csv");
  }

  async exportDiffAsHtml() {
    const language = this.compareLanguage.value;
    const timestamp = new Date().toLocaleString();

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Localization Diff Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .stats { display: flex; justify-content: center; gap: 30px; margin-bottom: 30px; }
        .stat-item { text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-value.added { color: #4caf50; }
        .stat-value.removed { color: #f44336; }
        .stat-value.modified { color: #ff9800; }
        .stat-value.unchanged { color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; border: 1px solid #ddd; text-align: left; }
        th { background-color: #f5f5f5; font-weight: 600; }
        .diff-added { background: #d1f2d1; color: #0f5132; padding: 2px 4px; border-radius: 3px; }
        .diff-removed { background: #f8d7da; color: #842029; padding: 2px 4px; border-radius: 3px; text-decoration: line-through; }
        .diff-unchanged { color: #374151; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Localization Diff Report</h1>
        <p>Language: ${language} | Generated: ${timestamp}</p>
        <p>Files: ${this.file1.name} → ${this.file2.name}</p>
    </div>
    
    <div class="stats">
        <div class="stat-item">
            <div class="stat-value added">${this.comparisonResults.stats.added}</div>
            <div>Added</div>
        </div>
        <div class="stat-item">
            <div class="stat-value modified">${this.comparisonResults.stats.modified}</div>
            <div>Modified</div>
        </div>
        <div class="stat-item">
            <div class="stat-value removed">${this.comparisonResults.stats.removed}</div>
            <div>Removed</div>
        </div>
        <div class="stat-item">
            <div class="stat-value unchanged">${this.comparisonResults.stats.unchanged}</div>
            <div>Unchanged</div>
        </div>
        <div class="stat-item">
            <div class="stat-value" style="color: #9c27b0;">${this.comparisonResults.stats.newlineOnly}</div>
            <div>Newline Only</div>
        </div>
    </div>
    
    ${this.diffResults.innerHTML}
</body>
</html>`;

    this.downloadFile(htmlContent, "diff-report.html", "text/html");
  }

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }

  clearFile(fileNumber) {
    if (fileNumber === 1) {
      this.file1 = null;
      this.file1Data = null;
      this.fileInput1.value = "";
      this.fileInfo1.classList.remove("show");
    } else {
      this.file2 = null;
      this.file2Data = null;
      this.fileInput2.value = "";
      this.fileInfo2.classList.remove("show");
    }

    this.updateCompareButton();
  }

  clearAll() {
    this.clearFile(1);
    this.clearFile(2);
    this.comparisonResults = null;
    this.availableLanguages = new Set(["English"]);
    this.updateLanguageSelector();
    this.resultsSection.classList.remove("show");
    this.status.classList.remove("show");
  }

  showStatus(message, type = "info") {
    this.status.textContent = message;
    this.status.className = `status show ${type}`;

    // Auto-hide success messages after 5 seconds
    if (type === "success") {
      setTimeout(() => {
        this.status.classList.remove("show");
      }, 5000);
    }
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the diff page manager when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.diffPageManager = new DiffPageManager();
});
