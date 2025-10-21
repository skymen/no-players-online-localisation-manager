import { fetchGoogleSheetsData } from "./dataFetcher.js";
import { CONFIG } from "./config.js";
import {
  parseCSV,
  generateLocalizationCSV,
  extractLanguages,
} from "./csvParser.js";
import { generateDiffHTML, getDiffSummary } from "./diffModule.js";

class AdminManager {
  constructor() {
    this.originalData = null;
    this.modifiedData = null;
    this.hasUnsavedChanges = false;
    this.languages = [];
    this.init();
  }

  init() {
    this.bindEvents();
    this.fetchDataAutomatically();
    this.setupBeforeUnloadWarning();
  }

  bindEvents() {
    document
      .getElementById("processBaseFileBtn")
      .addEventListener("click", () => this.processBaseFile());
    document
      .getElementById("applyChangesBtn")
      .addEventListener("click", () => this.applyChanges());
    document
      .getElementById("discardChangesBtn")
      .addEventListener("click", () => this.discardChanges());
    document
      .getElementById("downloadUpdatedBtn")
      .addEventListener("click", () => this.downloadUpdatedFile());
  }

  setupBeforeUnloadWarning() {
    window.addEventListener("beforeunload", (e) => {
      if (this.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue =
          "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    });
  }

  async fetchDataAutomatically() {
    try {
      this.showStatus("Fetching latest data from Google Sheets...");

      this.originalData = await fetchGoogleSheetsData();
      this.modifiedData = [...this.originalData]; // Copy for modifications
      this.extractLanguages();
      this.displayDataOverview();

      this.hideStatus();
    } catch (error) {
      this.showStatus(`Error fetching data: ${error.message}`);
      console.error("Fetch error:", error);
    }
  }

  extractLanguages() {
    if (!this.originalData || this.originalData.length === 0) return;
    this.languages = extractLanguages(this.originalData);
  }

  displayDataOverview() {
    const termsCount = this.modifiedData.filter(
      (row) => row.shouldBeTranslated === "TRUE"
    ).length;
    const languagesCount = this.languages.length;

    document.getElementById("termsCount").textContent = termsCount;
    document.getElementById("languagesCount").textContent = languagesCount;
    document.getElementById("loadingText").classList.add("hidden");
    document.getElementById("statsContainer").classList.remove("hidden");

    this.populateTermsList();
    this.populateLanguagesList();
  }

  populateTermsList() {
    const termsContent = document.getElementById("termsSpoiler");
    const terms = this.modifiedData
      .filter((row) => row.shouldBeTranslated === "TRUE")
      .map((row) => row.termID)
      .filter((termID) => termID);

    termsContent.innerHTML = terms.map((term) => `<div>${term}</div>`).join("");
  }

  populateLanguagesList() {
    const languagesContent = document.getElementById("languagesSpoiler");

    const languageStats = this.languages.map((lang) => {
      const totalTerms = this.modifiedData.filter(
        (row) => row.shouldBeTranslated === "TRUE"
      ).length;
      const translatedTerms = this.modifiedData.filter(
        (row) =>
          row.shouldBeTranslated === "TRUE" &&
          row[lang] &&
          row[lang].trim() !== ""
      ).length;

      const percentage =
        totalTerms > 0 ? Math.round((translatedTerms / totalTerms) * 100) : 0;
      const missingTerms = this.modifiedData
        .filter(
          (row) =>
            row.shouldBeTranslated === "TRUE" &&
            (!row[lang] || row[lang].trim() === "")
        )
        .map((row) => row.termID)
        .filter((termID) => termID);

      return { lang, percentage, missingTerms, translatedTerms, totalTerms };
    });

    languagesContent.innerHTML = languageStats
      .map(
        (stat) => `
      <div class="language-item">
        <span class="language-name">${stat.lang}</span>
        <span class="completion-percentage" onclick="showMissingTerms('${
          stat.lang
        }', ${JSON.stringify(stat.missingTerms).replace(/"/g, "&quot;")})">
          ${stat.percentage}% (${stat.translatedTerms}/${stat.totalTerms})
        </span>
      </div>
    `
      )
      .join("");
  }

  async processBaseFile() {
    const fileInput = document.getElementById("baseFileInput");
    const file = fileInput.files[0];

    if (!file) {
      alert("Please select a CSV file");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a CSV file");
      return;
    }

    this.showStatus("Processing base file...");

    try {
      const csvText = await this.readFileAsText(file);
      const uploadedData = parseCSV(csvText);
      const changes = this.compareBaseFiles(uploadedData);
      this.displayChanges(changes);
      this.hideStatus();
    } catch (error) {
      this.showStatus(`Error processing file: ${error.message}`);
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  compareBaseFiles(uploadedData) {
    const originalMap = {};
    const uploadedMap = {};

    // Create maps for easy comparison
    this.originalData.forEach((row) => {
      if (row.termID) {
        originalMap[row.termID] = row.English || "";
      }
    });

    uploadedData.forEach((row) => {
      if (row.termID) {
        uploadedMap[row.termID] = row.English || "";
      }
    });

    const added = [];
    const removed = [];
    const modified = [];

    // Find added and modified terms
    Object.keys(uploadedMap).forEach((termID) => {
      if (!originalMap.hasOwnProperty(termID)) {
        added.push(termID);
      } else if (originalMap[termID] !== uploadedMap[termID]) {
        modified.push({
          termID,
          oldText: originalMap[termID],
          newText: uploadedMap[termID],
        });
      }
    });

    // Find removed terms
    Object.keys(originalMap).forEach((termID) => {
      if (!uploadedMap.hasOwnProperty(termID)) {
        removed.push(termID);
      }
    });

    return { added, removed, modified, uploadedData };
  }

  displayChanges(changes) {
    const changesContent = document.getElementById("changesContent");

    const html = `
      <div class="changes-summary">
        <h4>📊 Changes Summary</h4>
        <div class="change-item">
          <strong>${changes.added.length}</strong> terms added
          ${
            changes.added.length > 0
              ? `
            <div class="spoiler">
              <button class="spoiler-toggle" onclick="toggleSpoiler('addedSpoiler')">
                Show added terms (${changes.added.length})
              </button>
              <div class="spoiler-content" id="addedSpoiler">
                ${changes.added.map((term) => `<div>${term}</div>`).join("")}
              </div>
            </div>
          `
              : ""
          }
        </div>
        
        <div class="change-item">
          <strong>${changes.removed.length}</strong> terms removed
          ${
            changes.removed.length > 0
              ? `
            <div class="spoiler">
              <button class="spoiler-toggle" onclick="toggleSpoiler('removedSpoiler')">
                Show removed terms (${changes.removed.length})
              </button>
              <div class="spoiler-content" id="removedSpoiler">
                ${changes.removed.map((term) => `<div>${term}</div>`).join("")}
              </div>
            </div>
          `
              : ""
          }
        </div>
        
        <div class="change-item">
          <strong>${changes.modified.length}</strong> terms modified
          ${
            changes.modified.length > 0
              ? `
            <div class="spoiler">
              <button class="spoiler-toggle" onclick="toggleSpoiler('modifiedSpoiler')">
                Show modified terms (${changes.modified.length})
              </button>
              <div class="spoiler-content" id="modifiedSpoiler">
                ${this.generateModifiedTermsHTML(changes.modified)}
              </div>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;

    changesContent.innerHTML = html;
    document.getElementById("changesSection").classList.remove("hidden");

    // Store changes for later application
    this.pendingChanges = changes;
  }

  generateModifiedTermsHTML(modifiedTerms) {
    return modifiedTerms
      .map((item, index) => {
        const diffSummary = getDiffSummary(item.oldText, item.newText);
        const diffHTML = generateDiffHTML(item.oldText, item.newText);
        const splitViewHTML = this.generateSplitViewHTML(
          item.oldText,
          item.newText,
          index
        );

        return `
          <div class="term-diff-item">
            <div class="term-diff-title">
              📝 ${item.termID}
            </div>
            <div class="diff-summary">
              ${diffSummary.message}
            </div>
            <div class="diff-header">
              Text Changes:
              <button class="diff-toggle-btn" onclick="toggleDiffView(${index})" id="toggleBtn${index}">
                📋 Split View
              </button>
            </div>
            <div class="diff-container diff-view" id="diffView${index}">
              ${diffHTML}
            </div>
            <div class="diff-container split-view hidden" id="splitView${index}">
              ${splitViewHTML}
            </div>
          </div>
        `;
      })
      .join("");
  }

  generateSplitViewHTML(oldText, newText, index) {
    const { alignedOld, alignedNew, maxLines } = this.alignTextLines(
      oldText || "",
      newText || ""
    );

    return `
      <div class="split-view-container">
        <div class="split-section">
          <div class="split-header old-header">📄 Original</div>
          <div class="split-content-wrapper">
            <div class="line-numbers" id="oldLineNumbers${index}">
              ${this.generateLineNumbers(alignedOld, "old")}
            </div>
            <div class="split-content old-content" id="oldContent${index}" onscroll="syncScroll(${index}, 'old')">
              ${this.generateAlignedContent(alignedOld, "old")}
            </div>
          </div>
        </div>
        <div class="split-section">
          <div class="split-header new-header">📝 New</div>
          <div class="split-content-wrapper">
            <div class="line-numbers" id="newLineNumbers${index}">
              ${this.generateLineNumbers(alignedNew, "new")}
            </div>
            <div class="split-content new-content" id="newContent${index}" onscroll="syncScroll(${index}, 'new')">
              ${this.generateAlignedContent(alignedNew, "new")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  alignTextLines(oldText, newText) {
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");

    // Use simple line diff to find insertions and deletions
    const lineDiff = this.getLineDiff(oldLines, newLines);

    const alignedOld = [];
    const alignedNew = [];

    lineDiff.forEach((change) => {
      if (change.type === "equal") {
        alignedOld.push({ line: change.oldLine, type: "normal" });
        alignedNew.push({ line: change.newLine, type: "normal" });
      } else if (change.type === "delete") {
        alignedOld.push({ line: change.oldLine, type: "deleted" });
        alignedNew.push({ line: "", type: "empty" });
      } else if (change.type === "insert") {
        alignedOld.push({ line: "", type: "empty" });
        alignedNew.push({ line: change.newLine, type: "added" });
      }
    });

    return {
      alignedOld,
      alignedNew,
      maxLines: Math.max(alignedOld.length, alignedNew.length),
    };
  }

  getLineDiff(oldLines, newLines) {
    const changes = [];
    let oldIndex = 0;
    let newIndex = 0;

    // Simple line-by-line comparison
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (oldIndex >= oldLines.length) {
        // Only new lines left
        changes.push({
          type: "insert",
          newLine: newLines[newIndex],
        });
        newIndex++;
      } else if (newIndex >= newLines.length) {
        // Only old lines left
        changes.push({
          type: "delete",
          oldLine: oldLines[oldIndex],
        });
        oldIndex++;
      } else if (oldLines[oldIndex] === newLines[newIndex]) {
        // Lines are equal
        changes.push({
          type: "equal",
          oldLine: oldLines[oldIndex],
          newLine: newLines[newIndex],
        });
        oldIndex++;
        newIndex++;
      } else {
        // Lines are different - for simplicity, treat as delete + insert
        changes.push({
          type: "delete",
          oldLine: oldLines[oldIndex],
        });
        changes.push({
          type: "insert",
          newLine: newLines[newIndex],
        });
        oldIndex++;
        newIndex++;
      }
    }

    return changes;
  }

  generateLineNumbers(alignedLines, side) {
    let lineNumber = 1;
    return alignedLines
      .map((item) => {
        if (item.type === "empty") {
          return '<div class="line-number empty-line-number">—</div>';
        } else {
          const num = lineNumber++;
          return `<div class="line-number">${num}</div>`;
        }
      })
      .join("");
  }

  generateAlignedContent(alignedLines, side) {
    return alignedLines
      .map((item) => {
        const escapedLine = this.escapeHtml(item.line);
        const className =
          item.type === "empty"
            ? "empty-line"
            : item.type === "deleted"
            ? "deleted-line"
            : item.type === "added"
            ? "added-line"
            : "normal-line";

        return `<div class="content-line ${className}">${
          escapedLine || "&nbsp;"
        }</div>`;
      })
      .join("");
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  applyChanges() {
    if (!this.pendingChanges) return;

    const { added, removed, modified, uploadedData } = this.pendingChanges;

    // Create new data structure
    const newData = [];
    const uploadedMap = {};

    // Create map of uploaded data
    uploadedData.forEach((row) => {
      if (row.termID) {
        uploadedMap[row.termID] = row;
      }
    });

    // Process existing data
    this.originalData.forEach((originalRow) => {
      if (originalRow.termID && uploadedMap[originalRow.termID]) {
        // Term exists in both, update English text if modified
        const updatedRow = { ...originalRow };
        updatedRow.English = uploadedMap[originalRow.termID].English || "";

        // If English was modified, mark translations as needing update
        if (modified.some((m) => m.termID === originalRow.termID)) {
          this.languages.forEach((lang) => {
            if (originalRow[lang] && originalRow[lang].trim() !== "") {
              updatedRow.translationNeedsToBeUpdated = "TRUE";
            }
          });
        }

        newData.push(updatedRow);
        delete uploadedMap[originalRow.termID]; // Remove from map to track remaining as new
      } else if (!removed.includes(originalRow.termID)) {
        // Term not in uploaded data and not in removed list, keep as is
        newData.push(originalRow);
      }
      // If in removed list, don't add to newData (effectively removing it)
    });

    // Add new terms
    Object.values(uploadedMap).forEach((newRow) => {
      if (newRow.termID && added.includes(newRow.termID)) {
        const row = {
          termID: newRow.termID,
          notes: newRow.notes || "",
          shouldBeTranslated: "TRUE",
          translationNeedsToBeUpdated: "FALSE",
          English: newRow.English || "",
        };

        // Add empty language columns
        this.languages.forEach((lang) => {
          row[lang] = "";
        });

        newData.push(row);
      }
    });

    this.modifiedData = newData;
    this.hasUnsavedChanges = true;
    this.showUnsavedChanges();
    this.displayDataOverview(); // Refresh the overview

    document.getElementById("changesSection").classList.add("hidden");
    document.getElementById("downloadSection").classList.remove("hidden");

    this.showStatus(
      "Changes applied successfully! Don't forget to download the updated file.",
      "success"
    );
    setTimeout(() => this.hideStatus(), 3000);
  }

  discardChanges() {
    this.pendingChanges = null;
    document.getElementById("changesSection").classList.add("hidden");
    document.getElementById("baseFileInput").value = "";
  }

  downloadUpdatedFile() {
    const csv = generateLocalizationCSV(this.modifiedData, this.languages);
    this.downloadFile(csv, "updated_localization.csv");

    // Mark as saved
    this.hasUnsavedChanges = false;
    this.hideUnsavedChanges();
    document.getElementById("downloadSection").classList.add("hidden");
  }

  downloadFile(content, filename) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  showUnsavedChanges() {
    document.getElementById("unsavedChanges").classList.remove("hidden");
  }

  hideUnsavedChanges() {
    document.getElementById("unsavedChanges").classList.add("hidden");
  }

  showStatus(message, type = "info") {
    const status = document.getElementById("status");
    status.textContent = message;
    status.classList.remove("hidden");
  }

  hideStatus() {
    document.getElementById("status").classList.add("hidden");
  }
}

// Global functions for onclick events
window.toggleSpoiler = function (spoilerId) {
  const spoilerContent = document.getElementById(spoilerId);
  if (spoilerContent) {
    spoilerContent.classList.toggle("show");
  }
};

window.showMissingTerms = function (language, missingTerms) {
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); display: flex; align-items: center;
    justify-content: center; z-index: 2000;
  `;

  const content = document.createElement("div");
  content.style.cssText = `
    background: var(--secondary-bg); padding: 2rem; border-radius: 8px;
    max-width: 80%; max-height: 80%; overflow-y: auto; color: var(--text-color);
  `;

  content.innerHTML = `
    <h3 style="color: var(--link-color); margin-bottom: 1rem;">
      Missing Terms for ${language}
    </h3>
    <div style="font-family: monospace; font-size: 0.9rem;">
      ${
        missingTerms.length > 0
          ? missingTerms.map((term) => `<div>${term}</div>`).join("")
          : "<div>No missing terms! 🎉</div>"
      }
    </div>
    <button style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--accent-color); 
                   color: var(--text-color); border: none; border-radius: 4px; cursor: pointer;"
            onclick="this.closest('.modal').remove()">
      Close
    </button>
  `;

  modal.className = "modal";
  modal.appendChild(content);
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
};

document.addEventListener("DOMContentLoaded", () => {
  new AdminManager();
});
