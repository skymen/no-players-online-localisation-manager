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
    this.updateStepState();
  }

  bindEvents() {
    document
      .getElementById("fetchDataBtn")
      .addEventListener("click", () => this.fetchData());
    document
      .getElementById("addCustomLanguage")
      .addEventListener("click", () => this.showCustomLanguageForm());
    document
      .getElementById("addLanguageBtn")
      .addEventListener("click", () => this.addCustomLanguage());
    document
      .getElementById("downloadLatestBtn")
      .addEventListener("click", () => this.downloadLatestVersion());
    document
      .getElementById("uploadFileBtn")
      .addEventListener("click", () => this.showFileUpload());
    document
      .getElementById("dropZone")
      .addEventListener("click", () =>
        document.getElementById("fileInput").click()
      );
    document
      .getElementById("fileInput")
      .addEventListener("change", (e) => this.handleFileUpload(e));

    this.setupDragAndDrop();
  }

  setupDragAndDrop() {
    const dropZone = document.getElementById("dropZone");
    const fileUploadArea = document.getElementById("fileUploadArea");

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, () =>
        fileUploadArea.classList.add("dragover")
      );
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, () =>
        fileUploadArea.classList.remove("dragover")
      );
    });

    dropZone.addEventListener("drop", (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.processUploadedFile(files[0]);
      }
    });
  }

  showStatus(message, type = "loading") {
    const status = document.getElementById("status");
    status.textContent = message;
    status.className = `status ${type}`;
    status.classList.remove("hidden");
  }

  hideStatus() {
    document.getElementById("status").classList.add("hidden");
  }

  async fetchData() {
    try {
      this.showStatus("Fetching latest data from Google Sheets...", "loading");
      const button = document.getElementById("fetchDataBtn");
      button.disabled = true;
      button.textContent = "⏳ Fetching...";

      this.data = await fetchGoogleSheetsData();
      this.extractLanguages();
      this.populateLanguageSelector();

      this.showStatus("Data fetched successfully!", "success");
      setTimeout(() => this.hideStatus(), 2000);

      this.activateStep(2);
    } catch (error) {
      this.showStatus(`Error fetching data: ${error.message}`, "error");
      console.error("Fetch error:", error);
    } finally {
      const button = document.getElementById("fetchDataBtn");
      button.disabled = false;
      button.textContent = "📥 Fetch Latest Data";
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
        key !== "English"
    );
  }

  populateLanguageSelector() {
    const selector = document.getElementById("languageSelector");
    selector.innerHTML = "";

    this.availableLanguages.forEach((language) => {
      if (language.trim()) {
        const option = document.createElement("div");
        option.className = "language-option";
        option.textContent = language;
        option.addEventListener("click", () => this.selectLanguage(language));
        selector.appendChild(option);
      }
    });
  }

  selectLanguage(language) {
    this.selectedLanguage = language;

    document.querySelectorAll(".language-option").forEach((option) => {
      option.classList.remove("selected");
    });

    event.target.classList.add("selected");

    document.getElementById("selectedLanguageName").textContent = language;
    this.activateStep(3);
  }

  showCustomLanguageForm() {
    document.getElementById("customLanguageForm").classList.add("show");
  }

  addCustomLanguage() {
    const input = document.getElementById("customLanguageName");
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
    this.populateLanguageSelector();
    this.selectLanguage(languageName);

    input.value = "";
    document.getElementById("customLanguageForm").classList.remove("show");
  }

  showFileUpload() {
    document.getElementById("fileUploadArea").classList.remove("hidden");
  }

  handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
      this.processUploadedFile(file);
    }
  }

  processUploadedFile(file) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a CSV file");
      return;
    }

    this.showStatus("Processing uploaded file...", "loading");

    setTimeout(() => {
      this.processTranslationFile(file);
    }, 1000);
  }

  async downloadLatestVersion() {
    if (!this.selectedLanguage || !this.data) {
      alert("Please select a language first");
      return;
    }

    this.showStatus("Generating latest version CSV...", "loading");

    setTimeout(() => {
      const csv = this.generateLanguageCSV(this.selectedLanguage);
      this.downloadCSV(csv, `${this.selectedLanguage}_latest.csv`);
      this.showDownloadResult(`${this.selectedLanguage}_latest.csv`);
    }, 1000);
  }

  processTranslationFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = this.generateLanguageCSV(this.selectedLanguage);
        this.downloadCSV(csv, `${this.selectedLanguage}_processed.csv`);
        this.showDownloadResult(`${this.selectedLanguage}_processed.csv`);

        this.showStatus("File processed successfully!", "success");
        setTimeout(() => this.hideStatus(), 2000);
      } catch (error) {
        this.showStatus(`Error processing file: ${error.message}`, "error");
      }
    };
    reader.readAsText(file);
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

  downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
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

  showDownloadResult(filename) {
    const button = document.getElementById("downloadResultBtn");
    button.textContent = `💾 Download ${filename}`;
    button.classList.remove("hidden");

    button.onclick = () => {
      const csv = this.generateLanguageCSV(this.selectedLanguage);
      this.downloadCSV(csv, filename);
    };

    this.activateStep(4);
  }

  activateStep(stepNumber) {
    document.querySelectorAll(".step").forEach((step, index) => {
      if (index + 1 <= stepNumber) {
        step.classList.add("active");
      } else {
        step.classList.remove("active");
      }
    });
  }

  updateStepState() {
    this.activateStep(1);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new LocalisationManager();
});
