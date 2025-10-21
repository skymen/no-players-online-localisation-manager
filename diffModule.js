/**
 * Text Diff Module using diff library
 * Provides accurate text comparison and visual diff generation
 */

/**
 * Generate a // Check if a line is part of the LCS at a given position
function isInLCS(line, pos, arr2, lcs) {
  return lcs.some(item => item.value === line && item.j >= pos);
}

/**
 * Generate character-level diff for individual lines
 * @param {string} oldLine - Original line
 * @param {string} newLine - New line
 * @param {Object} options - Diff options
 * @returns {Array} Array of character-level diff parts
 */
export function generateCharDiff(oldLine, newLine, options = {}) {
  if (typeof Diff === "undefined") {
    throw new Error(
      "Diff library not loaded. Please include diff.js in your HTML."
    );
  }

  const defaultOptions = {
    ignoreWhitespace: false,
    ignoreCase: false,
    ...options,
  };

  // Use character-level diff from the Diff library
  const diff = Diff.diffChars(oldLine || "", newLine || "", defaultOptions);

  return diff.map((part) => ({
    added: part.added || false,
    removed: part.removed || false,
    value: part.value,
    count: part.count,
  }));
}

/**
 * Generate enhanced line diff with character-level details for changed lines
 * @param {string} oldText - Original text
 * @param {string} newText - New text
 * @param {Object} options - Diff options
 * @returns {Array} Array of diff parts with character-level details
 */
export function generateEnhancedLineDiff(oldText, newText, options = {}) {
  const lines1 = oldText.split("\n");
  const lines2 = newText.split("\n");

  // Use LCS algorithm for better line matching
  const lcs = computeLCS(lines1, lines2);
  const diff = [];

  let i = 0,
    j = 0;

  while (i < lines1.length || j < lines2.length) {
    if (i < lines1.length && j < lines2.length && lines1[i] === lines2[j]) {
      // Lines match exactly
      diff.push({
        value: lines1[i] + "\n",
        lineType: "unchanged",
      });
      i++;
      j++;
    } else if (
      i < lines1.length &&
      (j >= lines2.length || !isInLCS(lines1[i], j, lines2, lcs))
    ) {
      // Line removed
      diff.push({
        removed: true,
        value: lines1[i] + "\n",
        lineType: "removed",
      });
      i++;
    } else if (j < lines2.length) {
      // Line added
      diff.push({
        added: true,
        value: lines2[j] + "\n",
        lineType: "added",
      });
      j++;
    }
  }

  // Now enhance with character-level diffs for modified sections
  const enhancedDiff = [];

  for (let k = 0; k < diff.length; k++) {
    const current = diff[k];

    // Check if this is a potential line modification (removed followed by added)
    if (current.removed && k + 1 < diff.length && diff[k + 1].added) {
      const removedLine = current.value.replace(/\n$/, "");
      const addedLine = diff[k + 1].value.replace(/\n$/, "");

      // Generate character-level diff for this line modification
      const charDiff = generateCharDiff(removedLine, addedLine, options);

      enhancedDiff.push({
        lineType: "modified",
        oldLine: removedLine,
        newLine: addedLine,
        charDiff: charDiff,
        value: addedLine + "\n", // For compatibility
        modified: true,
      });

      k++; // Skip the next added line since we processed it
    } else {
      enhancedDiff.push(current);
    }
  }

  return enhancedDiff;
}

/**ed diff between two strings
 * @param {string} oldText - Original text
 * @param {string} newText - New text
 * @param {Object} options - Diff options
 * @returns {Array} Array of diff parts with operation type and value
 */
export function generateDiff(oldText, newText, options = {}) {
  if (typeof Diff === "undefined") {
    throw new Error(
      "Diff library not loaded. Please include diff.js in your HTML."
    );
  }

  const defaultOptions = {
    ignoreWhitespace: false,
    ignoreCase: false,
    useLineDiff: false, // New option for multiline texts
    ...options,
  };

  // For multiline text, use line-based diff for better results
  if (
    defaultOptions.useLineDiff ||
    (oldText && oldText.includes("\n")) ||
    (newText && newText.includes("\n"))
  ) {
    return generateLineDiff(oldText || "", newText || "", defaultOptions);
  }

  // Use word-level diff for single-line text
  const diff = Diff.diffWords(oldText || "", newText || "", defaultOptions);

  return diff.map((part) => ({
    added: part.added || false,
    removed: part.removed || false,
    value: part.value,
    count: part.count,
  }));
}

