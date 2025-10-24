/**
 * CSV to XLSX and XLSX to CSV Converter Module
 * Uses the SheetJS library for bidirectional conversion
 */

// Import SheetJS from CDN
// Add this to your HTML: <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

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

  try {
    // Report initial progress
    if (onProgress) onProgress(10);

    // Parse CSV data - SheetJS handles separator auto-detection
    const readOptions = { type: "string" };
    if (csvSeparator) {
      readOptions.FS = csvSeparator;
    }

    const tempWorkbook = XLSX.read(csvData, readOptions);
    const worksheet = tempWorkbook.Sheets[tempWorkbook.SheetNames[0]];

    if (onProgress) onProgress(40);

    // Create a new workbook with metadata
    const workbook = XLSX.utils.book_new();

    // Set workbook properties (metadata)
    workbook.Props = {
      Title: title,
      Subject: subject,
      Author: creator,
      Company: company,
      CreatedDate: created,
      ModifiedDate: modified,
      LastAuthor: lastModifiedBy,
    };

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    if (onProgress) onProgress(70);

    // Write workbook to binary array
    const xlsxData = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
      Props: workbook.Props,
    });

    if (onProgress) onProgress(90);

    // Create blob
    const blob = new Blob([xlsxData], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    if (onProgress) onProgress(100);

    if (returnBlob) {
      return blob;
    } else {
      // Trigger download
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Keep the URL alive briefly for the download, then clean up
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

      return blobUrl;
    }
  } catch (error) {
    throw new Error(`Failed to convert CSV to XLSX: ${error.message}`);
  }
}

/**
 * Convert XLSX file to CSV data
 *
 * @param {File|Blob} xlsxFile - The XLSX file to convert
 * @param {Object} options - Configuration options
 * @param {string[]} [options.expectedHeaders] - Array of expected headers in the first row
 * @param {boolean} [options.findMatchingSheet=true] - If true, find first sheet with matching headers
 * @param {number} [options.sheetIndex=0] - Sheet index to use if not finding by headers
 * @param {string} [options.filename='output.csv'] - Name of the output CSV file (for download)
 * @param {boolean} [options.returnString=false] - Return CSV string instead of triggering download
 * @param {Function} [options.onProgress] - Progress callback function
 *
 * @returns {Promise<string|void>} Returns CSV string if returnString is true, otherwise triggers download
 *
 * @example
 * // With expected headers - finds first matching sheet
 * const csvData = await xlsxToCsv(file, {
 *   expectedHeaders: ['termID', 'notes', 'shouldBeTranslated', 'translationNeedsToBeUpdated', 'English'],
 *   returnString: true
 * });
 *
 * // Without headers - uses first sheet
 * await xlsxToCsv(file, {
 *   filename: 'output.csv',
 *   findMatchingSheet: false
 * });
 *
 * // Specify sheet by index
 * await xlsxToCsv(file, {
 *   sheetIndex: 2,
 *   findMatchingSheet: false,
 *   returnString: true
 * });
 */
export async function xlsxToCsv(xlsxFile, options = {}) {
  // Validate input
  if (!xlsxFile || !(xlsxFile instanceof Blob)) {
    throw new Error("xlsxFile must be a File or Blob object");
  }

  // Set default options
  const {
    expectedHeaders = null,
    findMatchingSheet = true,
    sheetIndex = 0,
    filename = "output.csv",
    returnString = false,
    onProgress = null,
  } = options;

  try {
    // Report initial progress
    if (onProgress) onProgress(10);

    // Read the XLSX file
    const data = await xlsxFile.arrayBuffer();

    if (onProgress) onProgress(30);

    const workbook = XLSX.read(data, { type: "array" });

    if (onProgress) onProgress(50);

    let worksheet = null;
    let foundSheetName = null;

    // Find the appropriate sheet
    if (findMatchingSheet && expectedHeaders && expectedHeaders.length > 0) {
      // Search for sheet with matching headers
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const firstRow = jsonData[0] || [];

        // Check if headers match
        if (headersMatch(firstRow, expectedHeaders)) {
          worksheet = sheet;
          foundSheetName = sheetName;
          break;
        }
      }

      if (!worksheet) {
        throw new Error(
          `No sheet found with expected headers: ${expectedHeaders.join(", ")}`
        );
      }
    } else {
      // Use specified sheet index
      if (sheetIndex >= workbook.SheetNames.length) {
        throw new Error(
          `Sheet index ${sheetIndex} out of range. Workbook has ${workbook.SheetNames.length} sheets.`
        );
      }
      foundSheetName = workbook.SheetNames[sheetIndex];
      worksheet = workbook.Sheets[foundSheetName];
    }

    if (onProgress) onProgress(70);

    // Convert worksheet to CSV
    const csvData = XLSX.utils.sheet_to_csv(worksheet);

    if (onProgress) onProgress(100);

    if (returnString) {
      return csvData;
    } else {
      // Trigger download
      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    }
  } catch (error) {
    throw new Error(`Failed to convert XLSX to CSV: ${error.message}`);
  }
}

/**
 * Check if actual headers match expected headers
 * @private
 */
function headersMatch(actualHeaders, expectedHeaders) {
  if (actualHeaders.length < expectedHeaders.length) {
    return false;
  }

  return expectedHeaders.every((expectedHeader, i) => {
    const actual = actualHeaders[i]?.toString().trim();
    const expected = expectedHeader.trim();
    return actual === expected;
  });
}

export default { csvToXlsx, xlsxToCsv };
