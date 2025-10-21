#!/usr/bin/env node

import { writeFile } from "fs/promises";
import { CONFIG } from "./config.js";
import { fetchGoogleSheetsData } from "./dataFetcher.js";

async function saveDataToFile(data, filename = CONFIG.OUTPUT_FILE) {
  try {
    const jsonData = JSON.stringify(data, null, 2);
    await writeFile(filename, jsonData, "utf8");
    console.log(`Data saved to ${filename}`);
    console.log(`Total records: ${data.length}`);
  } catch (error) {
    console.error("Error saving data to file:", error.message);
    throw error;
  }
}

function displayDataSummary(data) {
  console.log("\n=== Data Summary ===");
  console.log(`Total records: ${data.length}`);

  if (data.length > 0) {
    console.log("Sample record keys:", Object.keys(data[0]));
    console.log("First record termID:", data[0].termID);
    console.log("Last record termID:", data[data.length - 1].termID);
  }
}

async function main() {
  try {
    console.log(`${CONFIG.APP_NAME} v${CONFIG.VERSION}`);
    console.log("Running in Node.js environment\n");

    const data = await fetchGoogleSheetsData();
    displayDataSummary(data);

    await saveDataToFile(data);

    console.log("\nExecution completed successfully!");
  } catch (error) {
    console.error("Application error:", error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