/**
 * Generate line-based diff for multiline text
 * @param {string} oldText - Original text
 * @param {string} newText - New text
 * @param {Object} options - Diff options
 * @returns {Array} Array of diff parts
 */
function generateLineDiff(oldText, newText, options) {
  // Enhanced line-based diff using Longest Common Subsequence (LCS)
  const lines1 = oldText.split("\n");
  const lines2 = newText.split("\n");

  // Use LCS algorithm for better line matching
  const lcs = computeLCS(lines1, lines2);
  const diff = [];

  let i = 0,
    j = 0;

  while (i < lines1.length || j < lines2.length) {
    if (i < lines1.length && j < lines2.length && lines1[i] === lines2[j]) {
      // Lines match
      diff.push({ value: lines1[i] + "\n" });
      i++;
      j++;
    } else if (
      i < lines1.length &&
      (j >= lines2.length || !isInLCS(lines1[i], j, lines2, lcs))
    ) {
      // Line removed
      diff.push({ removed: true, value: lines1[i] + "\n" });
      i++;
    } else if (j < lines2.length) {
      // Line added
      diff.push({ added: true, value: lines2[j] + "\n" });
      j++;
    }
  }

  return diff.map((part) => ({
    added: part.added || false,
    removed: part.removed || false,
    value: part.value,
    count: part.count,
  }));
}

