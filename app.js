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
import { csvToXlsx, xlsxToCsv } from "./converter.js";
import { checkMergeStatus } from "./mergeChecker.js";

class LocalisationManager {
  constructor() {
    this.data = null;
    this.selectedLanguage = null;
    this.availableLanguages = [];
    this.uploadedData = null;
    this.processedData = null;
    this.serverFiles = null;
    this.lqaDifferences = []; // Track LQA differences for review
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
      .getElementById("lqaCheckbox")
      .addEventListener("change", (e) => this.onLqaCheckboxChange(e));
    document
      .getElementById("downloadLatestCsvBtn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.downloadLatestVersion("csv");
      });
    document
      .getElementById("downloadLatestXlsxBtn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.downloadLatestVersion("xlsx");
      });
    document
      .getElementById("fileInput")
      .addEventListener("change", (e) => this.handleFileSelection(e));
    document
      .getElementById("downloadProcessedCsvBtn")
      .addEventListener("click", () => this.downloadProcessedFile("csv"));
    document
      .getElementById("downloadProcessedXlsxBtn")
      .addEventListener("click", () => this.downloadProcessedFile("xlsx"));
    document
      .getElementById("backToLanguageBtn")
      .addEventListener("click", () => this.goBackToLanguageSelection());
    document
      .getElementById("tutorialToggle")
      .addEventListener("click", () => this.toggleTutorial());

    // LQA event listeners
    document
      .getElementById("acceptAllLQABtn")
      .addEventListener("click", () => this.acceptAllLQASuggestions());
    document
      .getElementById("rejectAllLQABtn")
      .addEventListener("click", () => this.rejectAllLQASuggestions());
    document
      .getElementById("continueLQABtn")
      .addEventListener("click", () => this.continueFromLQA());

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

    // Restore saved state
    this.restoreState();
  }

  saveState() {
    const state = {
      selectedLanguage: this.selectedLanguage,
      isLqaFile: document.getElementById("lqaCheckbox").checked,
    };
    localStorage.setItem("localisationManagerState", JSON.stringify(state));
  }

  restoreState() {
    try {
      const savedState = localStorage.getItem("localisationManagerState");
      if (savedState) {
        const state = JSON.parse(savedState);

        // Restore language selection
        if (
          state.selectedLanguage &&
          this.availableLanguages.includes(state.selectedLanguage)
        ) {
          document.getElementById("languageSelect").value =
            state.selectedLanguage;
          this.selectedLanguage = state.selectedLanguage;
        }

        // Restore LQA checkbox
        if (state.isLqaFile !== undefined) {
          document.getElementById("lqaCheckbox").checked = state.isLqaFile;
          updateTutorial();
        }

        // Trigger language change to show the appropriate UI elements
        if (this.selectedLanguage) {
          this.onLanguageChange({ target: { value: this.selectedLanguage } });
        }
      }
    } catch (error) {
      console.error("Error restoring state:", error);
    }
  }

  onLqaCheckboxChange(e) {
    this.saveState();

    // If a language is selected, reload server files with the new file ID
    if (this.selectedLanguage) {
      this.loadServerFiles();
    }
  }

  getFileId() {
    const isLqaFile = document.getElementById("lqaCheckbox").checked;
    return isLqaFile ? `LQA_${this.selectedLanguage}` : this.selectedLanguage;
  }

  onLanguageChange(e) {
    const actionsArea = document.getElementById("actionsArea");
    const dropZone = document.getElementById("dropZone");

    if (e.target.value) {
      this.selectedLanguage = e.target.value;
      document.getElementById("selectedLanguageNameCsv").textContent =
        this.selectedLanguage;
      document.getElementById("selectedLanguageNameXlsx").textContent =
        this.selectedLanguage;

      // Save state
      this.saveState();

      // Show actions area and drop zone
      actionsArea.classList.remove("hidden");
      dropZone.classList.remove("hidden");

      // Load server files
      this.loadServerFiles();
    } else {
      this.selectedLanguage = null;

      // Save state
      this.saveState();

      // Hide actions area and drop zone
      actionsArea.classList.add("hidden");
      dropZone.classList.add("hidden");
    }
  }

  async loadServerFiles() {
    const serverFilesSection = document.getElementById("serverFilesSection");
    const serverFilesContent = document.getElementById("serverFilesContent");

    try {
      const fileId = this.getFileId();
      const result = await this.getServerFiles(fileId);
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
    const fileId = this.getFileId();

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
          <button class="server-file-btn" onclick="window.localisationManager.downloadServerFileToUser('${fileId}', '${
      file.version
    }', 'csv')">
            CSV
          </button>
          <button class="server-file-btn" onclick="window.localisationManager.downloadServerFileToUser('${fileId}', '${
      file.version
    }', 'xlsx')">
            XLSX
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
      const fileId = this.getFileId();
      const csvContent = await this.downloadServerFile(fileId);
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
    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith(".csv");
    const isXLSX = fileName.endsWith(".xlsx");

    if (!isCSV && !isXLSX) {
      alert("Please upload a CSV or XLSX file");
      return;
    }

    this.showStatus("Processing uploaded file...");

    try {
      // Reset flag since this is a user upload
      this.isValidatingServerFile = false;

      let csvText;

      if (isXLSX) {
        // Convert XLSX to CSV first
        this.showStatus("Converting XLSX to CSV...");

        const expectedHeaders = [
          "termID",
          "notes",
          "shouldBeTranslated",
          "translationNeedsToBeUpdated",
          "English",
        ];
        csvText = await xlsxToCsv(file, {
          expectedHeaders: expectedHeaders,
          findMatchingSheet: true,
          returnString: true,
          onProgress: (progress) => {
            this.showStatus(`Converting XLSX to CSV... ${progress}%`);
          },
        });

        this.showStatus("Processing converted CSV data...");
      } else {
        // Read CSV file directly
        csvText = await this.readFileAsText(file);
      }

      this.uploadedData = parseCSV(csvText);

      // Check for LQA comparison if not in LQA mode
      const isLqaMode = document.getElementById("lqaCheckbox").checked;
      if (!isLqaMode) {
        const lqaDifferences = await this.checkForLQADifferences();
        if (lqaDifferences.length > 0) {
          this.lqaDifferences = lqaDifferences;
          this.showLQADifferencesStep();
          return;
        }
      }

      // Proceed with normal report generation
      this.generateAndShowReport();
    } catch (error) {
      this.showStatus(`Error processing file: ${error.message}`);
    }
  }

  generateAndShowReport() {
    const report = this.compareAndGenerateReport();
    this.displayReport(report);
    this.showStep(3);
    this.hideStatus();
  }

  async checkForLQADifferences() {
    try {
      const lqaFileId = `LQA_${this.selectedLanguage}`;
      const lqaCsvContent = await this.downloadServerFile(lqaFileId);
      const lqaData = parseCSV(lqaCsvContent);

      // Create maps for easier comparison
      const userDataMap = {};
      this.uploadedData.forEach((row) => {
        if (row.termID) {
          userDataMap[row.termID] = row;
        }
      });

      const lqaDataMap = {};
      lqaData.forEach((row) => {
        if (row.termID) {
          lqaDataMap[row.termID] = row;
        }
      });

      const differences = [];

      // Compare LQA data with user data
      Object.keys(lqaDataMap).forEach((termID) => {
        const lqaRow = lqaDataMap[termID];
        const userRow = userDataMap[termID];
        const lqaTranslation = lqaRow[this.selectedLanguage] || "";
        const userTranslation = userRow
          ? userRow[this.selectedLanguage] || ""
          : "";

        // Check if LQA has a non-empty value that's different from user's value
        if (lqaTranslation.trim() && lqaTranslation !== userTranslation) {
          differences.push({
            termID: termID,
            english: lqaRow.English || "",
            userTranslation: userTranslation,
            lqaTranslation: lqaTranslation,
            notes: lqaRow.notes || "",
          });
        }
      });

      return differences;
    } catch (error) {
      // If LQA file doesn't exist or can't be fetched, return empty array
      console.log("No LQA file found or error fetching LQA file:", error);
      return [];
    }
  }

  showLQADifferencesStep() {
    const lqaHeader = document.getElementById("lqaHeader");
    const lqaContent = document.getElementById("lqaContent");

    lqaHeader.textContent = `LQA Suggestions Found for ${this.selectedLanguage}`;

    let html = '<div class="lqa-suggestions-container">';

    this.lqaDifferences.forEach((diff, index) => {
      html += this.generateLQASuggestionHTML(diff, index);
    });

    html += "</div>";
    lqaContent.innerHTML = html;

    // Initialize the continue button state
    this.checkLQACompletion();

    this.showStep("LQA");
    this.hideStatus();
  }

  generateLQASuggestionHTML(diff, index) {
    // Use existing diff system to compare translations
    const diffSummary = getDiffSummary(
      diff.userTranslation || "",
      diff.lqaTranslation || ""
    );

    // Determine if multiline for diff rendering
    const isMultiline =
      (diff.userTranslation || "").includes("\n") ||
      (diff.lqaTranslation || "").includes("\n");

    let diffContent = "";

    if (isMultiline) {
      // For multiline: Use enhanced diff
      const enhancedDiff = generateEnhancedLineDiff(
        diff.userTranslation || "",
        diff.lqaTranslation || ""
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
        diff.userTranslation || "",
        diff.lqaTranslation || ""
      );
      const charDiffHTML = this.generateCharDiffHTML(charDiff);

      diffContent = `
        <div class="diff-container">
          ${charDiffHTML}
        </div>
      `;
    }

    return `
      <div class="lqa-suggestion" id="lqa-suggestion-${index}">
        <div class="lqa-suggestion-header" onclick="window.localisationManager.toggleLQASuggestion(${index})">
          <div style="display: flex; align-items: center;">
            <div class="lqa-term-id">${diff.termID}</div>
            <div class="lqa-header-summary" id="lqa-header-summary-${index}"></div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="lqa-status" id="lqa-status-${index}" style="display: none;"></div>
            <span class="lqa-expand-icon">▼</span>
          </div>
        </div>
        
        <div class="lqa-content">
          <div class="lqa-english-label">English Text:</div>
          <div class="lqa-english">${this.escapeHtml(diff.english)}</div>
          
          <div class="diff-summary" style="margin: 1rem 0;">
            ${diffSummary.message}
          </div>
          
          <div class="diff-header">
            <span class="diff-label">Translation Changes</span>
            <div class="copy-buttons">
              <button class="copy-btn" onclick="copyToClipboard(\`${this.escapeForAttribute(
                diff.userTranslation || ""
              )}\`, 'old', this)" title="Copy your translation">
                📋 Copy Yours
              </button>
              <button class="copy-btn" onclick="copyToClipboard(\`${this.escapeForAttribute(
                diff.lqaTranslation || ""
              )}\`, 'new', this)" title="Copy LQA suggestion">
                📋 Copy LQA
              </button>
            </div>
          </div>
          
          ${diffContent}
          
          ${
            diff.notes
              ? `<div class="lqa-notes" style="margin-top: 1rem; padding: 0.5rem; background: var(--secondary-bg); border-radius: 4px;"><strong>Notes:</strong> ${this.escapeHtml(
                  diff.notes
                )}</div>`
              : ""
          }
          
          <div class="lqa-actions">
            <button class="lqa-btn lqa-btn-accept" onclick="window.localisationManager.acceptLQASuggestion(${index})">
              ✓ Accept LQA Suggestion
            </button>
            <button class="lqa-btn lqa-btn-reject" onclick="window.localisationManager.rejectLQASuggestion(${index})">
              ✗ Keep Your Translation
            </button>
          </div>
        </div>
      </div>
    `;
  }

  toggleLQASuggestion(index) {
    const suggestionElement = document.getElementById(
      `lqa-suggestion-${index}`
    );
    suggestionElement.classList.toggle("collapsed");
  }

  acceptLQASuggestion(index) {
    const diff = this.lqaDifferences[index];
    const suggestionElement = document.getElementById(
      `lqa-suggestion-${index}`
    );
    const statusElement = document.getElementById(`lqa-status-${index}`);
    const headerSummary = document.getElementById(
      `lqa-header-summary-${index}`
    );
    const actionsElement = suggestionElement.querySelector(".lqa-actions");

    // Mark as accepted
    diff.status = "accepted";
    suggestionElement.classList.add("accepted");
    suggestionElement.classList.add("collapsed");

    // Update the user data with the LQA suggestion
    const userDataMap = {};
    this.uploadedData.forEach((row) => {
      if (row.termID) {
        userDataMap[row.termID] = row;
      }
    });

    if (userDataMap[diff.termID]) {
      userDataMap[diff.termID][this.selectedLanguage] = diff.lqaTranslation;
    } else {
      // Create new row if it doesn't exist
      const newRow = {
        termID: diff.termID,
        English: diff.english,
        notes: diff.notes,
        shouldBeTranslated: "TRUE",
        translationNeedsToBeUpdated: "FALSE",
      };
      newRow[this.selectedLanguage] = diff.lqaTranslation;
      this.uploadedData.push(newRow);
    }

    // Update UI
    statusElement.textContent = "Accepted";
    statusElement.className = "lqa-status accepted";
    statusElement.style.display = "block";
    headerSummary.textContent = "LQA suggestion accepted";

    // Allow changing decision
    actionsElement.innerHTML = `
      <button class="lqa-btn" onclick="window.localisationManager.changeLQADecision(${index})" style="background: var(--accent-color);">
        Change Decision
      </button>
    `;

    this.checkLQACompletion();
  }

  rejectLQASuggestion(index) {
    const diff = this.lqaDifferences[index];
    const suggestionElement = document.getElementById(
      `lqa-suggestion-${index}`
    );
    const statusElement = document.getElementById(`lqa-status-${index}`);
    const headerSummary = document.getElementById(
      `lqa-header-summary-${index}`
    );
    const actionsElement = suggestionElement.querySelector(".lqa-actions");

    // Mark as rejected
    diff.status = "rejected";
    suggestionElement.classList.add("rejected");
    suggestionElement.classList.add("collapsed");

    // Update UI
    statusElement.textContent = "Rejected";
    statusElement.className = "lqa-status rejected";
    statusElement.style.display = "block";
    headerSummary.textContent = "Your translation kept";

    // Allow changing decision
    actionsElement.innerHTML = `
      <button class="lqa-btn" onclick="window.localisationManager.changeLQADecision(${index})" style="background: var(--accent-color);">
        Change Decision
      </button>
    `;

    this.checkLQACompletion();
  }

  changeLQADecision(index) {
    const diff = this.lqaDifferences[index];
    const suggestionElement = document.getElementById(
      `lqa-suggestion-${index}`
    );
    const statusElement = document.getElementById(`lqa-status-${index}`);
    const headerSummary = document.getElementById(
      `lqa-header-summary-${index}`
    );
    const actionsElement = suggestionElement.querySelector(".lqa-actions");

    // Store previous status for data reversion
    const previousStatus = diff.status;

    // Reset status
    diff.status = null;
    suggestionElement.classList.remove("accepted", "rejected", "collapsed");
    statusElement.style.display = "none";
    headerSummary.textContent = "";

    // Restore original action buttons
    actionsElement.innerHTML = `
      <button class="lqa-btn lqa-btn-accept" onclick="window.localisationManager.acceptLQASuggestion(${index})">
        ✓ Accept LQA Suggestion
      </button>
      <button class="lqa-btn lqa-btn-reject" onclick="window.localisationManager.rejectLQASuggestion(${index})">
        ✗ Keep Your Translation
      </button>
    `;

    // If it was accepted, revert the data change
    if (previousStatus === "accepted") {
      const userDataMap = {};
      this.uploadedData.forEach((row) => {
        if (row.termID) {
          userDataMap[row.termID] = row;
        }
      });

      if (userDataMap[diff.termID]) {
        userDataMap[diff.termID][this.selectedLanguage] =
          diff.userTranslation || "";
      }
    }

    this.checkLQACompletion();
  }

  checkLQACompletion() {
    const unprocessedDiffs = this.lqaDifferences.filter((diff) => !diff.status);
    const continueBtn = document.getElementById("continueLQABtn");
    const acceptAllBtn = document.getElementById("acceptAllLQABtn");
    const rejectAllBtn = document.getElementById("rejectAllLQABtn");

    // Update continue button
    if (unprocessedDiffs.length === 0) {
      continueBtn.textContent = "✓ Continue to Report";
      continueBtn.classList.add("btn-link");
      continueBtn.disabled = false;
    } else {
      continueBtn.textContent = `Continue to Report (${unprocessedDiffs.length} pending)`;
      continueBtn.classList.remove("btn-link");
      continueBtn.disabled = true;
    }

    // Update accept all and reject all buttons
    if (unprocessedDiffs.length === 0) {
      acceptAllBtn.textContent = "✓ Accept All (0)";
      acceptAllBtn.disabled = true;
      rejectAllBtn.textContent = "✗ Reject All (0)";
      rejectAllBtn.disabled = true;
    } else {
      acceptAllBtn.textContent = `✓ Accept All (${unprocessedDiffs.length})`;
      acceptAllBtn.disabled = false;
      rejectAllBtn.textContent = `✗ Reject All (${unprocessedDiffs.length})`;
      rejectAllBtn.disabled = false;
    }
  }

  acceptAllLQASuggestions() {
    this.lqaDifferences.forEach((diff, index) => {
      if (!diff.status) {
        this.acceptLQASuggestion(index);
      }
    });
  }

  rejectAllLQASuggestions() {
    this.lqaDifferences.forEach((diff, index) => {
      if (!diff.status) {
        this.rejectLQASuggestion(index);
      }
    });
  }

  continueFromLQA() {
    // Check if we're validating a server file and if any LQA suggestions were accepted
    if (this.isValidatingServerFile) {
      const acceptedSuggestions = this.lqaDifferences.filter(
        (diff) => diff.status === "accepted"
      );

      if (acceptedSuggestions.length > 0) {
        // Upload the updated file back to server since LQA suggestions were accepted
        this.uploadUpdatedServerFile();
        return;
      }
    }

    // Proceed with normal report generation using the updated data
    this.generateAndShowReport();
  }

  async uploadUpdatedServerFile() {
    try {
      this.showStatus("Uploading updated file to server...");

      // Generate CSV from the updated uploadedData (which contains LQA changes)
      const csv = generateLocalizationCSV(this.uploadedData, [
        this.selectedLanguage,
      ]);
      const fileId = this.getFileId();
      await this.uploadToServer(csv, fileId);

      this.showStatus("✅ File updated successfully! Generating report...");

      // Small delay to show success message, then proceed with report
      setTimeout(() => {
        this.generateAndShowReport();
      }, 1000);
    } catch (error) {
      console.error("Failed to upload updated server file:", error);
      this.showStatus(
        `❌ Upload failed: ${error.message}. Continuing with report...`
      );

      // Continue with report even if upload failed
      setTimeout(() => {
        this.generateAndShowReport();
      }, 2000);
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

  downloadLatestVersion(format = "csv") {
    if (!this.selectedLanguage || !this.data) {
      alert("No language or data available");
      return;
    }

    this.showStatus(`Generating latest version ${format.toUpperCase()}...`);

    setTimeout(async () => {
      try {
        const csv = this.generateLatestVersionCSV(this.selectedLanguage);

        if (format === "xlsx") {
          await csvToXlsx(csv, {
            filename: `${this.selectedLanguage}_latest.xlsx`,
            title: this.selectedLanguage,
            csvSeparator: ",",
            creator: "NPO Localisation Manager",
            subject: `Latest ${this.selectedLanguage} translations`,
          });
        } else {
          this.downloadFile(csv, `${this.selectedLanguage}_latest.csv`);
        }

        this.hideStatus();
      } catch (error) {
        this.showStatus(
          `Error generating ${format.toUpperCase()}: ${error.message}`
        );
        console.error(`Download ${format} error:`, error);
      }
    }, 500);
  }

  showFileUpload() {
    document.getElementById("fileUploadArea").classList.remove("hidden");
  }

  async processUploadedFile() {
    const fileInput = document.getElementById("fileInputVisible");
    const file = fileInput.files[0];

    if (!file) {
      alert("Please select a CSV or XLSX file");
      return;
    }

    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith(".csv");
    const isXLSX = fileName.endsWith(".xlsx");

    if (!isCSV && !isXLSX) {
      alert("Please upload a CSV or XLSX file");
      return;
    }

    this.showStatus("Processing uploaded file...");

    try {
      let csvText;

      if (isXLSX) {
        // Convert XLSX to CSV first
        this.showStatus("Converting XLSX to CSV...");

        const expectedHeaders = [
          "termID",
          "notes",
          "shouldBeTranslated",
          "translationNeedsToBeUpdated",
          "English",
        ];
        csvText = await xlsxToCsv(file, {
          expectedHeaders: expectedHeaders,
          findMatchingSheet: true,
          returnString: true,
          onProgress: (progress) => {
            this.showStatus(`Converting XLSX to CSV... ${progress}%`);
          },
        });

        this.showStatus("Processing converted CSV data...");
      } else {
        // Read CSV file directly
        csvText = await this.readFileAsText(file);
      }

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

  compareAndGenerateReport() {
    const latestData = this.data;
    const userLang = this.selectedLanguage;
    const userData = this.uploadedData;
    const isLqaMode = document.getElementById("lqaCheckbox").checked;

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

          if (isLqaMode) {
            // For LQA files: Skip missing terms entirely
            return; // Don't add this term to processedRows
          } else {
            // For regular files: Check if this term already has a translation in the latest data
            if (latestLanguageText) {
              missingTermsFoundInLatest.push(termID);
              languageText = latestLanguageText; // Keep the latest translation
            } else {
              needsTranslation.push(termID);
              languageText = ""; // No translation available
            }
          }
        }
      } else {
        // termID doesn't exist in user file
        if (isLqaMode) {
          // For LQA files: Skip missing terms entirely
          return; // Don't add this term to processedRows
        } else {
          // For regular files: Add missing terms
          if (latestLanguageText) {
            missingTermsFoundInLatest.push(termID);
            languageText = latestLanguageText; // Keep the latest translation
          } else {
            needsTranslation.push(termID);
            languageText = "";
          }
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
        .getElementById("downloadProcessedCsvBtn")
        .classList.remove("hidden");
      document
        .getElementById("downloadProcessedXlsxBtn")
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
        <div id="upload-status" style="margin-top: 1rem;"></div>
        
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
    document
      .getElementById("downloadProcessedCsvBtn")
      .classList.remove("hidden");
    document
      .getElementById("downloadProcessedXlsxBtn")
      .classList.remove("hidden");

    // Auto-upload incomplete files for user uploads (not server file validations)
    if (!this.isValidatingServerFile) {
      this.autoUploadToServer();
    }
  }

  async autoUploadToServer() {
    const uploadStatus = document.getElementById("upload-status");

    try {
      uploadStatus.innerHTML =
        '<p style="color: var(--link-color);">📤 Uploading to server...</p>';

      const csv = this.generateProcessedCSV();
      const fileId = this.getFileId();
      await this.uploadToServer(csv, fileId);

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

  downloadProcessedFile(format = "csv") {
    if (!this.processedData) {
      alert("No processed data available");
      return;
    }

    this.showStatus(`Generating processed ${format.toUpperCase()}...`);

    setTimeout(async () => {
      try {
        const csv = this.generateProcessedCSV();

        if (format === "xlsx") {
          await csvToXlsx(csv, {
            filename: `${this.selectedLanguage}_updated.xlsx`,
            title: this.selectedLanguage,
            csvSeparator: ",",
            creator: "NPO Localisation Manager",
            subject: `Updated ${this.selectedLanguage} translations`,
          });
        } else {
          this.downloadFile(csv, `${this.selectedLanguage}_updated.csv`);
        }

        this.hideStatus();
      } catch (error) {
        this.showStatus(
          `Error generating ${format.toUpperCase()}: ${error.message}`
        );
        console.error(`Download ${format} error:`, error);
      }
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
    this.lqaDifferences = []; // Clear LQA differences

    // Reset file input
    document.getElementById("fileInput").value = "";

    // Hide download buttons
    document.getElementById("downloadProcessedCsvBtn").classList.add("hidden");
    document.getElementById("downloadProcessedXlsxBtn").classList.add("hidden");

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
  async downloadServerFileToUser(fileId, version, format = "csv") {
    try {
      this.showStatus(
        `Downloading ${
          version === "current" ? "current" : `backup ${version}`
        } file as ${format.toUpperCase()}...`
      );

      const csvContent = await this.downloadServerFile(fileId, version);
      const baseFilename =
        version === "current"
          ? `${fileId}_server_current`
          : `${fileId}_server_backup_${version}`;

      if (format === "xlsx") {
        await csvToXlsx(csvContent, {
          filename: `${baseFilename}.xlsx`,
          title: this.selectedLanguage || fileId,
          csvSeparator: ",",
          creator: "NPO Localisation Manager",
          subject: `Server file: ${fileId} (${version})`,
        });
      } else {
        this.downloadFile(csvContent, `${baseFilename}.csv`);
      }

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

      const fileId = this.getFileId();
      const validation = await this.validateServerFile(fileId);

      // Set the uploaded data to the server data for comparison
      this.uploadedData = parseCSV(validation.csvContent);

      // Check for LQA comparison if not in LQA mode
      const isLqaMode = document.getElementById("lqaCheckbox").checked;
      if (!isLqaMode) {
        const lqaDifferences = await this.checkForLQADifferences();
        if (lqaDifferences.length > 0) {
          this.lqaDifferences = lqaDifferences;
          this.showLQADifferencesStep();
          // Update header to indicate this is server file validation with LQA
          const lqaHeader = document.getElementById("lqaHeader");
          lqaHeader.textContent = `LQA Suggestions Found for Server File (${this.selectedLanguage})`;
          return;
        }
      }

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
  async uploadToServer(csvContent, fileId) {
    const formData = new FormData();
    const blob = new Blob([csvContent], { type: "text/csv" });
    formData.append("file", blob, `${fileId}.csv`);

    try {
      const response = await fetch(
        `${CONFIG.PHP_SERVER_URL}?action=upload&id=${encodeURIComponent(
          fileId
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

  async getServerFiles(fileId) {
    try {
      const response = await fetch(
        `${CONFIG.PHP_SERVER_URL}?action=backups&id=${encodeURIComponent(
          fileId
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

  async downloadServerFile(fileId, version = "current") {
    try {
      const url =
        version === "current"
          ? `${CONFIG.PHP_SERVER_URL}?action=data&id=${encodeURIComponent(
              fileId
            )}`
          : `${CONFIG.PHP_SERVER_URL}?action=data&id=${encodeURIComponent(
              fileId
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

  async validateServerFile(fileId) {
    try {
      const csvContent = await this.downloadServerFile(fileId);
      const serverData = parseCSV(csvContent);

      // Process the server file like a user upload
      this.uploadedData = serverData;
      const report = this.compareAndGenerateReport();

      // Check if server file has been merged
      const mergeStatus = await this.checkMergeStatus(
        serverData,
        this.selectedLanguage
      );

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
    // If we're not in LQA mode, try to get LQA data for this language
    let lqaData = null;
    const isLqaMode = document.getElementById("lqaCheckbox").checked;

    if (!isLqaMode) {
      try {
        const lqaFileId = `LQA_${languageName}`;
        const lqaCsvContent = await this.downloadServerFile(lqaFileId);
        lqaData = parseCSV(lqaCsvContent);
      } catch (error) {
        // LQA file doesn't exist or can't be fetched - this is normal
        console.log("No LQA file found or error fetching LQA file:", error);
        lqaData = null;
      }
    }

    return checkMergeStatus(serverData, languageName, this.data, lqaData);
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

    const stepId = stepNumber === "LQA" ? "stepLQA" : `step${stepNumber}`;
    document.getElementById(stepId).classList.add("active");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new LocalisationManager();
});
