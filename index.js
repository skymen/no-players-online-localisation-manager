import { fetchGoogleSheetsData, displayData } from './dataFetcher.js';
import { CONFIG } from './config.js';

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleTable = console.table;

function createCustomConsole() {
    const consoleDiv = document.getElementById('console');
    
    function appendToConsole(message, type = 'log') {
        if (consoleDiv) {
            const timestamp = new Date().toLocaleTimeString();
            const formattedMessage = `[${timestamp}] ${message}`;
            
            const messageElement = document.createElement('div');
            messageElement.className = type;
            messageElement.textContent = formattedMessage;
            consoleDiv.appendChild(messageElement);
            
            consoleDiv.scrollTop = consoleDiv.scrollHeight;
        }
    }
    
    console.log = function(...args) {
        const message = args.join(' ');
        originalConsoleLog(...args);
        appendToConsole(message, 'info');
    };
    
    console.error = function(...args) {
        const message = args.join(' ');
        originalConsoleError(...args);
        appendToConsole(message, 'error');
    };
    
    console.table = function(data) {
        originalConsoleTable(data);
        if (typeof data === 'object' && data !== null) {
            appendToConsole(JSON.stringify(data, null, 2), 'info');
        }
    };
}

async function fetchAndDisplayData() {
    const button = document.getElementById('fetchButton');
    const consoleDiv = document.getElementById('console');
    
    if (consoleDiv) {
        consoleDiv.innerHTML = '';
    }
    
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Fetching...';
    }
    
    try {
        console.log(`Starting data fetch from: ${CONFIG.APP_NAME}`);
        console.log('='.repeat(50));
        
        const data = await fetchGoogleSheetsData();
        displayData(data);
        
        console.log('='.repeat(50));
        console.log('✅ Data fetch completed successfully!');
        
    } catch (error) {
        console.error('❌ Failed to fetch data:', error.message);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = '🚀 Fetch Google Sheets Data';
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    createCustomConsole();
    
    console.log('🌟 Application initialized');
    console.log(`App: ${CONFIG.APP_NAME} v${CONFIG.VERSION}`);
    console.log('Ready to fetch data!');
});

window.fetchAndDisplayData = fetchAndDisplayData;