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

class LocalisationManager {
  constructor() {
    this.data = null;
    this.selectedLanguage = null;
    this.availableLanguages = [];
    this.uploadedData = null;
    this.processedData = null;
    this.serverFiles = null;
    this.isValidatingServerFile = false; // Track if we're validating server file
    this.init();
  }

  init() {
    this.bindEvents();
    this.fetchDataAutomatically();

    // Make this instance globally accessible for onclick handlers
    window.localisationManager = this;
  }

  bindEvents() {
    document
      .getElementById("languageSelect")
      .addEventListener("change", (e) => this.onLanguageChange(e));
    document
      .getElementById("downloadLatestBtn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.downloadLatestVersion();
      });
    document
      .getElementById("fileInput")
      .addEventListener("change", (e) => this.handleFileSelection(e));
    document
      .getElementById("downloadProcessedBtn")
      .addEventListener("click", () => this.downloadProcessedFile());
    document
      .getElementById("backToLanguageBtn")
      .addEventListener("click", () => this.goBackToLanguageSelection());
    document
      .getElementById("tutorialToggle")
      .addEventListener("click", () => this.toggleTutorial());

    // Set up drag and drop
    this.setupDragAndDrop();

    // Set up original sheet link
    this.setupOriginalSheetLink();
  }

  async fetchDataAutomatically() {
    try {
      this.showStatus("Fetching latest data from Google Sheets...");

      this.data = await fetchGoogleSheetsData();
      this.extractLanguages();
      this.populateLanguageDropdown();

      this.hideStatus();
      this.showStep(2);
    } catch (error) {
      this.showStatus(`Error fetching data: ${error.message}`);
      console.error("Fetch error:", error);
    }
  }

  extractLanguages() {
    if (!this.data || this.data.length === 0) return;
    this.availableLanguages = extractLanguages(this.data);
  }

  populateLanguageDropdown() {
    const select = document.getElementById("languageSelect");
    select.innerHTML = '<option value="">Select a language...</option>';

    this.availableLanguages.forEach((language) => {
      if (language.trim()) {
        const option = document.createElement("option");
        option.value = language;
        option.textContent = language;
        select.appendChild(option);
      }
    });
  }

  onLanguageChange(e) {
    const actionsArea = document.getElementById("actionsArea");
    const dropZone = document.getElementById("dropZone");

    if (e.target.value) {
      this.selectedLanguage = e.target.value;
      document.getElementById("selectedLanguageName").textContent =
        this.selectedLanguage;

      // Show actions area and drop zone
      actionsArea.classList.remove("hidden");
      dropZone.classList.remove("hidden");

      // Load server files
      this.loadServerFiles();
    } else {
      this.selectedLanguage = null;

      // Hide actions area and drop zone
      actionsArea.classList.add("hidden");
      dropZone.classList.add("hidden");
    }
  }

  async loadServerFiles() {
    const serverFilesSection = document.getElementById("serverFilesSection");
    const serverFilesContent = document.getElementById("serverFilesContent");

    try {
      const result = await this.getServerFiles(this.selectedLanguage);
      this.serverFiles = result.backups || [];

      if (this.serverFiles.length === 0) {
        serverFilesSection.classList.add("hidden");
        return;
      }

      serverFilesSection.classList.remove("hidden");

      let html = "";

      // Show current file first
      const currentFile = this.serverFiles.find((f) => f.version === "current");
      if (currentFile) {
        html += this.generateServerFileHTML(currentFile, true);
      }

      // Show backups in spoiler
      const backups = this.serverFiles.filter((f) => f.version !== "current");
      if (backups.length > 0) {
        html += `
          <div class="spoiler" style="margin-top: 1rem;">
            <button class="spoiler-toggle" onclick="this.nextElementSibling.classList.toggle('show')">
              Show backup files (${backups.length})
            </button>
            <div class="spoiler-content">
              ${backups
                .map((file) => this.generateServerFileHTML(file, false))
                .join("")}
            </div>
          </div>
        `;
      }

      serverFilesContent.innerHTML = html;

      // Check merge status for current file
      if (currentFile) {
        this.checkCurrentFileMergeStatus();
      }
    } catch (error) {
      console.error("Error loading server files:", error);
      serverFilesSection.classList.add("hidden");
    }
  }

  generateServerFileHTML(file, isCurrent) {
    const versionText = isCurrent ? "Current" : `Backup ${file.version}`;
    const sizeKB = Math.round(file.size / 1024);

    return `
      <div class="server-file-item">
        <div class="server-file-info">
          <div class="server-file-version">${versionText}</div>
          <div class="server-file-details">
            ${sizeKB} KB • Uploaded: ${file.uploaded}
          </div>
          ${
            isCurrent
              ? '<span id="merge-status-current" class="merge-status checking">Checking merge status...</span>'
              : ""
          }
        </div>
        <div class="server-file-actions">
          <button class="server-file-btn" onclick="window.localisationManager.downloadServerFileToUser('${
            this.selectedLanguage
          }', '${file.version}')">
            Download
          </button>
          ${
            isCurrent
              ? `
            <button class="server-file-btn validate" onclick="window.localisationManager.validateCurrentServerFile()">
              Validate
            </button>
          `
              : ""
          }
        </div>
      </div>
    `;
  }

  async checkCurrentFileMergeStatus() {
    try {
      const csvContent = await this.downloadServerFile(this.selectedLanguage);
      const serverData = parseCSV(csvContent);
      const mergeStatus = await this.checkMergeStatus(
        serverData,
        this.selectedLanguage
      );

      const statusElement = document.getElementById("merge-status-current");
      if (statusElement) {
        if (mergeStatus.isMerged) {
          statusElement.className = "merge-status merged";
          statusElement.textContent = "✅ Merged into main sheet";
        } else {
          statusElement.className = "merge-status not-merged";
          statusElement.textContent = "❌ Not yet merged into main sheet";
        }
      }
    } catch (error) {
      const statusElement = document.getElementById("merge-status-current");
      if (statusElement) {
        statusElement.className = "merge-status not-merged";
        statusElement.textContent = "❌ Error checking";
      }
    }
  }

  // Clear server files when going back to language selection
  clearServerFiles() {
    const serverFilesSection = document.getElementById("serverFilesSection");
    serverFilesSection.classList.add("hidden");
    this.serverFiles = null;
  }

  setupDragAndDrop() {
    const dropZone = document.getElementById("dropZone");

    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, this.preventDefaults, false);
      document.body.addEventListener(eventName, this.preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(
        eventName,
        () => this.highlight(dropZone),
        false
      );
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(
        eventName,
        () => this.unhighlight(dropZone),
        false
      );
    });

    // Handle dropped files
    dropZone.addEventListener("drop", (e) => this.handleDrop(e), false);

    // Make drop zone clickable to open file picker
    dropZone.addEventListener("click", () => {
      if (this.selectedLanguage) {
        document.getElementById("fileInput").click();
      } else {
        alert("Please select a language first");
      }
    });
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  highlight(element) {
    element.classList.add("dragover");
  }

  unhighlight(element) {
    element.classList.remove("dragover");
  }

  handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
      const file = files[0];
      this.processFile(file);
    }
  }

  handleFileSelection(e) {
    const file = e.target.files[0];
    if (file) {
      this.processFile(file);
    }
  }

  async processFile(file) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a CSV file");
      return;
    }

    this.showStatus("Processing uploaded file...");

    try {
      // Reset flag since this is a user upload
      this.isValidatingServerFile = false;

      const csvText = await this.readFileAsText(file);
      this.uploadedData = parseCSV(csvText);
      const report = this.compareAndGenerateReport();
      this.displayReport(report);
      this.showStep(3);
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

  downloadLatestVersion() {
    if (!this.selectedLanguage || !this.data) {
      alert("No language or data available");
      return;
    }

    this.showStatus("Generating latest version CSV...");

    setTimeout(() => {
      const csv = this.generateLatestVersionCSV(this.selectedLanguage);
      this.downloadFile(csv, `${this.selectedLanguage}_latest.csv`);
      this.hideStatus();
    }, 500);
  }

  showFileUpload() {
    document.getElementById("fileUploadArea").classList.remove("hidden");
  }

  async processUploadedFile() {
    const fileInput = document.getElementById("fileInputVisible");
    const file = fileInput.files[0];

    if (!file) {
      alert("Please select a CSV file");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a CSV file");
      return;
    }

    this.showStatus("Processing uploaded file...");

    try {
      const csvText = await this.readFileAsText(file);
      this.uploadedData = parseCSV(csvText);
      const report = this.compareAndGenerateReport();
      this.displayReport(report);
      this.showStep(4);
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

  compareAndGenerateReport() {
    const latestData = this.data;
    const userLang = this.selectedLanguage;
    const userData = this.uploadedData;

    // Create a map of user data by termID
    const userDataMap = {};
    userData.forEach((row) => {
      if (row.termID) {
        userDataMap[row.termID] = row;
      }
    });

    const needsTranslation = [];
    const missingTermsFoundInLatest = [];
    const needsUpdate = [];
    const needsUpdateDetails = []; // New: Store detailed info for diff view
    const processedRows = [];

    latestData.forEach((latestRow) => {
      const termID = latestRow.termID;
      if (!termID) return;

      // Skip rows that shouldn't be translated
      if (latestRow.shouldBeTranslated === "FALSE") {
        processedRows.push({
          termID: termID,
          notes: latestRow.notes || "",
          shouldBeTranslated: latestRow.shouldBeTranslated,
          translationNeedsToBeUpdated:
            latestRow.translationNeedsToBeUpdated || "FALSE",
          English: latestRow.English || "",
          [userLang]: latestRow[userLang] || "",
        });
        return;
      }

      const userRow = userDataMap[termID];
      const latestEnglish = latestRow.English || "";
      const latestLanguageText = latestRow[userLang] || "";

      let shouldBeTranslated = "TRUE";
      let translationNeedsToBeUpdated = "FALSE";
      let languageText = latestLanguageText;

      if (userRow) {
        const userEnglish = userRow.English || "";
        const userLanguageText = userRow[userLang] || "";

        // If user has provided a translation (and it's not empty)
        if (userLanguageText && userLanguageText.trim() !== "") {
          languageText = userLanguageText;

          // Check if translation needs update (English changed)
          if (userEnglish !== latestEnglish) {
            translationNeedsToBeUpdated = "TRUE";
            needsUpdate.push(termID);

            // Store detailed info for diff view
            needsUpdateDetails.push({
              termID: termID,
              oldText: userEnglish,
              newText: latestEnglish,
              userTranslation: userLanguageText,
            });
          } else {
            translationNeedsToBeUpdated = "FALSE";
          }
        } else {
          // User didn't provide translation or it's empty
          translationNeedsToBeUpdated = "FALSE";

          // Check if this term already has a translation in the latest data
          if (latestLanguageText) {
            missingTermsFoundInLatest.push(termID);
            languageText = latestLanguageText; // Keep the latest translation
          } else {
            needsTranslation.push(termID);
            languageText = ""; // No translation available
          }
        }
      } else {
        // termID doesn't exist in user file
        if (latestLanguageText) {
          missingTermsFoundInLatest.push(termID);
          languageText = latestLanguageText; // Keep the latest translation
        } else {
          needsTranslation.push(termID);
          languageText = "";
        }
      }

      processedRows.push({
        termID: termID,
        notes: latestRow.notes || "",
        shouldBeTranslated: shouldBeTranslated,
        translationNeedsToBeUpdated: translationNeedsToBeUpdated,
        English: latestEnglish,
        [userLang]: languageText,
      });
    });

    this.processedData = processedRows;

    return {
      needsTranslation,
      missingTermsFoundInLatest,
      needsUpdate,
      needsUpdateDetails, // New: Include detailed info
      totalNeedsTranslation: needsTranslation.length,
      totalMissingTermsFoundInLatest: missingTermsFoundInLatest.length,
      totalNeedsUpdate: needsUpdate.length,
    };
  }

  displayReport(report) {
    const reportContent = document.getElementById("reportContent");
    const reportHeader = document.getElementById("reportHeader");

    // Update the header to include the language name
    reportHeader.textContent = `Translation Report for ${this.selectedLanguage}`;

    // Check if no updates or translations are needed
    if (
      report.totalNeedsTranslation === 0 &&
      report.totalMissingTermsFoundInLatest === 0 &&
      report.totalNeedsUpdate === 0
    ) {
      let html;

      if (this.isValidatingServerFile) {
        // Server file validation - simpler message
        html = `
          <div class="report">
            <h4>✅ Server File Valid!</h4>
            <p style="color: var(--link-color); font-size: 1.1rem; margin-bottom: 1rem;">
              <strong>Great!</strong> The file on the server is complete and up-to-date.
            </p>
            <p>The translation file is ready and waiting for the development team to merge it into the main sheet.</p>
          </div>
        `;
      } else {
        // User upload validation - with auto-upload
        html = `
          <div class="report">
            <h4>🎉 Translation Complete!</h4>
            <p style="color: var(--link-color); font-size: 1.1rem; margin-bottom: 1rem;">
              <strong>Excellent work!</strong> The translation data has been validated.
            </p>
            <p>Your translation file is complete and ready for use. Please download the final file to keep as a backup.</p>
            <div id="upload-status" style="margin-top: 1rem;"></div>
          </div>
        `;
      }

      reportContent.innerHTML = html;
      document
        .getElementById("downloadProcessedBtn")
        .classList.remove("hidden");

      // Only auto-upload for user uploads, not server file validations
      if (!this.isValidatingServerFile) {
        this.autoUploadToServer();
      }
      return;
    }

    // Regular report when translations/updates are needed
    let html = `
      <div class="report">
        <p><strong>${report.totalNeedsTranslation}</strong> missing terms</p>
        <p><strong>${
          report.totalMissingTermsFoundInLatest
        }</strong> missing terms that were found in latest file</p>
        <p><strong>${report.totalNeedsUpdate}</strong> terms need updates</p>
        
        ${
          report.totalNeedsTranslation > 0
            ? `
          <div class="spoiler">
            <button class="spoiler-toggle" onclick="this.nextElementSibling.classList.toggle('show')">
              Show missing terms (${report.totalNeedsTranslation})
            </button>
            <div class="spoiler-content">
              ${report.needsTranslation
                .map((term) => `<div>${term}</div>`)
                .join("")}
            </div>
          </div>
        `
            : ""
        }
        
        ${
          report.totalMissingTermsFoundInLatest > 0
            ? `
          <div class="spoiler">
            <button class="spoiler-toggle" onclick="this.nextElementSibling.classList.toggle('show')">
              Show missing terms found in latest file (${
                report.totalMissingTermsFoundInLatest
              })
            </button>
            <div class="spoiler-content">
              ${report.missingTermsFoundInLatest
                .map((term) => `<div>${term}</div>`)
                .join("")}
            </div>
          </div>
        `
            : ""
        }
        
        ${
          report.totalNeedsUpdate > 0 && report.needsUpdateDetails
            ? `
          <div class="spoiler">
            <button class="spoiler-toggle" onclick="this.nextElementSibling.classList.toggle('show')">
              Show terms needing updates with diff view (${
                report.totalNeedsUpdate
              })
            </button>
            <div class="spoiler-content">
              ${this.generateUpdatedTermsHTML(report.needsUpdateDetails)}
            </div>
          </div>
        `
            : ""
        }
      </div>
    `;

    reportContent.innerHTML = html;
    document.getElementById("downloadProcessedBtn").classList.remove("hidden");
  }

  async autoUploadToServer() {
    const uploadStatus = document.getElementById("upload-status");

    try {
      uploadStatus.innerHTML =
        '<p style="color: var(--link-color);">📤 Uploading to server...</p>';

      const csv = this.generateProcessedCSV();
      await this.uploadToServer(csv, this.selectedLanguage);

      uploadStatus.innerHTML =
        '<p style="color: #4CAF50;">✅ Successfully uploaded to server!</p>';
    } catch (error) {
      console.error("Auto-upload failed:", error);
      uploadStatus.innerHTML = `<p style="color: #f44336;">❌ Upload failed: ${error.message}</p>`;
    }
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

  downloadProcessedFile() {
    if (!this.processedData) {
      alert("No processed data available");
      return;
    }

    this.showStatus("Generating processed CSV...");

    setTimeout(() => {
      const csv = this.generateProcessedCSV();
      this.downloadFile(csv, `${this.selectedLanguage}_updated.csv`);
      this.hideStatus();
    }, 500);
  }

  generateLatestVersionCSV(language) {
    if (!this.data) return "";

    // Check if this is a new language (not in the latest data)
    const isNewLanguage = !this.availableLanguages.includes(language);

    const processedData = this.data
      .map((row) => {
        return {
          termID: row.termID || "",
          notes: row.notes || "",
          shouldBeTranslated: row.shouldBeTranslated || "TRUE",
          translationNeedsToBeUpdated:
            row.translationNeedsToBeUpdated || "FALSE",
          English: row.English || "",
          [language]: row[language] || "",
        };
      })
      .filter((row) => row.termID); // Only keep rows with valid termID

    return generateLocalizationCSV(processedData, [language]);
  }

  generateProcessedCSV() {
    if (!this.processedData) return "";
    return generateLocalizationCSV(this.processedData, [this.selectedLanguage]);
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

  goBackToLanguageSelection() {
    // Reset the language selection
    document.getElementById("languageSelect").value = "";
    this.selectedLanguage = null;

    // Reset server file validation flag
    this.isValidatingServerFile = false;

    // Hide actions area and drop zone
    document.getElementById("actionsArea").classList.add("hidden");
    document.getElementById("dropZone").classList.add("hidden");

    // Clear server files
    this.clearServerFiles();

    // Clear any uploaded data and processed data
    this.uploadedData = null;
    this.processedData = null;

    // Reset file input
    document.getElementById("fileInput").value = "";

    // Hide download button
    document.getElementById("downloadProcessedBtn").classList.add("hidden");

    // Go back to step 2 (language selection)
    this.showStep(2);
  }

  setupOriginalSheetLink() {
    const originalSheetLink = document.getElementById("originalSheetLink");
    if (CONFIG.ORIGINAL_SHEET_URL && CONFIG.ORIGINAL_SHEET_URL.trim()) {
      originalSheetLink.href = CONFIG.ORIGINAL_SHEET_URL;
      originalSheetLink.classList.remove("hidden");
    }
  }

  toggleTutorial() {
    const tutorialContent = document.getElementById("tutorialContent");
    const tutorialToggle = document.getElementById("tutorialToggle");

    tutorialContent.classList.toggle("show");
    tutorialToggle.classList.toggle("expanded");
  }

  // Global methods for onclick handlers
  async downloadServerFileToUser(languageName, version) {
    try {
      this.showStatus(
        `Downloading ${
          version === "current" ? "current" : `backup ${version}`
        } file...`
      );

      const csvContent = await this.downloadServerFile(languageName, version);
      const filename =
        version === "current"
          ? `${languageName}_server_current.csv`
          : `${languageName}_server_backup_${version}.csv`;

      this.downloadFile(csvContent, filename);
      this.hideStatus();
    } catch (error) {
      this.showStatus(`Error downloading file: ${error.message}`);
    }
  }

  async validateCurrentServerFile() {
    try {
      this.showStatus("Validating current server file...");

      // Set flag to indicate we're validating a server file
      this.isValidatingServerFile = true;

      const validation = await this.validateServerFile(this.selectedLanguage);

      // Set the uploaded data to the server data for comparison
      this.uploadedData = parseCSV(validation.csvContent);

      // Display the report
      this.displayReport(validation.report);

      // Update header to indicate this is a server file validation
      const reportHeader = document.getElementById("reportHeader");
      reportHeader.textContent = `Server File Validation for ${this.selectedLanguage}`;

      // Add merge status info to the report
      const reportContent = document.getElementById("reportContent");
      const mergeStatusHTML = `
        <div class="report" style="margin-bottom: 1rem;">
          <h4>Merge Status</h4>
          <p>${
            validation.mergeStatus.isMerged
              ? `✅ <strong>Merged:</strong> All ${validation.mergeStatus.checkedTerms} translated terms match the main sheet.`
              : `❌ <strong>Not Merged:</strong> File has not been fully merged into the main sheet.`
          }</p>
        </div>
      `;

      reportContent.innerHTML = mergeStatusHTML + reportContent.innerHTML;

      this.showStep(3);
      this.hideStatus();
    } catch (error) {
      this.showStatus(`Error validating server file: ${error.message}`);
    }
  }

  // Server communication methods
  async uploadToServer(csvContent, languageName) {
    const formData = new FormData();
    const blob = new Blob([csvContent], { type: "text/csv" });
    formData.append("file", blob, `${languageName}.csv`);

    try {
      const response = await fetch(
        `${CONFIG.PHP_SERVER_URL}?action=upload&id=${encodeURIComponent(
          languageName
        )}`,
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
        throw new Error(result.error || "Upload failed");
      }

      return result;
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  }

  async getServerFiles(languageName) {
    try {
      const response = await fetch(
        `${CONFIG.PHP_SERVER_URL}?action=backups&id=${encodeURIComponent(
          languageName
        )}`
      );

      if (!response.ok) {
        if (response.status === 400) {
          // No files found for this language
          return { success: true, backups: [] };
        }
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error fetching server files:", error);
      return { success: true, backups: [] };
    }
  }

  async downloadServerFile(languageName, version = "current") {
    try {
      const url =
        version === "current"
          ? `${CONFIG.PHP_SERVER_URL}?action=data&id=${encodeURIComponent(
              languageName
            )}`
          : `${CONFIG.PHP_SERVER_URL}?action=data&id=${encodeURIComponent(
              languageName
            )}&version=${version}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      console.error("Error downloading server file:", error);
      throw error;
    }
  }

  async validateServerFile(languageName) {
    try {
      const csvContent = await this.downloadServerFile(languageName);
      const serverData = parseCSV(csvContent);

      // Process the server file like a user upload
      this.uploadedData = serverData;
      const report = this.compareAndGenerateReport();

      // Check if server file has been merged
      const mergeStatus = await this.checkMergeStatus(serverData, languageName);

      return {
        report,
        mergeStatus,
        csvContent,
      };
    } catch (error) {
      console.error("Error validating server file:", error);
      throw error;
    }
  }

  async checkMergeStatus(serverData, languageName) {
    // Create a map of server data by termID
    const serverDataMap = {};
    serverData.forEach((row) => {
      if (row.termID && row[languageName] && row[languageName].trim()) {
        serverDataMap[row.termID] = row[languageName];
      }
    });

    // Check against main sheet data
    let allMerged = true;
    let checkedTerms = 0;

    for (const latestRow of this.data) {
      const termID = latestRow.termID;
      if (!termID || latestRow.shouldBeTranslated === "FALSE") continue;

      const serverTranslation = serverDataMap[termID];
      const latestTranslation = latestRow[languageName];

      if (serverTranslation) {
        checkedTerms++;
        if (serverTranslation !== latestTranslation) {
          allMerged = false;
          break;
        }
      }
    }

    return {
      isMerged: allMerged && checkedTerms > 0,
      checkedTerms,
    };
  }

  showStatus(message) {
    const status = document.getElementById("status");
    status.textContent = message;
    status.classList.remove("hidden");
  }

  hideStatus() {
    document.getElementById("status").classList.add("hidden");
  }

  showStep(stepNumber) {
    document.querySelectorAll(".step").forEach((step) => {
      step.classList.remove("active");
    });

    document.getElementById(`step${stepNumber}`).classList.add("active");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new LocalisationManager();
});
