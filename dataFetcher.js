import { CONFIG } from "./config.js";

export async function fetchGoogleSheetsData(url = CONFIG.GOOGLE_SHEETS_URL) {
  try {
    console.log("Fetching data from:", url);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const csvText = await response.text();
    console.log("CSV data fetched successfully");

    return parseCSV(csvText);
  } catch (error) {
    console.error("Error fetching Google Sheets data:", error);
    throw error;
  }
}

export function parseCSV(csvText) {
  const lines = csvText.trim().split("\n");

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCSVLine(lines[0]);

  const data = lines.slice(1).map((line, index) => {
    const values = parseCSVLine(line);
    const row = {};

    headers.forEach((header, i) => {
      row[header] = values[i] || "";
    });

    return row;
  });

  console.log(`Parsed ${data.length} rows of data`);
  return data;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export function displayData(data) {
  console.log("\n=== Google Sheets Data ===");
  console.log(`Found ${data.length} records:\n`);

  if (data.length > 0) {
    const displayCount = Math.min(5, data.length);

    for (let i = 0; i < displayCount; i++) {
      console.log(`Record ${i + 1}:`);
      console.table(data[i]);
      console.log("");
    }

    if (data.length > 5) {
      console.log(`... and ${data.length - 5} more records`);
    }

    if (data.length <= 20) {
      console.log("\nComplete data table:");
      console.table(data);
    }
  } else {
    console.log("No data found");
  }
}
