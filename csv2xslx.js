/**
 * CSV to XLSX Converter Module
 * Uses the netas-csv2xlsx library to convert CSV data to XLSX format
 */

import { Csv2Xlsx } from "https://cdn.jsdelivr.net/npm/netas-csv2xlsx@1/src/Csv2Xlsx.js";

/**
 * Convert CSV data to XLSX file
 *
 * @param {string} csvData - The CSV data as a string
 * @param {Object} options - Configuration options
 * @param {string} [options.filename='output.xlsx'] - Name of the output XLSX file
 * @param {string} [options.title='Data'] - Title of the spreadsheet
 * @param {string} [options.subject=''] - Subject metadata
 * @param {string} [options.creator=''] - Creator name
 * @param {string} [options.company=''] - Company name
 * @param {string} [options.lastModifiedBy=''] - Last modified by
 * @param {Date} [options.created=new Date()] - Creation date
 * @param {Date} [options.modified=new Date()] - Modified date
 * @param {string} [options.charset='UTF-8'] - Character encoding of CSV
 * @param {string|null} [options.csvSeparator=null] - CSV separator (null for auto-detect)
 * @param {Object} [options.formatCodes] - Excel format codes
 * @param {string} [options.formatCodes.date='dd.mm.yyyy'] - Date format
 * @param {string} [options.formatCodes.datetime='dd.mm.yyyy hh:mm'] - DateTime format
 * @param {string} [options.formatCodes.number='0'] - Number format
 * @param {string} [options.formatCodes.float='0.0'] - Float format
 * @param {string} [options.formatCodes.percentage='0%'] - Percentage format
 * @param {Function} [options.onProgress] - Progress callback function
 * @param {boolean} [options.returnBlob=false] - Return Blob instead of triggering download
 *
 * @returns {Promise<Blob|string>} Returns a Blob if returnBlob is true, otherwise returns blob URL
 *
 * @example
 * const csvData = 'Name,Age,City\nJohn,30,New York\nJane,25,London';
 *
 * // Basic usage - triggers download
 * await csvToXlsx(csvData, {
 *   filename: 'people.xlsx',
 *   title: 'People List'
 * });
 *
 * // Advanced usage - get blob for further processing
 * const blob = await csvToXlsx(csvData, {
 *   filename: 'people.xlsx',
 *   title: 'People List',
 *   creator: 'John Doe',
 *   company: 'ACME Corp',
 *   csvSeparator: ',',
 *   returnBlob: true,
 *   onProgress: (progress) => console.log(`Progress: ${progress}%`)
 * });
 */
export async function csvToXlsx(csvData, options = {}) {
  // Validate input
  if (!csvData || typeof csvData !== "string") {
    throw new Error("csvData must be a non-empty string");
  }

  // Set default options
  const {
    filename = "output.xlsx",
    title = "Data",
    subject = "",
    creator = "",
    company = "",
    lastModifiedBy = creator || "",
    created = new Date(),
    modified = new Date(),
    charset = "UTF-8",
    csvSeparator = null,
    formatCodes = {},
    onProgress = null,
    returnBlob = false,
  } = options;

  // Prepare metadata
  const metaData = {
    title,
    subject,
    creator,
    company,
    lastModifiedBy,
    created,
    modified,
  };

  try {
    // Create a Blob from CSV data
    const csvBlob = new Blob([csvData], { type: "text/csv;charset=utf-8" });
    const csvUrl = URL.createObjectURL(csvBlob);

    // Convert CSV to XLSX
    const result = await Csv2Xlsx.convertCsv(
      csvUrl,
      filename,
      metaData,
      charset,
      onProgress,
      !returnBlob, // returnAsLink - if returnBlob is true, we want returnAsLink to be false
      csvSeparator,
      formatCodes
    );

    // Clean up the temporary CSV URL
    URL.revokeObjectURL(csvUrl);

    if (returnBlob) {
      // If returnBlob is true, result is a blob URL string, fetch it to get the blob
      const response = await fetch(result);
      const blob = await response.blob();
      URL.revokeObjectURL(result); // Clean up the blob URL
      return blob;
    } else {
      // If returnBlob is false, result is an <a> element, trigger download
      if (result instanceof HTMLAnchorElement) {
        document.body.appendChild(result);
        result.click();
        document.body.removeChild(result);
        return result.href; // Return the blob URL
      } else {
        // Result is a blob URL string, create and trigger download
        const a = document.createElement("a");
        a.href = result;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return result;
      }
    }
  } catch (error) {
    throw new Error(`Failed to convert CSV to XLSX: ${error.message}`);
  }
}

export default csvToXlsx;
