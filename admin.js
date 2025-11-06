import { fetchGoogleSheetsData } from "./dataFetcher.js";
import { CONFIG } from "./config.js";
import {
  parseCSV,
  generateLocalizationCSV,
  extractLanguages,
} from "./csvParser.js";
import {
  generateDiffHTML,
  getDiffSummary,
  generateCharDiff,
  generateEnhancedLineDiff,
} from "./diffModule.js";
import {
  checkIfMerged,
  checkIfLQAMerged,
  checkEnhancedMergeStatus,
  normalizeText,
} from "./mergeChecker.js";

class AdminManager {
  constructor() {
    this.originalData = null;
    this.modifiedData = null;
    this.hasUnsavedChanges = false;
    this.languages = [];
    this.serverFileStatuses = [];
    this.lqaFileStatuses = [];
    this.init();
  }

  init() {
    this.bindEvents();
    this.fetchDataAutomatically();
    this.setupBeforeUnloadWarning();

    // Make this instance globally accessible for onclick handlers
    window.adminManager = this;
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
    document
      .getElementById("processLanguageFilesBtn")
      .addEventListener("click", () => this.processLanguageFiles());
    document
      .getElementById("refreshServerFilesBtn")
      .addEventListener("click", () => this.fetchAllServerFiles());
    document
      .getElementById("mergeAllUnmergedBtn")
      .addEventListener("click", () => this.mergeAllUnmergedFiles());
    document
      .getElementById("mergeAllLQABtn")
      .addEventListener("click", () => this.mergeAllUnmergedLQAFiles());

    // File Manager event listeners
    document
      .getElementById("refreshFilesBtn")
      .addEventListener("click", () => this.loadServerFiles());
    document
      .getElementById("deleteAllFilesBtn")
      .addEventListener("click", () => this.deleteAllFiles());
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

      // Automatically fetch server files after main data is loaded
      this.showStatus("Fetching server files...");
      await this.fetchAllServerFiles();

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

      // Check if we have server file status for this language
      const serverStatus = this.serverFileStatuses.find(
        (s) => s.language === lang
      );
      let serverIndicator = "";

      if (serverStatus) {
        if (serverStatus.hasFile && !serverStatus.isMerged) {
          serverIndicator =
            '<span style="color: #ffc107; margin-left: 0.5rem;" title="Has unmerged server file">📤</span>';
        } else if (serverStatus.hasFile && serverStatus.isMerged) {
          serverIndicator =
            '<span style="color: #28a745; margin-left: 0.5rem;" title="Server file merged">✅</span>';
        }
      }

      return {
        lang,
        percentage,
        missingTerms,
        translatedTerms,
        totalTerms,
        serverIndicator,
      };
    });

    languagesContent.innerHTML = languageStats
      .map(
        (stat) => `
      <div class="language-item">
        <span class="language-name">${stat.lang}${stat.serverIndicator}</span>
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
    const originalRawMap = {}; // Store raw text for diff display
    const uploadedRawMap = {}; // Store raw text for diff display

    // Create maps for easy comparison
    this.originalData.forEach((row) => {
      if (row.termID) {
        originalRawMap[row.termID] = row.English || "";
        originalMap[row.termID] = normalizeText(row.English || "");
      }
    });

    uploadedData.forEach((row) => {
      if (row.termID) {
        uploadedRawMap[row.termID] = row.English || "";
        uploadedMap[row.termID] = normalizeText(row.English || "");
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
        // Use raw text for diff display, but normalized text was used for comparison
        modified.push({
          termID,
          oldText: originalMap[termID],
          newText: uploadedMap[termID],
          oldTextRaw: originalRawMap[termID],
          newTextRaw: uploadedRawMap[termID],
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

    // Auto-scroll to the changes section
    setTimeout(() => {
      document.getElementById("changesSection").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);

    // Store changes for later application
    this.pendingChanges = changes;
  }

  generateModifiedTermsHTML(modifiedTerms) {
    return modifiedTerms
      .map((item, index) => {
        const diffSummary = getDiffSummary(item.oldText, item.newText);

        // Check if this is multiline
        const isMultiline = true;
        // (item.oldText && item.oldText.includes("\n")) ||
        // (item.newText && item.newText.includes("\n"));

        let diffContent = "";

        if (isMultiline) {
          // For multiline: Use enhanced diff
          const enhancedDiff = generateEnhancedLineDiff(
            item.oldText,
            item.newText
          );
          const enhancedHTML = this.generateEnhancedDiffHTML(enhancedDiff);

          diffContent = `
            <div class="diff-container">
              ${enhancedHTML}
            </div>
          `;
        } else {
          // For single-line: Use character diff
          const charDiff = generateCharDiff(
            item.oldText || "",
            item.newText || ""
          );
          const charDiffHTML = this.generateCharDiffHTML(charDiff);

          diffContent = `
            <div class="diff-container">
              ${charDiffHTML}
            </div>
          `;
        }

        return `
          <div class="term-diff-item">
            <div class="term-diff-title">
              📝 ${item.termID}
            </div>
            <div class="diff-summary">
              ${diffSummary.message}
            </div>
            <div class="diff-header">
              <span class="diff-label">Text Changes</span>
              <div class="copy-buttons">
                <button class="copy-btn" onclick="copyToClipboard(\`${this.escapeForAttribute(
                  item.oldText || ""
                )}\`, 'old', this)" title="Copy original text">
                  📋 Copy Old
                </button>
                <button class="copy-btn" onclick="copyToClipboard(\`${this.escapeForAttribute(
                  item.newText || ""
                )}\`, 'new', this)" title="Copy new text">
                  📋 Copy New
                </button>
              </div>
            </div>
            ${diffContent}
          </div>
        `;
      })
      .join("");
  }

  generateEnhancedDiffHTML(enhancedDiff) {
    return enhancedDiff
      .map((part) => {
        if (part.lineType === "modified" && part.charDiff) {
          const charDiffHtml = part.charDiff
            .map((charPart) => {
              const className = charPart.added
                ? "diff-added char-added"
                : charPart.removed
                ? "diff-removed char-removed"
                : "diff-unchanged";
              const escapedValue = this.escapeHtml(charPart.value);
              return `<span class="${className}">${escapedValue}</span>`;
            })
            .join("");

          return `<div>${charDiffHtml}</div>`;
        } else {
          const className = part.added
            ? "diff-added"
            : part.removed
            ? "diff-removed"
            : "diff-unchanged";
          const escapedValue = part.value ? this.escapeHtml(part.value) : "";
          return `<span class="${className}">${escapedValue}</span>`;
        }
      })
      .join("");
  }

  generateCharDiffHTML(charDiff) {
    return `
      <div class="char-diff-container">
        <div class="char-diff-label">Character-level diff:</div>
        <div class="char-diff-content">
          ${charDiff
            .map((part) => {
              const className = part.added
                ? "diff-added char-added"
                : part.removed
                ? "diff-removed char-removed"
                : "diff-unchanged";
              const escapedValue = this.escapeHtml(part.value);
              return `<span class="${className}">${escapedValue}</span>`;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    // Convert newlines to <br> tags to preserve line breaks
    return div.innerHTML.replace(/\n/g, "<br>");
  }

  escapeForAttribute(text) {
    return text
      .replace(/'/g, "&#39;")
      .replace(/"/g, "&quot;")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r");
  }

  escapeForTextarea(text) {
    // For textarea content, we just need to escape HTML entities that could break the HTML structure
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  generateUpdatedTermsHTML(updatedTerms) {
    return updatedTerms
      .map((item, index) => {
        const diffSummary = getDiffSummary(item.oldText, item.newText);

        // Check if this is multiline
        const isMultiline = true;

        let diffContent = "";

        if (isMultiline) {
          // For multiline: Use enhanced diff
          const enhancedDiff = generateEnhancedLineDiff(
            item.oldText,
            item.newText
          );
          const enhancedHTML = this.generateEnhancedDiffHTML(enhancedDiff);

          diffContent = `
            <div class="diff-container">
              ${enhancedHTML}
            </div>
          `;
        } else {
          // For single-line: Use character diff
          const charDiff = generateCharDiff(
            item.oldText || "",
            item.newText || ""
          );
          const charDiffHTML = this.generateCharDiffHTML(charDiff);

          diffContent = `
            <div class="diff-container">
              ${charDiffHTML}
            </div>
          `;
        }

        return `
          <div class="term-diff-item">
            <div class="term-diff-title">
              📝 ${item.termID}
            </div>
            <div class="diff-summary">
              ${diffSummary.message}
            </div>
            <button class="translation-toggle" id="translation-toggle-${
              item.termID
            }" onclick="toggleTranslation('${item.termID}')">
              Show Current Translation
            </button>
            <div class="translation-content" id="translation-content-${
              item.termID
            }">
              <textarea class="translation-textarea" readonly>${this.escapeForTextarea(
                item.userTranslation
              )}</textarea>
            </div>
            <div class="diff-header">
              <span class="diff-label">English Text Changes</span>
              <div class="copy-buttons">
                <button class="copy-btn" onclick="copyToClipboard(\`${this.escapeForAttribute(
                  item.oldText || ""
                )}\`, 'old', this)" title="Copy original text">
                  📋 Copy Old
                </button>
                <button class="copy-btn" onclick="copyToClipboard(\`${this.escapeForAttribute(
                  item.newText || ""
                )}\`, 'new', this)" title="Copy new text">
                  📋 Copy New
                </button>
              </div>
            </div>
            ${diffContent}
          </div>
        `;
      })
      .join("");
  }

  // Test function to verify diff functionality
  runDiffTests() {
    console.log("🧪 Running Diff Tests...");

    const tests = [
      {
        name: "Single line change",
        old: "Hello world",
        new: "Hello beautiful world",
      },
      {
        name: "Multiline addition",
        old: "Line 1\nLine 3",
        new: "Line 1\nLine 2\nLine 3",
      },
      {
        name: "Multiline deletion",
        old: "Line 1\nLine 2\nLine 3",
        new: "Line 1\nLine 3",
      },
      {
        name: "Multiline modification",
        old: "Original line\nSecond line\nThird line",
        new: "Modified line\nSecond line\nModified third line",
      },
      {
        name: "Complex multiline",
        old: "This is a paragraph.\nIt has multiple sentences.\nSome content here.\nFinal line.",
        new: "This is a modified paragraph.\nIt has multiple sentences.\nSome different content here.\nAdditional content.\nFinal line.",
      },
    ];

    tests.forEach((test) => {
      try {
        const diffSummary = getDiffSummary(test.old, test.new);
        const diffHTML = generateDiffHTML(test.old, test.new);

        console.log(`✅ ${test.name}: ${diffSummary.message}`);
      } catch (error) {
        console.log(`❌ ${test.name}: ${error.message}`);
      }
    });

    console.log("🏁 Diff tests completed");
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
        // But only if shouldBeTranslated is TRUE
        if (
          modified.some((m) => m.termID === originalRow.termID) &&
          originalRow.shouldBeTranslated === "TRUE"
        ) {
          updatedRow.translationNeedsToBeUpdated = "TRUE";
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
          shouldBeTranslated: newRow.shouldBeTranslated || "TRUE",
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

  async processLanguageFiles() {
    const fileInput = document.getElementById("languageFilesInput");
    const files = Array.from(fileInput.files);

    if (!files.length) {
      alert("Please select at least one CSV file");
      return;
    }

    this.showStatus("Processing language files...");

    const results = [];
    const processedLanguages = new Set();

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        results.push({
          filename: file.name,
          status: "error",
          message: "Not a CSV file",
        });
        continue;
      }

      try {
        const csvText = await this.readFileAsText(file);
        const fileData = parseCSV(csvText);
        const validation = this.validateLanguageFile(fileData, file.name);

        if (!validation.isValid) {
          results.push({
            filename: file.name,
            status: "error",
            message: validation.error,
          });
          continue;
        }

        const language = validation.language;

        if (processedLanguages.has(language)) {
          results.push({
            filename: file.name,
            status: "error",
            message: `Duplicate file for language '${language}'. Only one file per language is allowed.`,
          });
          continue;
        }

        processedLanguages.add(language);

        const mergeResult = this.mergeLanguageData(fileData, language);
        results.push({
          filename: file.name,
          status: "success",
          message: `Successfully processed ${mergeResult.updatedCount} translations for ${language}`,
          language: language,
          stats: mergeResult,
        });
      } catch (error) {
        results.push({
          filename: file.name,
          status: "error",
          message: `Error processing file: ${error.message}`,
        });
      }
    }

    this.displayLanguageFileResults(results);
    this.hideStatus();

    if (results.some((r) => r.status === "success")) {
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
  }

  validateLanguageFile(fileData, filename) {
    // Check if file has data
    if (!fileData || fileData.length === 0) {
      return { isValid: false, error: "File is empty or invalid" };
    }

    // Extract languages from the file
    const fileLanguages = extractLanguages(fileData);

    // Should have English plus exactly one other language
    const nonEnglishLanguages = fileLanguages.filter(
      (lang) => lang !== "English"
    );

    if (nonEnglishLanguages.length === 0) {
      return { isValid: false, error: "No non-English language found in file" };
    }

    if (nonEnglishLanguages.length > 1) {
      return {
        isValid: false,
        error: `Multiple languages found: ${nonEnglishLanguages.join(
          ", "
        )}. Each file should contain only one language.`,
      };
    }

    const language = nonEnglishLanguages[0];

    // Check if this language exists in our main data
    if (!this.languages.includes(language)) {
      return {
        isValid: false,
        error: `Language '${language}' not found in main data. Please add it first.`,
      };
    }

    return { isValid: true, language: language };
  }

  mergeLanguageData(fileData, language) {
    let updatedCount = 0;
    let newTermsCount = 0;
    let skippedCount = 0;

    // Create a map of file data for quick lookup
    const fileDataMap = {};
    fileData.forEach((row) => {
      if (row.termID && row[language] && row[language].trim() !== "") {
        fileDataMap[row.termID] = row[language];
      }
    });

    // Update main data
    this.modifiedData.forEach((row) => {
      if (row.termID && fileDataMap.hasOwnProperty(row.termID)) {
        // Only update rows that should be translated
        if (row.shouldBeTranslated === "FALSE") {
          skippedCount++;
          return;
        }

        const newTranslation = fileDataMap[row.termID];
        const existingTranslation = row[language] || "";

        if (
          existingTranslation !== newTranslation &&
          newTranslation.trim() !== ""
        ) {
          row[language] = newTranslation;
          updatedCount++;
        } else {
          skippedCount++;
        }
      }
    });

    return { updatedCount, newTermsCount, skippedCount };
  }

  displayLanguageFileResults(results) {
    const statusDiv = document.getElementById("languageFilesStatus");
    const resultsDiv = document.getElementById("languageFilesResults");

    let html = "";
    results.forEach((result) => {
      html += `
        <div class="language-file-result ${result.status}">
          <div class="language-file-name">📄 ${result.filename}</div>
          <div class="language-file-message">${result.message}</div>
          ${
            result.stats
              ? `
            <div class="language-file-stats">
              Updated: ${result.stats.updatedCount} translations, 
              Skipped: ${result.stats.skippedCount} unchanged
            </div>
          `
              : ""
          }
        </div>
      `;
    });

    resultsDiv.innerHTML = html;
    statusDiv.classList.remove("hidden");

    // Auto-scroll to results
    setTimeout(() => {
      statusDiv.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
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

  markUnsavedChanges() {
    this.hasUnsavedChanges = true;
    this.showUnsavedChanges();
  }

  // Server files management methods
  async fetchAllServerFiles() {
    // Show loading indicator and hide controls
    const loadingElement = document.getElementById("serverFilesLoading");
    const controlsElement = document.getElementById("serverFilesControls");
    const summaryElement = document.getElementById("serverFilesSummary");

    loadingElement.style.display = "flex";
    controlsElement.classList.add("hidden");
    summaryElement.classList.add("hidden");

    const serverFilesResults = document.getElementById("serverFilesResults");
    const serverFilesStatus = document.getElementById("serverFilesStatus");

    try {
      const serverFileStatuses = [];

      // Also check LQA files
      const lqaFileStatuses = [];
      for (const language of this.languages) {
        try {
          const lqaStatus = await this.checkLQAFileStatus(language);
          lqaFileStatuses.push(lqaStatus);
        } catch (error) {
          console.error(`Error checking LQA for ${language}:`, error);
          lqaFileStatuses.push({
            language,
            hasLQAFile: false,
            lqaIsMerged: false,
            error: error.message,
          });
        }
      }

      for (const language of this.languages) {
        try {
          const fileStatus = await this.checkServerFileStatus(language);
          serverFileStatuses.push(fileStatus);
        } catch (error) {
          console.error(`Error checking ${language}:`, error);
          serverFileStatuses.push({
            language,
            hasFile: false,
            isMerged: false,
            error: error.message,
          });
        }
      }

      // Store server file statuses and LQA statuses
      this.serverFileStatuses = serverFileStatuses;
      this.lqaFileStatuses = lqaFileStatuses;
      this.populateLanguagesList();

      this.displayServerFileStatuses(serverFileStatuses, lqaFileStatuses);

      // Calculate counts for summary
      const languagesWithFiles = serverFileStatuses.filter(
        (status) => status.hasFile
      );
      const unmergedLanguages = serverFileStatuses.filter(
        (status) => status.hasFile && !status.isMerged
      );
      const mergedLanguages = serverFileStatuses.filter(
        (status) => status.hasFile && status.isMerged
      );

      // Calculate LQA counts
      const languagesWithLQA = lqaFileStatuses.filter(
        (status) => status.hasLQAFile
      );
      const unmergedLQA = lqaFileStatuses.filter(
        (status) => status.hasLQAFile && !status.lqaIsMerged
      );
      const mergedLQA = lqaFileStatuses.filter(
        (status) => status.hasLQAFile && status.lqaIsMerged
      );

      // Update summary section
      this.updateServerFilesSummary(
        languagesWithFiles.length,
        unmergedLanguages.length,
        mergedLanguages.length,
        languagesWithLQA.length,
        unmergedLQA.length,
        mergedLQA.length
      );

      // Enable merge all button if there are unmerged files
      const hasUnmergedFiles = unmergedLanguages.length > 0;
      document.getElementById("mergeAllUnmergedBtn").disabled =
        !hasUnmergedFiles;

      // Enable merge all LQA button if there are unmerged LQA files
      const hasUnmergedLQA = unmergedLQA.length > 0;
      document.getElementById("mergeAllLQABtn").disabled = !hasUnmergedLQA;

      // Show server files status if we have any files
      if (languagesWithFiles.length > 0) {
        serverFilesStatus.classList.remove("hidden");
      }

      // Hide loading and show controls
      loadingElement.style.display = "none";
      controlsElement.classList.remove("hidden");

      this.hideStatus();
    } catch (error) {
      // Hide loading and show controls even on error
      loadingElement.style.display = "none";
      controlsElement.classList.remove("hidden");

      this.showStatus(`Error fetching server files: ${error.message}`);
    }
  }

  updateServerFilesSummary(
    totalFiles,
    unmergedCount,
    mergedCount,
    totalLQA = 0,
    unmergedLQA = 0,
    mergedLQA = 0
  ) {
    const summaryElement = document.getElementById("serverFilesSummary");
    const summaryTextElement = document.getElementById(
      "serverFilesSummaryText"
    );

    if (totalFiles === 0 && totalLQA === 0) {
      summaryElement.classList.add("hidden");
      return;
    }

    let summaryText = `<strong>Server Files Summary:</strong> ${totalFiles} language${
      totalFiles > 1 ? "s" : ""
    } with files on server`;

    if (unmergedCount > 0) {
      summaryText += ` • <span style="color: #ffc107;">${unmergedCount} unmerged</span>`;
    }

    if (mergedCount > 0) {
      summaryText += ` • <span style="color: #28a745;">${mergedCount} merged</span>`;
    }

    // Add LQA summary
    if (totalLQA > 0) {
      summaryText += `<br><strong>LQA Files:</strong> ${totalLQA} language${
        totalLQA > 1 ? "s" : ""
      } with LQA files`;

      if (unmergedLQA > 0) {
        summaryText += ` • <span style="color: #ffc107;">${unmergedLQA} unmerged LQA</span>`;
      }

      if (mergedLQA > 0) {
        summaryText += ` • <span style="color: #28a745;">${mergedLQA} merged LQA</span>`;
      }
    }

    summaryTextElement.innerHTML = summaryText;
    summaryElement.classList.remove("hidden");
  }

  async checkServerFileStatus(language) {
    try {
      // Try to get server files list
      const response = await fetch(
        `${CONFIG.PHP_SERVER_URL}?action=backups&id=${encodeURIComponent(
          language
        )}`
      );

      if (!response.ok) {
        if (response.status === 400) {
          return { language, hasFile: false, isMerged: false };
        }
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      const backups = result.backups || [];

      if (backups.length === 0) {
        return { language, hasFile: false, isMerged: false };
      }

      // Get current file
      const currentFile = backups.find((f) => f.version === "current");
      if (!currentFile) {
        return { language, hasFile: false, isMerged: false };
      }

      // Download and check merge status
      const csvResponse = await fetch(
        `${CONFIG.PHP_SERVER_URL}?action=data&id=${encodeURIComponent(
          language
        )}`
      );
      if (!csvResponse.ok) {
        throw new Error(
          `Failed to download server file: ${csvResponse.status}`
        );
      }

      const csvContent = await csvResponse.text();
      const serverData = parseCSV(csvContent);
      const enhancedStatus = this.getEnhancedMergeStatus(serverData, language);

      return {
        language,
        hasFile: true,
        isMerged: enhancedStatus.isMerged,
        status: enhancedStatus.status,
        outdatedTerms: enhancedStatus.outdatedTerms,
        hasOutdatedTerms: enhancedStatus.hasOutdatedTerms,
        fileInfo: currentFile,
        serverData,
      };
    } catch (error) {
      console.error(`Error checking server file for ${language}:`, error);
      return {
        language,
        hasFile: false,
        isMerged: false,
        error: error.message,
      };
    }
  }

  async checkLQAFileStatus(language) {
    try {
      const lqaId = `LQA_${language}`;

      // Try to get LQA server files list
      const response = await fetch(
        `${CONFIG.PHP_SERVER_URL}?action=backups&id=${encodeURIComponent(
          lqaId
        )}`
      );

      if (!response.ok) {
        if (response.status === 400) {
          return { language, hasLQAFile: false, lqaIsMerged: false };
        }
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      const backups = result.backups || [];

      if (backups.length === 0) {
        return { language, hasLQAFile: false, lqaIsMerged: false };
      }

      // Get current LQA file
      const currentFile = backups.find((f) => f.version === "current");
      if (!currentFile) {
        return { language, hasLQAFile: false, lqaIsMerged: false };
      }

      // Download and check if LQA is merged into main sheet
      const csvResponse = await fetch(
        `${CONFIG.PHP_SERVER_URL}?action=data&id=${encodeURIComponent(lqaId)}`
      );
      if (!csvResponse.ok) {
        throw new Error(`Failed to download LQA file: ${csvResponse.status}`);
      }

      const csvContent = await csvResponse.text();
      const lqaData = parseCSV(csvContent);
      const lqaIsMerged = this.checkIfLQAMerged(lqaData, language);

      return {
        language,
        hasLQAFile: true,
        lqaIsMerged,
        lqaFileInfo: currentFile,
        lqaData,
      };
    } catch (error) {
      console.error(`Error checking LQA file for ${language}:`, error);
      return {
        language,
        hasLQAFile: false,
        lqaIsMerged: false,
        error: error.message,
      };
    }
  }

  checkIfLQAMerged(lqaData, language) {
    return checkIfLQAMerged(lqaData, language, this.originalData);
  }

  checkIfMerged(serverData, language) {
    // Get LQA data for this language if available
    const lqaStatus = this.lqaFileStatuses.find(
      (status) => status.language === language
    );
    const lqaData = lqaStatus && lqaStatus.lqaData ? lqaStatus.lqaData : null;

    return checkIfMerged(serverData, language, this.modifiedData, lqaData);
  }

  getEnhancedMergeStatus(serverData, language) {
    // Get LQA data for this language if available
    const lqaStatus = this.lqaFileStatuses.find(
      (status) => status.language === language
    );
    const lqaData = lqaStatus && lqaStatus.lqaData ? lqaStatus.lqaData : null;

    return checkEnhancedMergeStatus(
      serverData,
      language,
      this.modifiedData,
      lqaData
    );
  }

  displayServerFileStatuses(statuses, lqaStatuses = []) {
    const resultsContainer = document.getElementById("serverFilesResults");

    const html = statuses
      .map((status) => {
        const lqaStatus = lqaStatuses.find(
          (lqa) => lqa.language === status.language
        );

        let statusClass = "no-file";
        let statusText = "No file on server";
        let actionButtons = "";

        if (status.hasFile) {
          switch (status.status || (status.isMerged ? "merged" : "unmerged")) {
            case "merged":
              statusClass = "merged";
              if (lqaStatus && lqaStatus.hasLQAFile && lqaStatus.lqaIsMerged) {
                statusText = "✅ Merged (LQA Merged)";
              } else {
                statusText = "✅ Merged";
              }
              break;
            case "merged-outdated":
              statusClass = "merged-outdated";
              statusText = "✅ Merged (Outdated)";
              actionButtons = `
                <button class="server-file-btn outdated" onclick="window.adminManager.showOutdatedTerms('${
                  status.language
                }')">
                  Show Outdated (${
                    status.outdatedTerms ? status.outdatedTerms.length : 0
                  })
                </button>
              `;
              break;
            case "unmerged-outdated":
              statusClass = "unmerged-outdated";
              statusText = "⚠️ Unmerged & Outdated";
              actionButtons = `
                <button class="server-file-btn merge" onclick="window.adminManager.mergeServerFile('${
                  status.language
                }')">
                  Merge
                </button>
                <button class="server-file-btn outdated" onclick="window.adminManager.showOutdatedTerms('${
                  status.language
                }')">
                  Show Outdated (${
                    status.outdatedTerms ? status.outdatedTerms.length : 0
                  })
                </button>
              `;
              break;
            case "unmerged":
            default:
              statusClass = "unmerged";
              statusText = "⚠️ Unmerged";
              actionButtons = `
                <button class="server-file-btn merge" onclick="window.adminManager.mergeServerFile('${status.language}')">
                  Merge
                </button>
              `;
              break;
          }
        }

        // LQA status
        let lqaStatusText = "";
        let lqaActionButtons = "";
        if (lqaStatus && lqaStatus.hasLQAFile) {
          if (lqaStatus.lqaIsMerged) {
            lqaStatusText = "✅ LQA Merged";
          } else {
            lqaStatusText = "⚠️ LQA Not merged";
            // Only show LQA merge button if regular language is already merged
            if (status.hasFile && status.isMerged) {
              lqaActionButtons = `
                <button class="server-file-btn merge-lqa" onclick="window.adminManager.mergeLQAFile('${status.language}')">
                  Merge LQA
                </button>
              `;
            }
          }
        } else {
          lqaStatusText = "No LQA file";
        }

        const fileDetails = status.fileInfo
          ? `${Math.round(status.fileInfo.size / 1024)} KB • Uploaded: ${
              status.fileInfo.uploaded
            }`
          : "No file available";

        const lqaFileDetails =
          lqaStatus && lqaStatus.lqaFileInfo
            ? `LQA: ${Math.round(
                lqaStatus.lqaFileInfo.size / 1024
              )} KB • Uploaded: ${lqaStatus.lqaFileInfo.uploaded}`
            : "";

        return `
        <div class="server-file-item ${statusClass}">
          <div class="server-file-info">
            <div class="server-file-name">${status.language}</div>
            <div class="server-file-details">${fileDetails}</div>
            ${
              lqaFileDetails
                ? `<div class="server-file-details lqa-details">${lqaFileDetails}</div>`
                : ""
            }
            <div class="server-file-status ${statusClass}">${statusText}</div>
            ${
              lqaStatusText
                ? `<div class="server-file-status lqa-status">${lqaStatusText}</div>`
                : ""
            }
          </div>
          <div class="server-file-actions">
            ${actionButtons}
            ${lqaActionButtons}
          </div>
        </div>
      `;
      })
      .join("");

    resultsContainer.innerHTML = html;
  }

  async mergeServerFile(language) {
    try {
      this.showStatus(`Merging server file for ${language}...`);

      const status = await this.checkServerFileStatus(language);
      if (!status.hasFile || !status.serverData) {
        throw new Error("No server file available to merge");
      }

      const mergeResult = this.mergeLanguageData(status.serverData, language);

      let statusMessage = `Successfully merged ${mergeResult.updatedCount} ${language} translations`;
      if (mergeResult.skippedOutdated > 0) {
        statusMessage += ` (skipped ${mergeResult.skippedOutdated} outdated terms)`;
      }

      // Refresh the displays
      this.displayDataOverview();
      await this.fetchAllServerFiles();

      // Show download section since we have changes
      document.getElementById("downloadSection").classList.remove("hidden");

      this.showStatus(statusMessage);
      setTimeout(() => this.hideStatus(), 2000);
    } catch (error) {
      this.showStatus(`Error merging ${language}: ${error.message}`);
    }
  }

  async mergeLQAFile(language) {
    try {
      this.showStatus(`Merging LQA file for ${language}...`);

      const lqaStatus = this.lqaFileStatuses.find(
        (status) => status.language === language
      );
      if (!lqaStatus || !lqaStatus.hasLQAFile || !lqaStatus.lqaData) {
        throw new Error("No LQA file available to merge");
      }

      const mergeResult = this.mergeLanguageData(lqaStatus.lqaData, language);

      let statusMessage = `Successfully merged ${mergeResult.updatedCount} LQA translations for ${language}`;
      if (mergeResult.skippedOutdated > 0) {
        statusMessage += ` (skipped ${mergeResult.skippedOutdated} outdated terms)`;
      }

      // Refresh the displays
      this.displayDataOverview();
      await this.fetchAllServerFiles();

      // Show download section since we have changes
      document.getElementById("downloadSection").classList.remove("hidden");

      this.showStatus(statusMessage);
      setTimeout(() => this.hideStatus(), 2000);
    } catch (error) {
      this.showStatus(`Error merging LQA for ${language}: ${error.message}`);
    }
  }

  async mergeAllUnmergedFiles() {
    const button = document.getElementById("mergeAllUnmergedBtn");
    const originalText = button.textContent;

    // Show spinner
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>Merging...';

    this.showStatus("Merging all unmerged server files...");

    try {
      let mergedCount = 0;

      for (const language of this.languages) {
        const status = await this.checkServerFileStatus(language);
        if (status.hasFile && !status.isMerged && status.serverData) {
          const mergeResult = this.mergeLanguageData(
            status.serverData,
            language
          );
          mergedCount++;
        }
      }

      if (mergedCount > 0) {
        // Refresh displays
        this.displayDataOverview();
        await this.fetchAllServerFiles();

        // Show download section since we have changes
        document.getElementById("downloadSection").classList.remove("hidden");

        this.showStatus(`Successfully merged ${mergedCount} language files`);
        setTimeout(() => this.hideStatus(), 3000);
      } else {
        this.showStatus("No unmerged files found to merge");
        setTimeout(() => this.hideStatus(), 2000);
      }
    } catch (error) {
      this.showStatus(`Error merging files: ${error.message}`);
    } finally {
      // Restore button state
      button.innerHTML = originalText;
      button.disabled = false;
    }
  }

  async mergeAllUnmergedLQAFiles() {
    const button = document.getElementById("mergeAllLQABtn");
    const originalText = button.textContent;

    // Show spinner
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>Merging...';

    this.showStatus("Merging all unmerged LQA files...");

    try {
      let mergedCount = 0;

      for (const lqaStatus of this.lqaFileStatuses) {
        if (
          lqaStatus.hasLQAFile &&
          !lqaStatus.isLQAMerged &&
          lqaStatus.lqaData
        ) {
          const mergeResult = this.mergeLanguageData(
            lqaStatus.lqaData,
            lqaStatus.language
          );
          mergedCount++;
        }
      }

      if (mergedCount > 0) {
        // Refresh displays
        this.displayDataOverview();
        await this.fetchAllServerFiles();

        // Show download section since we have changes
        document.getElementById("downloadSection").classList.remove("hidden");

        this.showStatus(`Successfully merged ${mergedCount} LQA files`);
        setTimeout(() => this.hideStatus(), 3000);
      } else {
        this.showStatus("No unmerged LQA files found to merge");
        setTimeout(() => this.hideStatus(), 2000);
      }
    } catch (error) {
      this.showStatus(`Error merging LQA files: ${error.message}`);
    } finally {
      // Restore button state
      button.innerHTML = originalText;
      button.disabled = false;
    }
  }

  mergeLanguageData(serverData, language) {
    // Create maps of server data by termID
    const serverTranslations = {};
    const serverEnglishMap = {};
    serverData.forEach((row) => {
      if (row.termID) {
        if (row[language] && row[language].trim()) {
          serverTranslations[row.termID] = normalizeText(row[language]);
        }
        if (row.English) {
          serverEnglishMap[row.termID] = normalizeText(row.English);
        }
      }
    });

    // Update modifiedData with server translations, but skip outdated terms
    let updatedCount = 0;
    let skippedOutdated = 0;
    this.modifiedData.forEach((row) => {
      if (row.termID && serverTranslations[row.termID]) {
        // Check if this term is outdated (server English doesn't match main English)
        const mainEnglish = normalizeText(row.English || "");
        const serverEnglish = serverEnglishMap[row.termID];

        if (serverEnglish && serverEnglish !== mainEnglish) {
          skippedOutdated++;
          return; // Skip this outdated term
        }

        const oldValue = normalizeText(row[language] || "");
        const newValue = serverTranslations[row.termID];

        if (oldValue !== newValue) {
          // Store the original (non-normalized) value from server
          const originalServerValue =
            serverData.find((r) => r.termID === row.termID)?.[language] || "";
          row[language] = originalServerValue;
          updatedCount++;
        }
      }
    });

    if (updatedCount > 0) {
      this.markUnsavedChanges();
    }

    return { updatedCount, skippedOutdated };
  }

  showOutdatedTerms(language) {
    // Find the server file status for this language
    const serverStatus = this.serverFileStatuses.find(
      (status) => status.language === language
    );

    if (!serverStatus || !serverStatus.outdatedTerms) {
      alert(`No outdated terms found for ${language}`);
      return;
    }

    const outdatedTerms = serverStatus.outdatedTerms;
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.8); display: flex; align-items: center;
      justify-content: center; z-index: 2000;
    `;

    const content = document.createElement("div");
    content.style.cssText = `
      background: var(--secondary-bg); padding: 2rem; border-radius: 8px;
      max-width: 90%; max-height: 80%; overflow-y: auto; color: var(--text-color);
    `;

    // Convert outdated terms to the same format used by generateUpdatedTermsHTML
    const updatedTermsFormat = outdatedTerms.map((term) => ({
      termID: term.termID,
      oldText: term.serverEnglish,
      newText: term.mainEnglish,
      userTranslation: term.currentTranslation,
    }));

    let htmlContent = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="color: var(--link-color); margin: 0;">
          Outdated Terms for ${language} (${outdatedTerms.length})
        </h3>
        <button style="padding: 0.5rem 1rem; background: var(--accent-color); 
                       color: var(--text-color); border: none; border-radius: 4px; cursor: pointer;"
                onclick="this.closest('.modal').remove()">
          Close
        </button>
      </div>
      <p style="margin-bottom: 1.5rem; opacity: 0.8;">
        These terms have different English text in the server file compared to the main sheet:
      </p>
      ${this.generateUpdatedTermsHTML(updatedTermsFormat)}
    `;

    content.innerHTML = htmlContent;
    modal.className = "modal";
    modal.appendChild(content);
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  showStatus(message, type = "info") {
    const status = document.getElementById("status");
    status.textContent = message;
    status.classList.remove("hidden");
  }

  hideStatus() {
    document.getElementById("status").classList.add("hidden");
  }

  // File Manager Methods
  async loadServerFiles() {
    try {
      this.showStatus("Loading server files...");

      const response = await fetch(`${CONFIG.PHP_SERVER_URL}?action=list_all`);
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to load files");
      }

      this.displayServerFiles(result.ids);
      this.hideStatus();
    } catch (error) {
      this.showStatus(`Error loading files: ${error.message}`);
      console.error("File loading error:", error);
    }
  }

  displayServerFiles(files) {
    const loadingElement = document.getElementById("fileManagerLoading");
    const contentElement = document.getElementById("fileManagerContent");
    const noFilesElement = document.getElementById("noFilesMessage");
    const filesListElement = document.getElementById("filesList");

    loadingElement.classList.add("hidden");

    if (files.length === 0) {
      contentElement.classList.add("hidden");
      noFilesElement.classList.remove("hidden");
      return;
    }

    noFilesElement.classList.add("hidden");
    contentElement.classList.remove("hidden");

    // Update summary stats
    const totalFiles = files.reduce((sum, file) => sum + file.fileCount, 0);
    const totalSize = files.reduce((sum, file) => sum + file.totalSize, 0);

    document.getElementById("totalIDsCount").textContent = files.length;
    document.getElementById("totalFilesCount").textContent = totalFiles;
    document.getElementById("totalSizeDisplay").textContent =
      this.formatFileSize(totalSize);

    // Generate files list HTML
    const filesHTML = files
      .map((file) => this.generateFileItemHTML(file))
      .join("");
    filesListElement.innerHTML = filesHTML;
  }

  generateFileItemHTML(file) {
    const lastModified = file.lastModified
      ? new Date(file.lastModified).toLocaleString()
      : "Unknown";

    return `
      <div class="file-item">
        <div class="file-item-header">
          <div>
            <div class="file-id">${file.id}</div>
            <div class="file-stats">
              <span>${file.fileCount} files</span>
              <span>${this.formatFileSize(file.totalSize)}</span>
              <span>Last: ${lastModified}</span>
            </div>
          </div>
          <div class="file-actions">
            <a href="${
              CONFIG.PHP_SERVER_URL
            }?action=data&id=${encodeURIComponent(file.id)}" 
               class="file-btn primary" target="_blank">
              📄 Current
            </a>
            <a href="${
              CONFIG.PHP_SERVER_URL
            }?action=download_zip&id=${encodeURIComponent(file.id)}" 
               class="file-btn primary">
              📦 Download ZIP
            </a>
            <button class="file-btn danger" onclick="window.adminManager.deleteFile('${
              file.id
            }')">
              🗑️ Delete
            </button>
          </div>
        </div>
        <div class="file-metadata">
          <button class="metadata-toggle" id="metadata-toggle-${file.id}" 
                  onclick="toggleMetadata('${file.id}')">
            ▶ Show Metadata
          </button>
          <div class="metadata-content" id="metadata-content-${file.id}">
${JSON.stringify(file.metadata, null, 2)}
          </div>
        </div>
      </div>
    `;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 bytes";
    const k = 1024;
    const sizes = ["bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  async deleteFile(id) {
    if (
      !confirm(
        `Are you sure you want to delete all files for "${id}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      this.showStatus(`Deleting ${id}...`);

      const formData = new FormData();
      const response = await fetch(
        `${CONFIG.PHP_SERVER_URL}?action=delete&id=${encodeURIComponent(id)}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to delete file");
      }

      this.showStatus(`Successfully deleted ${id}`);
      setTimeout(() => {
        this.hideStatus();
        this.loadServerFiles(); // Refresh the list
      }, 1500);
    } catch (error) {
      this.showStatus(`Error deleting file: ${error.message}`);
    }
  }

  async deleteAllFiles() {
    if (
      !confirm(
        "Are you sure you want to delete ALL files from the server? This action cannot be undone."
      )
    ) {
      return;
    }

    if (
      !confirm(
        "This will permanently delete all translation files. Are you absolutely sure?"
      )
    ) {
      return;
    }

    try {
      this.showStatus("Deleting all files...");

      const formData = new FormData();
      const response = await fetch(
        `${CONFIG.PHP_SERVER_URL}?action=delete_all`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to delete files");
      }

      this.showStatus(`Successfully deleted all files: ${result.message}`);
      setTimeout(() => {
        this.hideStatus();
        this.loadServerFiles(); // Refresh the list
      }, 2000);
    } catch (error) {
      this.showStatus(`Error deleting files: ${error.message}`);
    }
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
  window.adminManager = new AdminManager();
});
