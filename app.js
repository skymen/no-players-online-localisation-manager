import { fetchGoogleSheetsData } from "./dataFetcher.js";
import { CONFIG } from "./config.js";

class LocalisationManager {
  constructor() {
    this.data = null;
    this.selectedLanguage = null;
    this.availableLanguages = [];
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
      .getElementById("downloadBtn")
      .addEventListener("click", () => this.downloadCSV());
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

  downloadCSV() {
    if (!this.selectedLanguage || !this.data) {
      alert("No language or data available");
      return;
    }

    this.showStatus("Generating CSV file...");

    setTimeout(() => {
      const csv = this.generateLanguageCSV(this.selectedLanguage);
      this.downloadFile(csv, `${this.selectedLanguage}_translation.csv`);
      this.hideStatus();
    }, 500);
  }

  generateLanguageCSV(language) {
    if (!this.data) return "";

    const headers = ["termID", "English", language, "notes"];
    const rows = [headers];

    this.data.forEach((row) => {
      if (row.shouldBeTranslated === "TRUE") {
        rows.push([
          row.termID || "",
          row.English || "",
          row[language] || "",
          row.notes || "",
        ]);
      }
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
