import { fetchGoogleSheetsData } from "./dataFetcher.js";
import { CONFIG } from "./config.js";

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

    const firstRow = this.data[0];
    this.availableLanguages = Object.keys(firstRow).filter(
      (key) =>
        key !== "termID" &&
        key !== "notes" &&
        key !== "shouldBeTranslated" &&
        key !== "translationNeedsToBeUpdated" &&
        key !== "English" &&
        key.trim() !== ""
    );
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
      this.uploadedData = this.parseCSV(csvText);
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

  parseCSV(csvText) {
    const lines = csvText.trim().split("\n");
    if (lines.length === 0) return [];

    const headers = this.parseCSVLine(lines[0]);
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      data.push(row);
    }

    return data;
  }

  parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim().replace(/^"|"$/g, ""));
    return result;
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

        if (userEnglish !== latestEnglish) {
          // English changed, translation needs update
          if (userLanguageText) {
            translationNeedsToBeUpdated = "TRUE";
            needsUpdate.push(termID);
            languageText = userLanguageText; // Keep their translation but mark for update
          } else {
            needsTranslation.push(termID);
            languageText = ""; // No translation to keep
          }
        } else {
          // English same, keep their translation
          languageText = userLanguageText;
          if (!userLanguageText) {
            needsTranslation.push(termID);
          }
        }
      } else {
        // termID doesn't exist in user file
        if (!latestLanguageText) {
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
      needsUpdate,
      totalNeedsTranslation: needsTranslation.length,
      totalNeedsUpdate: needsUpdate.length,
    };
  }

  displayReport(report) {
    const reportContent = document.getElementById("reportContent");

    const html = `
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
              ${report.needsTranslation.join("\n")}
            </div>
          </div>
        `
            : ""
        }
        
        ${
          report.totalNeedsUpdate > 0
            ? `
          <div class="spoiler">
            <button class="spoiler-toggle" onclick="this.nextElementSibling.classList.toggle('show')">
              Show terms needing updates (${report.totalNeedsUpdate})
            </button>
            <div class="spoiler-content">
              ${report.needsUpdate.join("\n")}
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

    const headers = [
      "termID",
      "notes",
      "shouldBeTranslated",
      "translationNeedsToBeUpdated",
      "English",
      language,
    ];
    const rows = [headers];

    this.data.forEach((row) => {
      if (row.shouldBeTranslated === "TRUE") {
        rows.push([
          row.termID || "",
          row.notes || "",
          "TRUE",
          "FALSE",
          row.English || "",
          row[language] || "",
        ]);
      }
    });

    return rows
      .map((row) =>
        row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
  }

  generateProcessedCSV() {
    if (!this.processedData) return "";

    const headers = [
      "termID",
      "notes",
      "shouldBeTranslated",
      "translationNeedsToBeUpdated",
      "English",
      this.selectedLanguage,
    ];
    const rows = [headers];

    this.processedData.forEach((row) => {
      rows.push([
        row.termID || "",
        row.notes || "",
        row.shouldBeTranslated || "",
        row.translationNeedsToBeUpdated || "",
        row.English || "",
        row[this.selectedLanguage] || "",
      ]);
    });

    return rows
      .map((row) =>
        row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
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
