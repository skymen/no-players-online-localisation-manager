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

class AdminManager {
  constructor() {
    this.originalData = null;
    this.modifiedData = null;
    this.hasUnsavedChanges = false;
    this.languages = [];
    this.serverFileStatuses = [];
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

    // Helper function to normalize text for comparison
    const normalizeText = (text) => {
      if (!text) return "";
      return text
        .replace(/\r\n/g, "\n") // Normalize Windows line endings
        .replace(/\r/g, "\n"); // Normalize old Mac line endings
    };

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

      // Store server file statuses and refresh language display
      this.serverFileStatuses = serverFileStatuses;
      this.populateLanguagesList();

      this.displayServerFileStatuses(serverFileStatuses);

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

      // Update summary section
      this.updateServerFilesSummary(
        languagesWithFiles.length,
        unmergedLanguages.length,
        mergedLanguages.length
      );

      // Enable merge all button if there are unmerged files
      const hasUnmergedFiles = unmergedLanguages.length > 0;
      document.getElementById("mergeAllUnmergedBtn").disabled =
        !hasUnmergedFiles;

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

  updateServerFilesSummary(totalFiles, unmergedCount, mergedCount) {
    const summaryElement = document.getElementById("serverFilesSummary");
    const summaryTextElement = document.getElementById(
      "serverFilesSummaryText"
    );

    if (totalFiles === 0) {
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
      const isMerged = this.checkIfMerged(serverData, language);

      return {
        language,
        hasFile: true,
        isMerged,
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

  checkIfMerged(serverData, language) {
    // Create a map of server data by termID
    const serverDataMap = {};
    serverData.forEach((row) => {
      if (row.termID && row[language] && row[language].trim()) {
        serverDataMap[row.termID] = row[language];
      }
    });

    // Check against main sheet data
    let allMerged = true;
    let checkedTerms = 0;

    for (const mainRow of this.modifiedData) {
      const termID = mainRow.termID;
      if (!termID || mainRow.shouldBeTranslated === "FALSE") continue;

      const serverTranslation = serverDataMap[termID];
      const mainTranslation = mainRow[language];

      if (serverTranslation) {
        checkedTerms++;
        if (serverTranslation !== mainTranslation) {
          allMerged = false;
          break;
        }
      }
    }

    return allMerged && checkedTerms > 0;
  }

  displayServerFileStatuses(statuses) {
    const resultsContainer = document.getElementById("serverFilesResults");

    const html = statuses
      .map((status) => {
        let statusClass = "no-file";
        let statusText = "No file on server";
        let actionButtons = "";

        if (status.hasFile) {
          if (status.isMerged) {
            statusClass = "merged";
            statusText = "✅ Merged";
          } else {
            statusClass = "unmerged";
            statusText = "⚠️ Not merged";
            actionButtons = `
            <button class="server-file-btn merge" onclick="window.adminManager.mergeServerFile('${status.language}')">
              Merge
            </button>
          `;
          }
        }

        const fileDetails = status.fileInfo
          ? `${Math.round(status.fileInfo.size / 1024)} KB • Uploaded: ${
              status.fileInfo.uploaded
            }`
          : "No file available";

        return `
        <div class="server-file-item ${statusClass}">
          <div class="server-file-info">
            <div class="server-file-name">${status.language}</div>
            <div class="server-file-details">${fileDetails}</div>
            <div class="server-file-status ${statusClass}">${statusText}</div>
          </div>
          <div class="server-file-actions">
            ${actionButtons}
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

      this.mergeLanguageData(status.serverData, language);

      // Refresh the displays
      this.displayDataOverview();
      await this.fetchAllServerFiles();

      // Show download section since we have changes
      document.getElementById("downloadSection").classList.remove("hidden");

      this.showStatus(`Successfully merged ${language} translations`);
      setTimeout(() => this.hideStatus(), 2000);
    } catch (error) {
      this.showStatus(`Error merging ${language}: ${error.message}`);
    }
  }

  async mergeAllUnmergedFiles() {
    this.showStatus("Merging all unmerged server files...");

    try {
      let mergedCount = 0;

      for (const language of this.languages) {
        const status = await this.checkServerFileStatus(language);
        if (status.hasFile && !status.isMerged && status.serverData) {
          this.mergeLanguageData(status.serverData, language);
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
    }
  }

  mergeLanguageData(serverData, language) {
    // Create a map of server translations by termID
    const serverTranslations = {};
    serverData.forEach((row) => {
      if (row.termID && row[language] && row[language].trim()) {
        serverTranslations[row.termID] = row[language];
      }
    });

    // Update modifiedData with server translations
    let updatedCount = 0;
    this.modifiedData.forEach((row) => {
      if (row.termID && serverTranslations[row.termID]) {
        const oldValue = row[language] || "";
        const newValue = serverTranslations[row.termID];

        if (oldValue !== newValue) {
          row[language] = newValue;
          updatedCount++;
        }
      }
    });

    if (updatedCount > 0) {
      this.markUnsavedChanges();
    }

    return updatedCount;
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
