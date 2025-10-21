/**
 * Test Suite for Diff Module
 * Tests various scenarios including multiline strings, edge cases, and performance
 */

// Import the diff functions
import { 
  generateDiff, 
  generateDiffHTML, 
  getDiffStats, 
  areTextsIdentical,
  getDiffSummary 
} from './diffModule.js';

/**
 * Test runner function
 */
function runTests() {
  console.log('🧪 Starting Diff Module Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  const tests = [
    // Single line tests
    { name: 'Single line - simple change', test: testSingleLineSimple },
    { name: 'Single line - word insertion', test: testSingleLineInsertion },
    { name: 'Single line - word deletion', test: testSingleLineDeletion },
    { name: 'Single line - no changes', test: testSingleLineNoChange },
    
    // Multiline tests
    { name: 'Multiline - line addition', test: testMultilineAddition },
    { name: 'Multiline - line deletion', test: testMultilineDeletion },
    { name: 'Multiline - line modification', test: testMultilineModification },
    { name: 'Multiline - paragraph reorder', test: testMultilineReorder },
    { name: 'Multiline - complex changes', test: testMultilineComplex },
    
    // Edge cases
    { name: 'Edge case - empty strings', test: testEmptyStrings },
    { name: 'Edge case - whitespace only', test: testWhitespaceOnly },
    { name: 'Edge case - special characters', test: testSpecialCharacters },
    { name: 'Edge case - HTML content', test: testHTMLContent },
    { name: 'Edge case - very long text', test: testLongText },
    
    // Function-specific tests
    { name: 'Stats calculation', test: testStatsCalculation },
    { name: 'HTML generation', test: testHTMLGeneration },
    { name: 'Identity check', test: testIdentityCheck },
    { name: 'Summary generation', test: testSummaryGeneration }
  ];
  
  for (const testCase of tests) {
    try {
      const result = testCase.test();
      if (result.success) {
        console.log(`✅ ${testCase.name}`);
        passed++;
      } else {
        console.log(`❌ ${testCase.name}: ${result.message}`);
        failed++;
      }
    } catch (error) {
      console.log(`💥 ${testCase.name}: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\n🔍 Failed tests indicate issues that need to be addressed.');
  } else {
    console.log('\n🎉 All tests passed!');
  }
}

// Single line tests
function testSingleLineSimple() {
  const oldText = "Hello world";
  const newText = "Hello beautiful world";
  
  const diff = generateDiff(oldText, newText);
  
  if (diff.length !== 3) {
    return { success: false, message: `Expected 3 diff parts, got ${diff.length}` };
  }
  
  if (diff[0].value !== "Hello " || !diff[0].added === false && !diff[0].removed === false) {
    return { success: false, message: "First part should be unchanged 'Hello '" };
  }
  
  if (diff[1].value !== "beautiful " || !diff[1].added) {
    return { success: false, message: "Second part should be added 'beautiful '" };
  }
  
  if (diff[2].value !== "world" || !diff[2].added === false && !diff[2].removed === false) {
    return { success: false, message: "Third part should be unchanged 'world'" };
  }
  
  return { success: true };
}

function testSingleLineInsertion() {
  const oldText = "The cat";
  const newText = "The black cat";
  
  const stats = getDiffStats(oldText, newText);
  
  if (stats.addedWords !== 1 || stats.removedWords !== 0) {
    return { success: false, message: `Expected 1 added, 0 removed. Got ${stats.addedWords} added, ${stats.removedWords} removed` };
  }
  
  return { success: true };
}

function testSingleLineDeletion() {
  const oldText = "The quick brown fox";
  const newText = "The brown fox";
  
  const stats = getDiffStats(oldText, newText);
  
  if (stats.addedWords !== 0 || stats.removedWords !== 1) {
    return { success: false, message: `Expected 0 added, 1 removed. Got ${stats.addedWords} added, ${stats.removedWords} removed` };
  }
  
  return { success: true };
}

function testSingleLineNoChange() {
  const oldText = "No changes here";
  const newText = "No changes here";
  
  const identical = areTextsIdentical(oldText, newText);
  
  if (!identical) {
    return { success: false, message: "Identical texts should be detected as identical" };
  }
  
  return { success: true };
}

// Multiline tests
function testMultilineAddition() {
  const oldText = "Line 1\nLine 3";
  const newText = "Line 1\nLine 2\nLine 3";
  
  const diff = generateDiff(oldText, newText);
  const stats = getDiffStats(oldText, newText);
  
  // Check if the addition is detected
  if (stats.addedWords < 1) {
    return { success: false, message: "Should detect word addition in multiline text" };
  }
  
  return { success: true };
}

function testMultilineDeletion() {
  const oldText = "First paragraph\n\nSecond paragraph\n\nThird paragraph";
  const newText = "First paragraph\n\nThird paragraph";
  
  const diff = generateDiff(oldText, newText);
  const stats = getDiffStats(oldText, newText);
  
  if (stats.removedWords < 1) {
    return { success: false, message: "Should detect word removal in multiline text" };
  }
  
  return { success: true };
}

function testMultilineModification() {
  const oldText = "Original first line\nSecond line unchanged\nOriginal third line";
  const newText = "Modified first line\nSecond line unchanged\nModified third line";
  
  const diff = generateDiff(oldText, newText);
  const stats = getDiffStats(oldText, newText);
  
  if (stats.addedWords === 0 && stats.removedWords === 0) {
    return { success: false, message: "Should detect modifications in multiline text" };
  }
  
  return { success: true };
}

function testMultilineReorder() {
  const oldText = "First\nSecond\nThird";
  const newText = "Third\nFirst\nSecond";
  
  const diff = generateDiff(oldText, newText);
  
  // This test checks if the diff handles reordering reasonably
  if (diff.length === 0) {
    return { success: false, message: "Should detect changes in reordered text" };
  }
  
  return { success: true };
}

function testMultilineComplex() {
  const oldText = `This is a complex multiline text.
It has multiple paragraphs.
Some will be changed.
Others will remain the same.
And some will be deleted entirely.`;

  const newText = `This is a complex multiline text.
It has multiple paragraphs that were modified.
Some will be changed completely.
Others will remain the same.
New content has been added here.`;
  
  const diff = generateDiff(oldText, newText);
  const stats = getDiffStats(oldText, newText);
  const summary = getDiffSummary(oldText, newText);
  
  if (stats.addedWords === 0 || stats.removedWords === 0) {
    return { success: false, message: "Complex multiline changes should be detected" };
  }
  
  if (summary.type === 'identical') {
    return { success: false, message: "Complex changes should not be marked as identical" };
  }
  
  return { success: true };
}

// Edge case tests
function testEmptyStrings() {
  const oldText = "";
  const newText = "";
  
  const identical = areTextsIdentical(oldText, newText);
  const stats = getDiffStats(oldText, newText);
  
  if (!identical) {
    return { success: false, message: "Empty strings should be identical" };
  }
  
  if (stats.totalWords !== 0) {
    return { success: false, message: "Empty strings should have 0 total words" };
  }
  
  return { success: true };
}

function testWhitespaceOnly() {
  const oldText = "   \n\t  \n   ";
  const newText = "     \n  \t\n     ";
  
  const diff = generateDiff(oldText, newText);
  
  // Should handle whitespace differences
  if (diff.length === 0) {
    return { success: false, message: "Should detect whitespace differences" };
  }
  
  return { success: true };
}

function testSpecialCharacters() {
  const oldText = "Special chars: @#$%^&*(){}[]|\\:;\"'<>,.?/~`";
  const newText = "Special chars: @#$%^&*(){}[]|\\:;\"'<>,.?/~`!";
  
  const stats = getDiffStats(oldText, newText);
  
  if (stats.addedWords === 0) {
    return { success: false, message: "Should detect addition of special characters" };
  }
  
  return { success: true };
}

function testHTMLContent() {
  const oldText = "<div>Hello <strong>world</strong></div>";
  const newText = "<div>Hello <em>world</em></div>";
  
  const htmlDiff = generateDiffHTML(oldText, newText);
  
  if (!htmlDiff.includes('diff-')) {
    return { success: false, message: "HTML diff should contain diff classes" };
  }
  
  // Should escape HTML properly
  if (htmlDiff.includes('<div>') && !htmlDiff.includes('&lt;')) {
    return { success: false, message: "HTML content should be escaped in diff output" };
  }
  
  return { success: true };
}

function testLongText() {
  const longText1 = "This is a very long text. ".repeat(100);
  const longText2 = "This is a very long text. ".repeat(99) + "This is different.";
  
  const start = performance.now();
  const diff = generateDiff(longText1, longText2);
  const end = performance.now();
  
  const processingTime = end - start;
  
  if (processingTime > 1000) {
    return { success: false, message: `Processing took too long: ${processingTime}ms` };
  }
  
  if (diff.length === 0) {
    return { success: false, message: "Should detect changes in long text" };
  }
  
  return { success: true };
}

// Function-specific tests
function testStatsCalculation() {
  const oldText = "One two three";
  const newText = "One four three five";
  
  const stats = getDiffStats(oldText, newText);
  
  if (stats.addedWords !== 2) {
    return { success: false, message: `Expected 2 added words, got ${stats.addedWords}` };
  }
  
  if (stats.removedWords !== 1) {
    return { success: false, message: `Expected 1 removed word, got ${stats.removedWords}` };
  }
  
  if (stats.unchangedWords !== 2) {
    return { success: false, message: `Expected 2 unchanged words, got ${stats.unchangedWords}` };
  }
  
  return { success: true };
}

function testHTMLGeneration() {
  const oldText = "Hello world";
  const newText = "Hello beautiful world";
  
  const html = generateDiffHTML(oldText, newText);
  
  if (!html.includes('diff-added')) {
    return { success: false, message: "HTML should contain diff-added class" };
  }
  
  if (!html.includes('beautiful')) {
    return { success: false, message: "HTML should contain the added word" };
  }
  
  return { success: true };
}

function testIdentityCheck() {
  const text1 = "Same text";
  const text2 = "Same text";
  const text3 = "Different text";
  
  if (!areTextsIdentical(text1, text2)) {
    return { success: false, message: "Identical texts should be detected as identical" };
  }
  
  if (areTextsIdentical(text1, text3)) {
    return { success: false, message: "Different texts should not be detected as identical" };
  }
  
  return { success: true };
}

function testSummaryGeneration() {
  const oldText = "Original text";
  const newText = "Modified text";
  
  const summary = getDiffSummary(oldText, newText);
  
  if (!summary.type || !summary.message) {
    return { success: false, message: "Summary should have type and message properties" };
  }
  
  if (summary.type === 'identical') {
    return { success: false, message: "Different texts should not have 'identical' type" };
  }
  
  return { success: true };
}

// Export the test runner
export { runTests };

// Auto-run tests if this file is loaded directly
if (typeof window !== 'undefined') {
  // Browser environment
  window.runDiffTests = runTests;
} else if (typeof module !== 'undefined') {
  // Node.js environment
  runTests();
}