/**
 * Merge status checking utilities
 * Handles checking if server files are merged with the latest data,
 * including support for LQA (Language Quality Assurance) files
 */

/**
 * Generate a character-by-character diff between two strings
 * @param {string} str1 - First string (server translation)
 * @param {string} str2 - Second string (expected translation)
 * @returns {Object} - Object with formatted diff information
 */
function generateCharacterDiff(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  let diffDetails = [];
  let hasDifference = false;

  for (let i = 0; i < maxLen; i++) {
    const char1 = str1[i] || "";
    const char2 = str2[i] || "";

    if (char1 !== char2) {
      hasDifference = true;
      const char1Display =
        char1 === ""
          ? "∅"
          : char1 === "\n"
          ? "\\n"
          : char1 === "\t"
          ? "\\t"
          : char1;
      const char2Display =
        char2 === ""
          ? "∅"
          : char2 === "\n"
          ? "\\n"
          : char2 === "\t"
          ? "\\t"
          : char2;

      diffDetails.push({
        position: i,
        server: `'${char1Display}' (${char1.charCodeAt(0) || "N/A"})`,
        expected: `'${char2Display}' (${char2.charCodeAt(0) || "N/A"})`,
      });
    }
  }

  if (!hasDifference) {
    return {
      server: str1,
      expected: str2,
      details: "No character differences found (strings are identical)",
    };
  }

  return {
    server: str1,
    expected: str2,
    details:
      diffDetails.length > 10
        ? `${diffDetails.length} differences found. First 10: ${JSON.stringify(
            diffDetails.slice(0, 10),
            null,
            2
          )}`
        : `${diffDetails.length} difference(s): ${JSON.stringify(
            diffDetails,
            null,
            2
          )}`,
  };
}

/**
 * Helper function to normalize text for comparison (handles newline differences)
 * @param {string} text - Text to normalize
 * @returns {string} - Normalized text
 */
export function normalizeText(text) {
  if (!text) return "";
  // Strip leading single quote (Google Sheets/Excel escape character)
  let normalized = text.startsWith("'") ? text.substring(1) : text;
  return normalized
    .replace(/\r\n/g, "\n") // Normalize Windows line endings
    .replace(/\r/g, "\n") // Normalize old Mac line endings
    .replace(/、/g, ",") // Normalize ideographic comma to ASCII
    .replace(/。/g, ".") // Normalize ideographic period to ASCII
    .replace(/？/g, "?") // Normalize ideographic question mark to ASCII
    .replace(/！/g, "!") // Normalize ideographic exclamation mark to ASCII
    .replace(/：/g, ":") // Normalize ideographic colon to ASCII
    .replace(/；/g, ";") // Normalize ideographic semicolon to ASCII
    .replace(/“/g, '"') // Normalize ideographic double quotation mark to ASCII
    .replace(/”/g, '"') // Normalize ideographic double quotation mark to ASCII
    .replace(/‘/g, "'") // Normalize ideographic single quotation mark to ASCII
    .replace(/’/g, "'") // Normalize ideographic single quotation mark to ASCII
    .normalize("NFKC"); // Normalize Unicode characters
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
  let unmatchedTerms = [];

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
        } else {
          unmatchedTerms.push({
            termID,
            serverTranslation,
            expectedTranslation: mainTranslation,
            lqaTranslation: lqaTranslation || null,
          });
        }
      }
    }
  }

  const isMerged = matchesMainData || matchesMainWithLQA;

  // Log unmerged terms to console if file is marked as unmerged
  if (!isMerged && unmatchedTerms.length > 0) {
    console.group(
      `🔴 UNMERGED: ${language} - ${unmatchedTerms.length} unmerged term(s)`
    );
    console.log(`Checked: ${checkedTerms} terms`);
    console.log("Unmerged terms:");
    console.table(
      unmatchedTerms.map((term) => ({
        termID: term.termID,
        serverTranslation: term.serverTranslation,
        expectedTranslation: term.expectedTranslation,
        hasLQA: term.lqaTranslation ? "Yes" : "No",
        lqaTranslation: term.lqaTranslation || "N/A",
      }))
    );

    // Character-by-character diff for each unmerged term
    console.log("\n📝 Character-by-character differences:");
    unmatchedTerms.forEach((term) => {
      console.group(`Term: ${term.termID}`);

      // Compare server vs LQA if LQA exists, otherwise vs expected
      const compareAgainst = term.lqaTranslation || term.serverTranslation;
      const compareLabel = term.lqaTranslation ? "LQA" : "Server";

      const charDiff = generateCharacterDiff(
        term.expectedTranslation,
        compareAgainst
      );
      console.log("Expected:  ", charDiff.expected);
      console.log(`${compareLabel}:`, charDiff.expected);
      console.log("Diff details:", charDiff.details);

      if (term.lqaTranslation) {
        console.log("Server:", term.serverTranslation);
      }
      console.groupEnd();
    });

    console.groupEnd();
  }

  // Return true if either condition is met and we checked at least one term
  return isMerged;
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
        console.warn(`LQA not merged for ${termID}`);
        console.warn(`LQA: ${lqaTranslation}`);
        console.warn(`Main: ${mainTranslation}`);
        break;
      }
    }
  }

  return allMerged;
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
        (lqaTranslation && mainTranslation === lqaTranslation);

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

  const allValidMerged = validTermsMatched === validTermsTotal;
  const hasOutdatedTerms = outdatedTerms.length > 0;

  // Log unmerged terms to console if file is marked as unmerged
  if (!allValidMerged && unmatchedValidTerms.length > 0) {
    console.group(
      `🔴 UNMERGED: ${language} - ${unmatchedValidTerms.length} unmerged term(s)`
    );
    console.log(
      `Status: ${
        hasOutdatedTerms ? "unmerged-outdated" : "unmerged"
      } | Matched: ${validTermsMatched}/${validTermsTotal}`
    );
    console.log("Unmerged terms:");
    console.table(
      unmatchedValidTerms.map((term) => ({
        termID: term.termID,
        serverTranslation: term.serverTranslation,
        expectedTranslation: term.expectedTranslation,
        hasLQA: term.lqaTranslation ? "Yes" : "No",
        lqaTranslation: term.lqaTranslation || "N/A",
      }))
    );

    // Character-by-character diff for each unmerged term
    console.log("\n📝 Character-by-character differences:");
    unmatchedValidTerms.forEach((term) => {
      console.group(`Term: ${term.termID}`);

      // Compare server vs LQA if LQA exists, otherwise vs expected
      const compareAgainst = term.lqaTranslation || term.serverTranslation;
      const compareLabel = term.lqaTranslation ? "LQA" : "Server";

      const charDiff = generateCharacterDiff(
        term.expectedTranslation,
        compareAgainst
      );
      console.log("Expected:  ", charDiff.expected);
      console.log(`${compareLabel}:`, charDiff.expected);
      console.log("Diff details:", charDiff.details);

      if (term.lqaTranslation) {
        console.log("Server:", term.serverTranslation);
      }
      console.groupEnd();
    });

    console.groupEnd();
  }

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
