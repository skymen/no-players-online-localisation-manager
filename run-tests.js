// Node.js test runner for diff functionality
import fs from "fs";
import path from "path";

// Simple Diff implementation for Node.js testing with improved LCS algorithm
class SimpleDiff {
  static diffWords(text1, text2) {
    // Basic word-level diff for testing
    const words1 = text1.split(/(\s+)/);
    const words2 = text2.split(/(\s+)/);
    const result = [];

    let i = 0,
      j = 0;
    while (i < words1.length || j < words2.length) {
      if (i >= words1.length) {
        result.push({ added: true, value: words2[j] });
        j++;
      } else if (j >= words2.length) {
        result.push({ removed: true, value: words1[i] });
        i++;
      } else if (words1[i] === words2[j]) {
        result.push({ value: words1[i] });
        i++;
        j++;
      } else {
        // Simple approach: mark as removed/added
        result.push({ removed: true, value: words1[i] });
        result.push({ added: true, value: words2[j] });
        i++;
        j++;
      }
    }
    return result;
  }

  static diffLines(text1, text2) {
    const lines1 = text1.split("\n");
    const lines2 = text2.split("\n");

    // Use LCS algorithm for better line matching
    const lcs = this.computeLCS(lines1, lines2);
    const result = [];

    let i = 0,
      j = 0;

    while (i < lines1.length || j < lines2.length) {
      if (i < lines1.length && j < lines2.length && lines1[i] === lines2[j]) {
        // Lines match
        result.push({ value: lines1[i] + "\n" });
        i++;
        j++;
      } else if (
        i < lines1.length &&
        (j >= lines2.length || !this.isInLCS(lines1[i], j, lines2, lcs))
      ) {
        // Line removed
        result.push({ removed: true, value: lines1[i] + "\n" });
        i++;
      } else if (j < lines2.length) {
        // Line added
        result.push({ added: true, value: lines2[j] + "\n" });
        j++;
      }
    }

    return result;
  }

