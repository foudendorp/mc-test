// Fallback data generation script
// This runs if the main scraping fails, ensuring we always have valid JSON files

import { writeFileSync, mkdirSync, existsSync } from 'fs';

const DATA_DIR = './data';

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
}

// Generate minimal fallback data
function generateFallbackData() {
    console.log('Generating fallback data...');
    
    // Basic update data with recent known updates
    const fallbackUpdate = {
        week: "Week of July 14, 2025",
        date: "2025-07-14", 
        serviceRelease: null,
        topics: [
            {
                topic: "Device management",
                category: "device-management",
                updates: [
                    {
                        id: 1,
                        title: "Microsoft Copilot in Intune",
                        subtitle: "Explore Intune data with natural language",
                        content: "You can now use Microsoft Copilot in Intune to explore your Intune data using natural language, take action on the results, manage policies and settings, understand your security posture, and troubleshoot device issues.",
                        features: [
                            "Explore your Intune data using natural language queries",
                            "Conversational chat experience for device troubleshooting",
                            "Policy and setting management assistance"
                        ],
                        link: "https://learn.microsoft.com/en-us/mem/intune/fundamentals/whats-new"
                    }
                ]
            }
        ]
    };
    
    // Generate the main data file
    writeFileSync(`${DATA_DIR}/2025-07-14.json`, JSON.stringify(fallbackUpdate, null, 2));
    console.log('Generated fallback 2025-07-14.json');
    
    // Generate notices
    const noticesData = {
        lastUpdated: new Date().toISOString(),
        notices: [
            {
                id: 1,
                title: "Data Update Notice",
                content: "This site automatically updates data from Microsoft Learn. If you see this message, the latest data may not be available yet.",
                date: new Date().toISOString().split('T')[0],
                type: "info"
            }
        ]
    };
    
    writeFileSync(`${DATA_DIR}/notices.json`, JSON.stringify(noticesData, null, 2));
    console.log('Generated fallback notices.json');
    
    // Generate index
    const indexData = {
        lastGenerated: new Date().toISOString(),
        totalUpdates: 1,
        totalFiles: 1,
        dataFiles: [
            {
                filename: "2025-07-14.json",
                week: "Week of July 14, 2025",
                date: "2025-07-14",
                serviceRelease: null,
                updates: 1
            }
        ]
    };
    
    writeFileSync(`${DATA_DIR}/index.json`, JSON.stringify(indexData, null, 2));
    console.log('Generated fallback index.json');
    
    console.log('Fallback data generation completed');
}

generateFallbackData();
