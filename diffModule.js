/**
 * Text Diff Module using diff library
 * Provides accurate text comparison and visual diff generation
 */

/**
 * Generate a detailed diff between two strings
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
    ...options,
  };

  // Use word-level diff for better readability
  const diff = Diff.diffWords(oldText || "", newText || "", defaultOptions);

  return diff.map((part) => ({
    added: part.added || false,
    removed: part.removed || false,
    value: part.value,
    count: part.count,
  }));
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
    ...options,
  };

  const diff = generateDiff(oldText, newText, defaultOptions);

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
