/**
 * Merge status checking utilities
 * Handles checking if server files are merged with the latest data,
 * including support for LQA (Language Quality Assurance) files
 */

/**
 * Helper function to normalize text for comparison (handles newline differences)
 * @param {string} text - Text to normalize
 * @returns {string} - Normalized text
 */
function normalizeText(text) {
  if (!text) return "";
  return text
    .replace(/\r\n/g, "\n") // Normalize Windows line endings
    .replace(/\r/g, "\n"); // Normalize old Mac line endings
}

/**
 * Check if a server file is merged with the latest data
 * @param {Array} serverData - The server file data
 * @param {string} language - The language to check
 * @param {Array} mainData - The main sheet data to compare against
 * @param {Array} lqaData - Optional LQA data for this language
 * @returns {boolean} - True if the server file is merged (matches main data or main+LQA)
 */
export function checkIfMerged(serverData, language, mainData, lqaData = null) {
  // Create maps of server data and server English data by termID
  const serverDataMap = {};
  const serverEnglishMap = {};
  serverData.forEach((row) => {
    if (row.termID) {
      if (row[language] && row[language].trim()) {
        serverDataMap[row.termID] = normalizeText(row[language]);
      }
      if (row.English) {
        serverEnglishMap[row.termID] = normalizeText(row.English);
      }
    }
  });

  // Create LQA data map if provided
  const lqaDataMap = {};
  if (lqaData) {
    lqaData.forEach((row) => {
      if (row.termID && row[language] && row[language].trim()) {
        lqaDataMap[row.termID] = normalizeText(row[language]);
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

    // Skip terms where English data is outdated (server English doesn't match main English)
    const mainEnglish = normalizeText(mainRow.English || "");
    const serverEnglish = serverEnglishMap[termID];
    if (serverEnglish && serverEnglish !== mainEnglish) {
      continue; // Skip this term - it's outdated
    }

    const serverTranslation = serverDataMap[termID];
    const mainTranslation = normalizeText(mainRow[language] || "");
    const lqaTranslation = lqaDataMap[termID];

    if (serverTranslation) {
      checkedTerms++;

      // Check if server matches main data (using normalized comparison)
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
      lqaDataMap[row.termID] = normalizeText(row[language]);
    }
  });

  // Check against main sheet data
  let allMerged = true;
  let checkedTerms = 0;

  for (const mainRow of mainData) {
    const termID = mainRow.termID;
    if (!termID || mainRow.shouldBeTranslated === "FALSE") continue;

    const lqaTranslation = lqaDataMap[termID];
    const mainTranslation = normalizeText(mainRow[language] || "");

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
 * Enhanced merge status check that returns detailed information including outdated terms
 * @param {Array} serverData - The server file data
 * @param {string} language - The language to check
 * @param {Array} mainData - The main sheet data to compare against
 * @param {Array} lqaData - Optional LQA data for this language
 * @returns {Object} - Object with detailed merge status information
 */
export function checkEnhancedMergeStatus(
  serverData,
  language,
  mainData,
  lqaData = null
) {
  // Create maps of server data and server English data by termID
  const serverDataMap = {};
  const serverEnglishMap = {};
  serverData.forEach((row) => {
    if (row.termID) {
      if (row[language] && row[language].trim()) {
        serverDataMap[row.termID] = normalizeText(row[language]);
      }
      if (row.English) {
        serverEnglishMap[row.termID] = normalizeText(row.English);
      }
    }
  });

  // Create LQA data map if provided
  const lqaDataMap = {};
  if (lqaData) {
    lqaData.forEach((row) => {
      if (row.termID && row[language] && row[language].trim()) {
        lqaDataMap[row.termID] = normalizeText(row[language]);
      }
    });
  }

  let validTermsMatched = 0;
  let validTermsTotal = 0;
  let outdatedTerms = [];
  let unmatchedValidTerms = [];

  for (const mainRow of mainData) {
    const termID = mainRow.termID;
    if (!termID || mainRow.shouldBeTranslated === "FALSE") continue;

    const mainEnglish = normalizeText(mainRow.English || "");
    const serverEnglish = serverEnglishMap[termID];
    const serverTranslation = serverDataMap[termID];
    const mainTranslation = normalizeText(mainRow[language] || "");
    const lqaTranslation = lqaDataMap[termID];

    // Check if term is outdated (server English doesn't match main English)
    if (serverEnglish && serverEnglish !== mainEnglish) {
      outdatedTerms.push({
        termID,
        serverEnglish,
        mainEnglish: mainRow.English || "",
        currentTranslation: serverTranslation || "",
      });
      continue; // Skip this term for merge calculation
    }

    // Only consider terms that are up-to-date for merge status
    if (serverTranslation) {
      validTermsTotal++;

      // Check if server matches main data (using normalized comparison)
      const matches =
        serverTranslation === mainTranslation ||
        (lqaTranslation && serverTranslation === lqaTranslation);

      if (matches) {
        validTermsMatched++;
      } else {
        unmatchedValidTerms.push({
          termID,
          serverTranslation,
          expectedTranslation: mainTranslation,
          lqaTranslation,
        });
      }
    }
  }

  const allValidMerged =
    validTermsTotal > 0 && validTermsMatched === validTermsTotal;
  const hasOutdatedTerms = outdatedTerms.length > 0;

  return {
    isMerged: allValidMerged,
    checkedTerms: validTermsTotal,
    validTermsMatched,
    validTermsTotal,
    outdatedTerms,
    unmatchedValidTerms,
    hasOutdatedTerms,
    status: allValidMerged
      ? hasOutdatedTerms
        ? "merged-outdated"
        : "merged"
      : hasOutdatedTerms
      ? "unmerged-outdated"
      : "unmerged",
  };
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
  const enhancedStatus = checkEnhancedMergeStatus(
    serverData,
    language,
    mainData,
    lqaData
  );

  return {
    isMerged: enhancedStatus.isMerged,
    checkedTerms: enhancedStatus.checkedTerms,
    outdatedTerms: enhancedStatus.outdatedTerms,
    hasOutdatedTerms: enhancedStatus.hasOutdatedTerms,
    status: enhancedStatus.status,
  };
}