// Compute Longest Common Subsequence for better diff alignment
function computeLCS(arr1, arr2) {
  const m = arr1.length;
  const n = arr2.length;
  const dp = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const lcs = [];
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs.unshift({ i: i - 1, j: j - 1, value: arr1[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

// Check if a line is part of the LCS at a given position
function isInLCS(line, pos, arr2, lcs) {
  return lcs.some((item) => item.value === line && item.j >= pos);
}

/**
 * Generate HTML representation of a diff
 * @param {string} oldText - Original text
 * @param {string} newText - New text
 * @param {Object} options - Rendering options
 * @returns {string} HTML string representing the diff
 */
export function generateDiffHTML(oldText, newText, options = {}) {
  const defaultOptions = {
    showLineNumbers: false,
    ignoreWhitespace: false,
    ignoreCase: false,
    addedClass: "diff-added",
    removedClass: "diff-removed",
    unchangedClass: "diff-unchanged",
    useLineDiff: false, // Auto-detect or force line-based diff
    ...options,
  };

  // Auto-detect multiline text and use appropriate diff method
  const isMultiline =
    (oldText && oldText.includes("\n")) || (newText && newText.includes("\n"));

  let diff;
  if (defaultOptions.useLineDiff || isMultiline) {
    // Use line-based diff for multiline text
    diff = generateDiff(oldText, newText, {
      ...defaultOptions,
      useLineDiff: true,
    });
  } else {
    // Use word-based diff for single-line text
    diff = generateDiff(oldText, newText, defaultOptions);
  }

  let html = "";

  diff.forEach((part) => {
    const escapedValue = escapeHtml(part.value);

    if (part.added) {
      html += `<span class="${defaultOptions.addedClass}">${escapedValue}</span>`;
    } else if (part.removed) {
      html += `<span class="${defaultOptions.removedClass}">${escapedValue}</span>`;
    } else {
      html += `<span class="${defaultOptions.unchangedClass}">${escapedValue}</span>`;
    }
  });

  return html;
}

/**
 * Generate side-by-side diff HTML
 * @param {string} oldText - Original text
 * @param {string} newText - New text
 * @param {Object} options - Rendering options
 * @returns {Object} Object with oldHtml and newHtml properties
 */
export function generateSideBySideDiffHTML(oldText, newText, options = {}) {
  const defaultOptions = {
    addedClass: "diff-added",
    removedClass: "diff-removed",
    unchangedClass: "diff-unchanged",
    ...options,
  };

  const diff = generateDiff(oldText, newText, defaultOptions);

  let oldHtml = "";
  let newHtml = "";

  diff.forEach((part) => {
    const escapedValue = escapeHtml(part.value);

    if (part.added) {
      newHtml += `<span class="${defaultOptions.addedClass}">${escapedValue}</span>`;
    } else if (part.removed) {
      oldHtml += `<span class="${defaultOptions.removedClass}">${escapedValue}</span>`;
    } else {
      oldHtml += `<span class="${defaultOptions.unchangedClass}">${escapedValue}</span>`;
      newHtml += `<span class="${defaultOptions.unchangedClass}">${escapedValue}</span>`;
    }
  });

  return { oldHtml, newHtml };
}

/**
 * Generate unified diff format (similar to git diff)
 * @param {string} oldText - Original text
 * @param {string} newText - New text
 * @param {Object} options - Options including context lines
 * @returns {string} Unified diff format string
 */
export function generateUnifiedDiff(oldText, newText, options = {}) {
  if (typeof Diff === "undefined") {
    throw new Error(
      "Diff library not loaded. Please include diff.js in your HTML."
    );
  }

  const defaultOptions = {
    context: 3,
    oldFileName: "old.txt",
    newFileName: "new.txt",
    ...options,
  };

  const patch = Diff.createPatch(
    defaultOptions.oldFileName,
    oldText || "",
    newText || "",
    "",
    "",
    { context: defaultOptions.context }
  );

  return patch;
}

/**
 * Get diff statistics
 * @param {string} oldText - Original text
 * @param {string} newText - New text
 * @returns {Object} Statistics about the diff
 */
export function getDiffStats(oldText, newText) {
  const diff = generateDiff(oldText, newText);

  let addedChars = 0;
  let removedChars = 0;
  let unchangedChars = 0;
  let addedWords = 0;
  let removedWords = 0;
  let unchangedWords = 0;

  diff.forEach((part) => {
    const charCount = part.value.length;
    const wordCount = part.value
      .trim()
      .split(/\s+/)
      .filter((w) => w).length;

    if (part.added) {
      addedChars += charCount;
      addedWords += wordCount;
    } else if (part.removed) {
      removedChars += charCount;
      removedWords += wordCount;
    } else {
      unchangedChars += charCount;
      unchangedWords += wordCount;
    }
  });

  return {
    addedChars,
    removedChars,
    unchangedChars,
    addedWords,
    removedWords,
    unchangedWords,
    totalChars: addedChars + removedChars + unchangedChars,
    totalWords: addedWords + removedWords + unchangedWords,
  };
}

/**
 * Check if two strings are identical
 * @param {string} oldText - Original text
 * @param {string} newText - New text
 * @param {Object} options - Comparison options
 * @returns {boolean} True if texts are identical
 */
export function areTextsIdentical(oldText, newText, options = {}) {
  const defaultOptions = {
    ignoreWhitespace: false,
    ignoreCase: false,
    ...options,
  };

  let text1 = oldText || "";
  let text2 = newText || "";

  if (defaultOptions.ignoreWhitespace) {
    text1 = text1.replace(/\s+/g, " ").trim();
    text2 = text2.replace(/\s+/g, " ").trim();
  }

  if (defaultOptions.ignoreCase) {
    text1 = text1.toLowerCase();
    text2 = text2.toLowerCase();
  }

  return text1 === text2;
}

/**
 * Escape HTML characters in text
 * @param {string} text - Text to escape
 * @returns {string} HTML-escaped text
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Generate a compact diff summary
 * @param {string} oldText - Original text
 * @param {string} newText - New text
 * @returns {Object} Compact summary of changes
 */
export function getDiffSummary(oldText, newText) {
  if (areTextsIdentical(oldText, newText)) {
    return {
      type: "identical",
      message: "No changes",
    };
  }

  const stats = getDiffStats(oldText, newText);

  if (stats.addedWords > 0 && stats.removedWords > 0) {
    return {
      type: "modified",
      message: `Modified (+${stats.addedWords} -${stats.removedWords} words)`,
    };
  } else if (stats.addedWords > 0) {
    return {
      type: "added",
      message: `Added (+${stats.addedWords} words)`,
    };
  } else if (stats.removedWords > 0) {
    return {
      type: "removed",
      message: `Removed (-${stats.removedWords} words)`,
    };
  }

  return {
    type: "unknown",
    message: "Changed",
  };
}
