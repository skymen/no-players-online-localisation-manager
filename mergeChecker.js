/**
 * Merge status checking utilities
 * Handles checking if server files are merged with the latest data,
 * including support for LQA (Language Quality Assurance) files
 */

/**
 * Check if a server file is merged with the latest data
 * @param {Array} serverData - The server file data
 * @param {string} language - The language to check
 * @param {Array} mainData - The main sheet data to compare against
 * @param {Array} lqaData - Optional LQA data for this language
 * @returns {boolean} - True if the server file is merged (matches main data or main+LQA)
 */
export function checkIfMerged(serverData, language, mainData, lqaData = null) {
  // Create a map of server data by termID
  const serverDataMap = {};
  serverData.forEach((row) => {
    if (row.termID && row[language] && row[language].trim()) {
      serverDataMap[row.termID] = row[language];
    }
  });

  // Create LQA data map if provided
  const lqaDataMap = {};
  if (lqaData) {
    lqaData.forEach((row) => {
      if (row.termID && row[language] && row[language].trim()) {
        lqaDataMap[row.termID] = row[language];
      }
    });
  }

  // Check against main sheet data
  let matchesMainData = true;
  let matchesMainWithLQA = false;
  let checkedTerms = 0;

  for (const mainRow of mainData) {
    const termID = mainRow.termID;
    if (!termID || mainRow.shouldBeTranslated === "FALSE") continue;

    const serverTranslation = serverDataMap[termID];
    const mainTranslation = mainRow[language];
    const lqaTranslation = lqaDataMap[termID];

    if (serverTranslation) {
      checkedTerms++;

      // Check if server matches main data
      if (serverTranslation !== mainTranslation) {
        matchesMainData = false;
        // Check if server matches main data with LQA applied (LQA takes precedence)
        if (lqaTranslation && serverTranslation === lqaTranslation) {
          matchesMainWithLQA = true;
        }
      }
    }
  }

  // Return true if either condition is met and we checked at least one term
  return checkedTerms > 0 && (matchesMainData || matchesMainWithLQA);
}

/**
 * Check if LQA translations have been merged into the main sheet
 * @param {Array} lqaData - The LQA file data
 * @param {string} language - The language to check
 * @param {Array} mainData - The main sheet data to compare against
 * @returns {boolean} - True if LQA translations are merged into main data
 */
export function checkIfLQAMerged(lqaData, language, mainData) {
  // Create a map of LQA data by termID
  const lqaDataMap = {};
  lqaData.forEach((row) => {
    if (row.termID && row[language] && row[language].trim()) {
      lqaDataMap[row.termID] = row[language];
    }
  });

  // Check against main sheet data
  let allMerged = true;
  let checkedTerms = 0;

  for (const mainRow of mainData) {
    const termID = mainRow.termID;
    if (!termID || mainRow.shouldBeTranslated === "FALSE") continue;

    const lqaTranslation = lqaDataMap[termID];
    const mainTranslation = mainRow[language];

    if (lqaTranslation) {
      checkedTerms++;
      if (lqaTranslation !== mainTranslation) {
        allMerged = false;
        break;
      }
    }
  }

  return allMerged && checkedTerms > 0;
}

/**
 * Enhanced merge status check that returns detailed information
 * Compatible with app.js checkMergeStatus format
 * @param {Array} serverData - The server file data
 * @param {string} language - The language to check
 * @param {Array} mainData - The main sheet data to compare against
 * @param {Array} lqaData - Optional LQA data for this language
 * @returns {Object} - Object with isMerged boolean and checkedTerms count
 */
export function checkMergeStatus(
  serverData,
  language,
  mainData,
  lqaData = null
) {
  const isMerged = checkIfMerged(serverData, language, mainData, lqaData);

  // Count checked terms
  const serverDataMap = {};
  serverData.forEach((row) => {
    if (row.termID && row[language] && row[language].trim()) {
      serverDataMap[row.termID] = row[language];
    }
  });

  let checkedTerms = 0;
  for (const mainRow of mainData) {
    const termID = mainRow.termID;
    if (!termID || mainRow.shouldBeTranslated === "FALSE") continue;

    if (serverDataMap[termID]) {
      checkedTerms++;
    }
  }

  return {
    isMerged,
    checkedTerms,
  };
}
