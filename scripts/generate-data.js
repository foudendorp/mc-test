import fetch from 'node-fetch';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { JSDOM } from 'jsdom';

const MICROSOFT_LEARN_URL = 'https://learn.microsoft.com/en-us/mem/intune/fundamentals/whats-new';
const DATA_DIR = './data';
const UPDATES_DIR = './data/updates';
const NOTICES_DIR = './data/notices';

// Ensure data directories exist
if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
}
if (!existsSync(UPDATES_DIR)) {
    mkdirSync(UPDATES_DIR, { recursive: true });
}
if (!existsSync(NOTICES_DIR)) {
    mkdirSync(NOTICES_DIR, { recursive: true });
}

// Parse Microsoft Learn page content
async function fetchIntuneUpdates() {
    try {
        console.log('Fetching updates from Microsoft Learn...');
        const response = await fetch(MICROSOFT_LEARN_URL);
        const html = await response.text();
        
        // Use JSDOM to parse HTML (lighter alternative to cheerio for this use case)
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        const updates = [];
        const notices = [];
        const weeklyUpdates = new Map();
        
        // Find all week sections (h2 headers with "Week of" in the text)
        const weekHeaders = Array.from(document.querySelectorAll('h2'))
            .filter(h2 => h2.textContent.includes('Week of'));
        
        console.log(`Found ${weekHeaders.length} week sections`);
        
        weekHeaders.forEach((weekHeader, index) => {
            const weekText = weekHeader.textContent.trim();
            console.log(`Processing: ${weekText}`);
            
            // Extract date from week header
            const dateMatch = weekText.match(/Week of (.+?)(?:\s*\(|$)/);
            const date = dateMatch ? new Date(dateMatch[1]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            
            // Check for service release info
            const serviceReleaseMatch = weekText.match(/\(([^)]+)\)/);
            const serviceRelease = serviceReleaseMatch ? serviceReleaseMatch[1] : null;
            
            const weekData = {
                week: weekText,
                date: date,
                serviceRelease: serviceRelease,
                topics: []
            };
            
            // Find content between this week header and the next one
            let currentElement = weekHeader.nextElementSibling;
            let currentTopic = null;
            
            while (currentElement && !currentElement.textContent.includes('Week of')) {
                if (currentElement.tagName === 'H3') {
                    // New topic section
                    if (currentTopic) {
                        weekData.topics.push(currentTopic);
                    }
                    
                    const topicText = currentElement.textContent.trim();
                    currentTopic = {
                        topic: topicText,
                        category: mapTopicToCategory(topicText),
                        updates: []
                    };
                } else if (currentElement.tagName === 'H4' && currentTopic) {
                    // Individual update
                    const updateTitle = currentElement.textContent.trim();
                    let content = '';
                    let features = [];
                    let link = '';
                    
                    // Get content from following elements
                    let nextEl = currentElement.nextElementSibling;
                    while (nextEl && nextEl.tagName !== 'H4' && nextEl.tagName !== 'H3' && nextEl.tagName !== 'H2') {
                        if (nextEl.tagName === 'P') {
                            const text = nextEl.textContent.trim();
                            if (text) {
                                content += (content ? ' ' : '') + text;
                            }
                        } else if (nextEl.tagName === 'UL') {
                            const listItems = Array.from(nextEl.querySelectorAll('li'));
                            features.push(...listItems.map(li => li.textContent.trim()));
                        }
                        
                        // Look for links
                        const links = nextEl.querySelectorAll('a[href*="learn.microsoft.com"]');
                        if (links.length > 0) {
                            link = links[0].href;
                        }
                        
                        nextEl = nextEl.nextElementSibling;
                    }
                    
                    // Extract subtitle from title (often after a colon or dash)
                    let title = updateTitle;
                    let subtitle = '';
                    
                    const colonIndex = title.indexOf(':');
                    const dashIndex = title.indexOf(' - ');
                    
                    if (colonIndex > 0) {
                        subtitle = title.substring(colonIndex + 1).trim();
                        title = title.substring(0, colonIndex).trim();
                    } else if (dashIndex > 0) {
                        subtitle = title.substring(dashIndex + 3).trim();
                        title = title.substring(0, dashIndex).trim();
                    }
                    
                    const update = {
                        id: Date.now() + Math.random(), // Simple unique ID
                        title: title,
                        subtitle: subtitle || undefined,
                        content: content || 'No additional details available.',
                        features: features.length > 0 ? features : undefined,
                        link: link || MICROSOFT_LEARN_URL
                    };
                    
                    currentTopic.updates.push(update);
                }
                
                currentElement = currentElement.nextElementSibling;
            }
            
            // Add the last topic
            if (currentTopic) {
                weekData.topics.push(currentTopic);
            }
            
            // Only add weeks that have topics with updates
            const hasUpdates = weekData.topics.some(topic => topic.updates.length > 0);
            if (hasUpdates) {
                weeklyUpdates.set(date, weekData);
            }
        });
        
        // Look for important notices (typically at the top of the page)
        const noticeHeaders = Array.from(document.querySelectorAll('h3, h4'))
            .filter(h => h.textContent.toLowerCase().includes('plan for change') || 
                        h.textContent.toLowerCase().includes('notice') ||
                        h.textContent.toLowerCase().includes('important'));
        
        noticeHeaders.forEach(header => {
            let content = '';
            let nextEl = header.nextElementSibling;
            
            while (nextEl && !['H2', 'H3', 'H4'].includes(nextEl.tagName)) {
                if (nextEl.tagName === 'P') {
                    content += (content ? ' ' : '') + nextEl.textContent.trim();
                }
                nextEl = nextEl.nextElementSibling;
            }
            
            if (content) {
                notices.push({
                    id: Date.now() + Math.random(),
                    title: header.textContent.trim(),
                    content: content,
                    date: new Date().toISOString().split('T')[0],
                    type: 'warning'
                });
            }
        });
        
        return { weeklyUpdates, notices };
        
    } catch (error) {
        console.error('Error fetching updates:', error);
        return { weeklyUpdates: new Map(), notices: [] };
    }
}

function mapTopicToCategory(topicText) {
    const topic = topicText.toLowerCase();
    
    if (topic.includes('app') && topic.includes('management')) return 'app-management';
    if (topic.includes('device') && topic.includes('configuration')) return 'device-configuration';
    if (topic.includes('device') && topic.includes('management')) return 'device-management';
    if (topic.includes('device') && topic.includes('security')) return 'device-security';
    if (topic.includes('intune') && topic.includes('apps')) return 'intune-apps';
    if (topic.includes('monitor') || topic.includes('troubleshoot')) return 'monitor-troubleshoot';
    if (topic.includes('microsoft') && topic.includes('intune') && topic.includes('suite')) return 'intune-suite';
    
    // Default mappings
    if (topic.includes('app')) return 'app-management';
    if (topic.includes('device')) return 'device-management';
    if (topic.includes('security')) return 'device-security';
    if (topic.includes('configuration') || topic.includes('policy')) return 'device-configuration';
    
    return 'device-management'; // Default category
}

// Generate JSON files
async function generateDataFiles() {
    console.log('Starting data generation...');
    
    // Ensure data directories exist
    if (!existsSync(DATA_DIR)) {
        console.log('Creating data directory...');
        mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!existsSync(UPDATES_DIR)) {
        console.log('Creating updates directory...');
        mkdirSync(UPDATES_DIR, { recursive: true });
    }
    if (!existsSync(NOTICES_DIR)) {
        console.log('Creating notices directory...');
        mkdirSync(NOTICES_DIR, { recursive: true });
    }
    
    try {
        const { weeklyUpdates, notices } = await fetchIntuneUpdates();
        
        console.log(`Processed ${weeklyUpdates.size} weeks of updates`);
        console.log(`Found ${notices.length} notices`);
        
        // Generate individual week files
        const dataFiles = [];
        let totalUpdates = 0;
        
        for (const [date, weekData] of weeklyUpdates) {
            const filename = `${date}.json`;
            const updateCount = weekData.topics.reduce((sum, topic) => sum + topic.updates.length, 0);
            
            if (updateCount > 0) {
                writeFileSync(`${UPDATES_DIR}/${filename}`, JSON.stringify(weekData, null, 2));
                
                dataFiles.push({
                    filename: filename,
                    path: `updates/${filename}`,
                    week: weekData.week,
                    date: weekData.date,
                    serviceRelease: weekData.serviceRelease,
                    updates: updateCount
                });
                
                totalUpdates += updateCount;
                console.log(`Generated updates/${filename} with ${updateCount} updates`);
            }
        }
        
        // If no data was scraped, create fallback data
        if (dataFiles.length === 0) {
            console.log('No data scraped, creating fallback data...');
            await createFallbackData();
            return;
        }
        
        // Generate notices file
        if (notices.length > 0) {
            const noticesData = {
                lastUpdated: new Date().toISOString(),
                notices: notices
            };
            writeFileSync(`${NOTICES_DIR}/notices.json`, JSON.stringify(noticesData, null, 2));
            console.log(`Generated notices/notices.json with ${notices.length} notices`);
        } else {
            // Create minimal notices file
            const noticesData = {
                lastUpdated: new Date().toISOString(),
                notices: []
            };
            writeFileSync(`${NOTICES_DIR}/notices.json`, JSON.stringify(noticesData, null, 2));
            console.log('Generated empty notices/notices.json');
        }
        
        // Generate index file
        const indexData = {
            lastGenerated: new Date().toISOString(),
            totalUpdates: totalUpdates,
            totalFiles: dataFiles.length,
            dataFiles: dataFiles.sort((a, b) => new Date(b.date) - new Date(a.date))
        };
        
        writeFileSync(`${DATA_DIR}/index.json`, JSON.stringify(indexData, null, 2));
        console.log(`Generated index.json with ${dataFiles.length} data files`);
        
        console.log('Data generation completed successfully!');
        console.log(`Total: ${totalUpdates} updates across ${dataFiles.length} weeks`);
        
    } catch (error) {
        console.error('Error during data generation:', error);
        console.log('Creating fallback data due to error...');
        await createFallbackData();
    }
}

async function createFallbackData() {
    console.log('Creating fallback data...');
    
    // Ensure directories exist
    if (!existsSync(UPDATES_DIR)) {
        mkdirSync(UPDATES_DIR, { recursive: true });
    }
    if (!existsSync(NOTICES_DIR)) {
        mkdirSync(NOTICES_DIR, { recursive: true });
    }
    
    // Create fallback update data
    const fallbackData = {
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
    
    writeFileSync(`${UPDATES_DIR}/2025-07-14.json`, JSON.stringify(fallbackData, null, 2));
    console.log('Generated fallback updates/2025-07-14.json');
    
    // Create fallback notices
    const noticesData = {
        lastUpdated: new Date().toISOString(),
        notices: [
            {
                id: 1,
                title: "Data Generation Notice",
                content: "This site uses automated data generation. The displayed information is currently using fallback data while the system fetches the latest updates from Microsoft Learn.",
                date: new Date().toISOString().split('T')[0],
                type: "info"
            }
        ]
    };
    
    writeFileSync(`${NOTICES_DIR}/notices.json`, JSON.stringify(noticesData, null, 2));
    console.log('Generated fallback notices/notices.json');
    
    // Create fallback index
    const indexData = {
        lastGenerated: new Date().toISOString(),
        totalUpdates: 1,
        totalFiles: 1,
        dataFiles: [
            {
                filename: "2025-07-14.json",
                path: "updates/2025-07-14.json",
                week: "Week of July 14, 2025",
                date: "2025-07-14",
                serviceRelease: null,
                updates: 1
            }
        ]
    };
    
    writeFileSync(`${DATA_DIR}/index.json`, JSON.stringify(indexData, null, 2));
    console.log('Generated fallback index.json');
    
    console.log('Fallback data creation completed');
}

// Run the generation
generateDataFiles().catch(error => {
    console.error('Failed to generate data files:', error);
    process.exit(1);
});
