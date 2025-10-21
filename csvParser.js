/**
 * CSV Parser Module using Papa Parse
 * Centralized CSV parsing functionality for the localization system
 *
 * For browser usage: Include Papa Parse script tag before this module
 * For Node.js usage: Import Papa Parse and set it on this module
 */

// Papa Parse instance - will be set differently for browser vs Node.js
let Papa = null;

// For browser environment, try to get Papa from global scope
if (typeof window !== "undefined" && window.Papa) {
  Papa = window.Papa;
}

// Function to set Papa Parse (for Node.js or manual setup)
export function setPapaParseInstance(papaInstance) {
  Papa = papaInstance;
}

function getPapa() {
  if (!Papa) {
    if (typeof window !== "undefined") {
      // Browser environment - try to get Papa from window again
      if (window.Papa) {
        Papa = window.Papa;
        return Papa;
      } else {
        throw new Error(
          "Papa Parse not found on window object. Please ensure Papa Parse script is loaded before this module."
        );
      }
    } else {
      // Node.js environment
      throw new Error(
        "Papa Parse not initialized. Import Papa Parse and call setPapaParseInstance(Papa) before using this module."
      );
    }
  }
  return Papa;
}

/**
 * Parse CSV text into an array of objects
 * @param {string} csvText - Raw CSV text to parse
 * @param {Object} options - Optional parsing configuration
 * @returns {Array} Array of objects representing CSV rows
 * @throws {Error} If parsing fails with fatal errors
 */
export function parseCSV(csvText, options = {}) {
  try {
    const Papa = getPapa();
    const defaultOptions = {
      header: true,
      skipEmptyLines: true,
      transformHeader: function (header) {
        return header.trim();
      },
      transform: function (value) {
        return value.trim();
      },
      ...options,
    };

    const result = Papa.parse(csvText, defaultOptions);

    if (result.errors.length > 0) {
      console.warn("CSV parsing warnings:", result.errors);

      // Only throw on fatal errors, not warnings
      const fatalErrors = result.errors.filter(
        (error) => error.type === "Delimiter" || error.type === "Quotes"
      );

      if (fatalErrors.length > 0) {
        throw new Error(
          `Fatal CSV parsing errors: ${fatalErrors
            .map((e) => e.message)
            .join(", ")}`
        );
      }
    }

    console.log(`CSV parsed successfully: ${result.data.length} rows`);
    return result.data;
  } catch (error) {
    console.error("Error parsing CSV with Papa Parse:", error);
    throw new Error(`CSV parsing failed: ${error.message}`);
  }
}

/**
 * Generate CSV text from an array of objects
 * @param {Array} data - Array of objects to convert to CSV
 * @param {Array} headers - Optional array of header names to specify column order
 * @returns {string} CSV formatted text
 */
export function generateCSV(data, headers = null) {
  if (!data || data.length === 0) {
    return "";
  }

  try {
    const Papa = getPapa();
    // If no headers specified, get all unique keys from the data
    if (!headers) {
      const allKeys = new Set();
      data.forEach((row) =>
        Object.keys(row).forEach((key) => allKeys.add(key))
      );
      headers = Array.from(allKeys);
    }

    const csvData = [headers];

    data.forEach((row) => {
      const csvRow = headers.map((header) => {
        const value = row[header] || "";
        // Papa Parse will handle proper quoting automatically
        return value;
      });
      csvData.push(csvRow);
    });

    return Papa.unparse(csvData, {
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ",",
      header: false, // We're providing headers manually
      skipEmptyLines: false,
    });
  } catch (error) {
    console.error("Error generating CSV:", error);
    throw new Error(`CSV generation failed: ${error.message}`);
  }
}

/**
 * Generate CSV for localization data with proper column ordering
 * @param {Array} data - Localization data array
 * @param {Array} languages - Array of language codes
 * @returns {string} CSV formatted text with proper column order
 */
export function generateLocalizationCSV(data, languages = []) {
  if (!data || data.length === 0) {
    return "";
  }

  // Define the standard column order for localization files
  const standardHeaders = [
    "termID",
    "notes",
    "shouldBeTranslated",
    "translationNeedsToBeUpdated",
    "English",
  ];
  const allHeaders = [...standardHeaders, ...languages];

  return generateCSV(data, allHeaders);
}

/**
 * Validate CSV structure for localization data
 * @param {Array} data - Parsed CSV data
 * @returns {Object} Validation result with success flag and any issues
 */
export function validateLocalizationCSV(data) {
  const issues = [];
  const requiredColumns = ["termID", "English"];

  if (!data || data.length === 0) {
    return {
      success: false,
      issues: ["CSV is empty or could not be parsed"],
    };
  }

  // Check for required columns
  const firstRow = data[0];
  const availableColumns = Object.keys(firstRow);

  requiredColumns.forEach((column) => {
    if (!availableColumns.includes(column)) {
      issues.push(`Missing required column: ${column}`);
    }
  });

  // Check for empty termIDs
  const emptyTermIDs = data.filter(
    (row) => !row.termID || row.termID.trim() === ""
  );
  if (emptyTermIDs.length > 0) {
    issues.push(
      `Found ${emptyTermIDs.length} rows with empty or missing termID`
    );
  }

  // Check for duplicate termIDs
  const termIDs = data
    .map((row) => row.termID)
    .filter((id) => id && id.trim() !== "");
  const duplicateTermIDs = termIDs.filter(
    (id, index) => termIDs.indexOf(id) !== index
  );
  if (duplicateTermIDs.length > 0) {
    issues.push(
      `Found duplicate termIDs: ${[...new Set(duplicateTermIDs)].join(", ")}`
    );
  }

  return {
    success: issues.length === 0,
    issues: issues,
    rowCount: data.length,
    availableColumns: availableColumns,
  };
}

/**
 * Extract language columns from CSV data
 * @param {Array} data - Parsed CSV data
 * @returns {Array} Array of language column names
 */
export function extractLanguages(data) {
  if (!data || data.length === 0) return [];

  const firstRow = data[0];
  return Object.keys(firstRow).filter(
    (key) =>
      key !== "termID" &&
      key !== "notes" &&
      key !== "shouldBeTranslated" &&
      key !== "translationNeedsToBeUpdated" &&
      key !== "English" &&
      key.trim() !== ""
  );
}
