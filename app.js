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
    this.init();
  }

  init() {
    this.bindEvents();
    this.fetchDataAutomatically();
  }

  bindEvents() {
    document
      .getElementById("languageSelect")
      .addEventListener("change", (e) => this.onLanguageChange(e));
    document
      .getElementById("confirmLanguageBtn")
      .addEventListener("click", () => this.confirmLanguage());
    document
      .getElementById("addNewLanguageBtn")
      .addEventListener("click", () => this.showAddLanguageForm());
    document
      .getElementById("submitNewLanguageBtn")
      .addEventListener("click", () => this.addNewLanguage());
    document
      .getElementById("downloadLatestBtn")
      .addEventListener("click", () => this.downloadLatestVersion());
    document
      .getElementById("uploadFileBtn")
      .addEventListener("click", () => this.showFileUpload());
    document
      .getElementById("processFileBtn")
      .addEventListener("click", () => this.processUploadedFile());
    document
      .getElementById("downloadProcessedBtn")
      .addEventListener("click", () => this.downloadProcessedFile());
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
    const confirmBtn = document.getElementById("confirmLanguageBtn");
    if (e.target.value) {
      confirmBtn.disabled = false;
      this.selectedLanguage = e.target.value;
    } else {
      confirmBtn.disabled = true;
      this.selectedLanguage = null;
    }
  }

  confirmLanguage() {
    if (this.selectedLanguage) {
      document.getElementById("selectedLanguageName").textContent =
        this.selectedLanguage;
      this.showStep(3);
    }
  }

  showAddLanguageForm() {
    document.getElementById("addLanguageForm").classList.add("show");
  }

  addNewLanguage() {
    const input = document.getElementById("newLanguageName");
    const languageName = input.value.trim();

    if (!languageName) {
      alert("Please enter a language name");
      return;
    }

    if (this.availableLanguages.includes(languageName)) {
      alert("This language already exists");
      return;
    }

    this.availableLanguages.push(languageName);
    this.populateLanguageDropdown();

    const select = document.getElementById("languageSelect");
    select.value = languageName;
    this.selectedLanguage = languageName;

    document.getElementById("confirmLanguageBtn").disabled = false;
    document.getElementById("addLanguageForm").classList.remove("show");
    input.value = "";
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
    const needsUpdate = [];
    const needsUpdateDetails = []; // New: Store detailed info for diff view
    const processedRows = [];

    latestData.forEach((latestRow) => {
      const termID = latestRow.termID;
      if (!termID || latestRow.shouldBeTranslated !== "TRUE") return;

      const userRow = userDataMap[termID];
      const latestEnglish = latestRow.English || "";
      const latestLanguageText = latestRow[userLang] || "";

      let shouldBeTranslated = "TRUE";
      let translationNeedsToBeUpdated = "FALSE";
      let languageText = latestLanguageText;

      if (userRow) {
        const userEnglish = userRow.English || "";
        const userLanguageText = userRow[userLang] || "";

        // If user has provided a translation, shouldBeTranslated = FALSE
        if (userLanguageText) {
          shouldBeTranslated = "FALSE";
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
          // User didn't provide translation, needs translation
          shouldBeTranslated = "TRUE";
          translationNeedsToBeUpdated = "FALSE";
          needsTranslation.push(termID);
          languageText = ""; // No translation from user
        }
      } else {
        // termID doesn't exist in user file, needs translation
        shouldBeTranslated = "TRUE";
        translationNeedsToBeUpdated = "FALSE";
        needsTranslation.push(termID);
        languageText = "";
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
      needsUpdate,
      needsUpdateDetails, // New: Include detailed info
      totalNeedsTranslation: needsTranslation.length,
      totalNeedsUpdate: needsUpdate.length,
    };
  }

  displayReport(report) {
    const reportContent = document.getElementById("reportContent");

    // Check if no updates or translations are needed
    if (report.totalNeedsTranslation === 0 && report.totalNeedsUpdate === 0) {
      const html = `
        <div class="report">
          <h4>🎉 Translation Complete for ${this.selectedLanguage}!</h4>
          <p style="color: var(--link-color); font-size: 1.1rem; margin-bottom: 1rem;">
            <strong>Excellent work!</strong> All translations are up to date.
          </p>
          <p>Your translation file is complete and ready for use. Please download the final file and send it to the development team.</p>
          <p style="margin-top: 1rem; padding: 1rem; background: var(--secondary-bg); border-radius: 4px; border-left: 4px solid var(--link-color);">
            📧 <strong>Next step:</strong> Download the file below and send it to the project maintainer.
          </p>
        </div>
      `;
      reportContent.innerHTML = html;
      document
        .getElementById("downloadProcessedBtn")
        .classList.remove("hidden");
      return;
    }

    // Regular report when translations/updates are needed
    let html = `
      <div class="report">
        <h4>Translation Report for ${this.selectedLanguage}</h4>
        <p><strong>${
          report.totalNeedsTranslation
        }</strong> terms need translation</p>
        <p><strong>${report.totalNeedsUpdate}</strong> terms need updates</p>
        
        ${
          report.totalNeedsTranslation > 0
            ? `
          <div class="spoiler">
            <button class="spoiler-toggle" onclick="this.nextElementSibling.classList.toggle('show')">
              Show terms needing translation (${report.totalNeedsTranslation})
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
      .filter((row) => row.shouldBeTranslated === "TRUE")
      .map((row) => {
        const languageText = row[language] || "";

        // Logic for shouldBeTranslated: TRUE if the selected language doesn't have text
        const shouldBeTranslated = !languageText ? "TRUE" : "FALSE";

        // Logic for translationNeedsToBeUpdated:
        let translationNeedsToBeUpdated;
        if (isNewLanguage) {
          translationNeedsToBeUpdated = "FALSE";
        } else {
          translationNeedsToBeUpdated =
            shouldBeTranslated === "FALSE"
              ? row.translationNeedsToBeUpdated || "FALSE"
              : "FALSE";
        }

        return {
          termID: row.termID || "",
          notes: row.notes || "",
          shouldBeTranslated: shouldBeTranslated,
          translationNeedsToBeUpdated: translationNeedsToBeUpdated,
          English: row.English || "",
          [language]: languageText,
        };
      });

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
