import { CONFIG } from "./config.js";
import { parseCSV, setPapaParseInstance } from "./csvParser.js";

// Initialize Papa Parse for Node.js environment
let papaInitialized = false;

async function initializePapa() {
  if (typeof window === 'undefined' && !papaInitialized) {
    try {
      const Papa = (await import('papaparse')).default;
      setPapaParseInstance(Papa);
      papaInitialized = true;
    } catch (error) {
      console.error('Failed to import Papa Parse:', error);
      throw new Error('Papa Parse is required. Install with: npm install papaparse');
    }
  }
}

export async function fetchGoogleSheetsData(url = CONFIG.GOOGLE_SHEETS_URL) {
  try {
    // Ensure Papa Parse is initialized
    await initializePapa();
    
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

// Re-export parseCSV for backward compatibility
export { parseCSV } from "./csvParser.js";

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