  static computeLCS(arr1, arr2) {
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

  static isInLCS(line, pos, arr2, lcs) {
    return lcs.some((item) => item.value === line && item.j >= pos);
  }

  static diffArrays(arr1, arr2) {
    const result = [];
    let i = 0,
      j = 0;

    while (i < arr1.length || j < arr2.length) {
      if (i >= arr1.length) {
        result.push({ added: true, value: [arr2[j]] });
        j++;
      } else if (j >= arr2.length) {
        result.push({ removed: true, value: [arr1[i]] });
        i++;
      } else if (arr1[i] === arr2[j]) {
        result.push({ value: [arr1[i]] });
        i++;
        j++;
      } else {
        result.push({ removed: true, value: [arr1[i]] });
        result.push({ added: true, value: [arr2[j]] });
        i++;
        j++;
      }
    }
    return result;
  }

  static diffChars(text1, text2) {
    // Character-level diff for testing
    const chars1 = text1.split("");
    const chars2 = text2.split("");
    const result = [];

    let i = 0,
      j = 0;
    while (i < chars1.length || j < chars2.length) {
      if (i >= chars1.length) {
        // Collect consecutive added characters
        let addedChars = "";
        while (j < chars2.length) {
          addedChars += chars2[j];
          j++;
        }
        if (addedChars) result.push({ added: true, value: addedChars });
      } else if (j >= chars2.length) {
        // Collect consecutive removed characters
        let removedChars = "";
        while (i < chars1.length) {
          removedChars += chars1[i];
          i++;
        }
        if (removedChars) result.push({ removed: true, value: removedChars });
      } else if (chars1[i] === chars2[j]) {
        // Collect consecutive unchanged characters
        let unchangedChars = "";
        while (
          i < chars1.length &&
          j < chars2.length &&
          chars1[i] === chars2[j]
        ) {
          unchangedChars += chars1[i];
          i++;
          j++;
        }
        if (unchangedChars) result.push({ value: unchangedChars });
      } else {
        // Handle character difference - look ahead for better matching
        let removedChars = chars1[i];
        let addedChars = chars2[j];
        i++;
        j++;

        // Simple approach: mark as removed/added
        result.push({ removed: true, value: removedChars });
        result.push({ added: true, value: addedChars });
      }
    }
    return result;
  }
}

// Mock diff module functions for Node.js
function generateDiff(text1, text2) {
  const hasMultipleLines = text1.includes("\n") || text2.includes("\n");
  return hasMultipleLines
    ? SimpleDiff.diffLines(text1, text2)
    : SimpleDiff.diffWords(text1, text2);
}

function generateCharDiff(text1, text2) {
  return SimpleDiff.diffChars(text1, text2);
}

function getDiffStats(diff) {
  let additions = 0,
    deletions = 0,
    unchanged = 0;

  diff.forEach((part) => {
    if (part.added) {
      additions++;
    } else if (part.removed) {
      deletions++;
    } else {
      unchanged++;
    }
  });

  return { additions, deletions, unchanged };
}

// Test cases
const testCases = [
  {
    name: "Single line - simple word change",
    text1: "Hello world",
    text2: "Hello universe",
  },
  {
    name: "Multiline - simple line addition",
    text1: "Line 1\nLine 2",
    text2: "Line 1\nLine 2\nLine 3",
  },
  {
    name: "Multiline - line modification",
    text1: "First line\nSecond line\nThird line",
    text2: "First line\nModified second line\nThird line",
  },
  {
    name: "Multiline - line removal",
    text1: "Line A\nLine B\nLine C",
    text2: "Line A\nLine C",
  },
  {
    name: "Multiline - line reordering",
    text1: "Alpha\nBeta\nGamma",
    text2: "Beta\nAlpha\nGamma",
  },
  {
    name: "Complex multiline - multiple changes",
    text1: "Header\nContent line 1\nContent line 2\nFooter",
    text2:
      "New Header\nContent line 1\nModified content\nAdditional line\nFooter",
  },
  {
    name: "Empty to content",
    text1: "",
    text2: "New content\nSecond line",
  },
  {
    name: "Content to empty",
    text1: "Some content\nSecond line",
    text2: "",
  },
  {
    name: "Whitespace handling",
    text1: "Line with spaces\n  Indented line",
    text2: "Line with spaces\n    Different indentation",
  },
  {
    name: "Special characters",
    text1: 'Text with "quotes" and symbols: @#$%',
    text2: "Text with 'quotes' and symbols: @#$% & more",
  },
];

// Character-level test cases
const charTestCases = [
  {
    name: "Character diff - simple word change",
    text1: "Hello world",
    text2: "Hello universe",
  },
  {
    name: "Character diff - character insertion",
    text1: "test",
    text2: "testing",
  },
  {
    name: "Character diff - character deletion",
    text1: "testing",
    text2: "test",
  },
  {
    name: "Character diff - character replacement",
    text1: "cat",
    text2: "bat",
  },
  {
    name: "Character diff - whitespace changes",
    text1: "hello    world",
    text2: "hello world",
  },
  {
    name: "Character diff - mixed changes",
    text1: "The quick brown fox",
    text2: "A quick red fox",
  },
];

function runTests() {
  console.log("=== Diff Module Test Results ===\n");

  testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    console.log(`Text 1: ${JSON.stringify(testCase.text1)}`);
    console.log(`Text 2: ${JSON.stringify(testCase.text2)}`);

    try {
      const diff = generateDiff(testCase.text1, testCase.text2);
      const stats = getDiffStats(diff);

      console.log(
        `Result: ${stats.additions} additions, ${stats.deletions} deletions, ${stats.unchanged} unchanged`
      );

      // Show first few diff parts for inspection
      console.log("Diff parts (first 5):");
      diff.slice(0, 5).forEach((part, i) => {
        const type = part.added
          ? "[ADDED]"
          : part.removed
          ? "[REMOVED]"
          : "[UNCHANGED]";
        const value = JSON.stringify(part.value).substring(0, 50);
        console.log(`  ${i}: ${type} ${value}`);
      });

      console.log("✓ Test completed successfully\n");
    } catch (error) {
      console.log(`✗ Test failed: ${error.message}\n`);
    }
  });

  console.log("=== Character-Level Diff Tests ===\n");

  charTestCases.forEach((testCase, index) => {
    console.log(`Char Test ${index + 1}: ${testCase.name}`);
    console.log(`Text 1: ${JSON.stringify(testCase.text1)}`);
    console.log(`Text 2: ${JSON.stringify(testCase.text2)}`);

    try {
      const charDiff = generateCharDiff(testCase.text1, testCase.text2);
      const stats = getDiffStats(charDiff);

      console.log(
        `Character Result: ${stats.additions} additions, ${stats.deletions} deletions, ${stats.unchanged} unchanged`
      );

      // Show character diff parts
      console.log("Character diff parts:");
      charDiff.forEach((part, i) => {
        const type = part.added
          ? "[ADDED]"
          : part.removed
          ? "[REMOVED]"
          : "[UNCHANGED]";
        const value = JSON.stringify(part.value);
        console.log(`  ${i}: ${type} ${value}`);
      });

      console.log("✓ Character test completed successfully\n");
    } catch (error) {
      console.log(`✗ Character test failed: ${error.message}\n`);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export { runTests, testCases };
