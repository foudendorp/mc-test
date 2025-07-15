import fetch from 'node-fetch';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import crypto from 'crypto';

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
                        id: generateContentId(title, subtitle, content), // Deterministic ID based on content
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
                    // Preserve HTML markup by converting to markdown-like syntax
                    let htmlContent = nextEl.innerHTML.trim();
                    
                    // Convert HTML to markdown-like syntax
                    htmlContent = htmlContent
                        .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**') // <strong> to **bold**
                        .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**') // <b> to **bold**
                        .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*') // <em> to *italic*
                        .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*') // <i> to *italic*
                        .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`') // <code> to `code`
                        .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)') // <a> to [text](url)
                        .replace(/<br\s*\/?>/gi, '\n') // <br> to newline
                        .replace(/<[^>]+>/g, ''); // Remove any remaining HTML tags
                    
                    content += (content ? '\n' : '') + htmlContent;
                }
                nextEl = nextEl.nextElementSibling;
            }
            
            if (content) {
                // Create notice without timestamp for consistent content
                const noticeData = {
                    id: generateContentId(header.textContent.trim(), '', content), // Deterministic ID based on content
                    title: header.textContent.trim(),
                    content: content.trim(),
                    date: new Date().toISOString().split('T')[0],
                    type: 'warning',
                    category: 'plan-for-change',
                    status: 'active',
                    source: 'microsoft-learn'
                };
                
                notices.push(noticeData);
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
        
        // Generate individual week files (only if changed)
        const dataFiles = [];
        let totalUpdates = 0;
        let filesUpdated = 0;
        
        for (const [date, weekData] of weeklyUpdates) {
            const filename = `${date}.json`;
            const filePath = `${UPDATES_DIR}/${filename}`;
            const updateCount = weekData.topics.reduce((sum, topic) => sum + topic.updates.length, 0);
            
            if (updateCount > 0) {
                // Check if content has changed before writing
                if (hasContentChanged(filePath, weekData)) {
                    writeFileSync(filePath, JSON.stringify(weekData, null, 2));
                    filesUpdated++;
                    console.log(`✅ Updated updates/${filename} with ${updateCount} updates`);
                } else {
                    console.log(`⏭️  Skipped updates/${filename} (no changes)`);
                }
                
                dataFiles.push({
                    filename: filename,
                    path: `updates/${filename}`,
                    week: weekData.week,
                    date: weekData.date,
                    serviceRelease: weekData.serviceRelease,
                    updates: updateCount
                });
                
                totalUpdates += updateCount;
            }
        }
        
        console.log(`📁 Files processed: ${dataFiles.length}, Files updated: ${filesUpdated}`);
        
        // If no data was scraped, create fallback data
        if (dataFiles.length === 0) {
            console.log('No data scraped, creating fallback data...');
            await createFallbackData();
            return;
        }
        
        // Generate individual notice files (only if changed)
        const noticeFiles = [];
        let noticesUpdated = 0;
        
        if (notices.length > 0) {
            notices.forEach((notice, index) => {
                // Create a unique filename based on notice title and date
                const sanitizedTitle = notice.title
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '')
                    .substring(0, 50); // Limit length
                
                const filename = `${notice.date}-${sanitizedTitle}.json`;
                const filePath = `${NOTICES_DIR}/${filename}`;
                
                if (hasContentChanged(filePath, notice)) {
                    // Add timestamp only when writing
                    const noticeWithTimestamp = {
                        ...notice,
                        lastUpdated: new Date().toISOString()
                    };
                    
                    writeFileSync(filePath, JSON.stringify(noticeWithTimestamp, null, 2));
                    noticesUpdated++;
                    console.log(`✅ Updated notices/${filename}`);
                } else {
                    console.log(`⏭️  Skipped notices/${filename} (no changes)`);
                }
                
                noticeFiles.push({
                    filename: filename,
                    path: `notices/${filename}`,
                    title: notice.title,
                    date: notice.date,
                    type: notice.type,
                    category: notice.category
                });
            });
            
            console.log(`📁 Notices processed: ${notices.length}, Files updated: ${noticesUpdated}`);
        }
        
        // Create notices index file
        const noticesIndexPath = `${NOTICES_DIR}/index.json`;
        const noticesIndexDataWithoutTimestamp = {
            totalNotices: notices.length,
            totalFiles: noticeFiles.length,
            noticeFiles: noticeFiles.sort((a, b) => new Date(b.date) - new Date(a.date))
        };
        
        if (hasContentChanged(noticesIndexPath, noticesIndexDataWithoutTimestamp)) {
            const noticesIndexData = {
                lastUpdated: new Date().toISOString(),
                ...noticesIndexDataWithoutTimestamp
            };
            
            writeFileSync(noticesIndexPath, JSON.stringify(noticesIndexData, null, 2));
            console.log(`✅ Updated notices/index.json with ${noticeFiles.length} notice files`);
        } else {
            console.log('⏭️  Skipped notices/index.json (no changes)');
        }
        
        // Group data files by month
        const monthlyGroups = groupDataFilesByMonth(dataFiles);
        
        // Create index data without timestamp first for comparison
        const indexDataWithoutTimestamp = {
            totalUpdates: totalUpdates,
            totalFiles: dataFiles.length,
            totalMonths: monthlyGroups.length,
            monthlyGroups: monthlyGroups,
            dataFiles: dataFiles.sort((a, b) => new Date(b.date) - new Date(a.date)) // Keep individual files for backward compatibility
        };
        
        const indexFilePath = `${DATA_DIR}/index.json`;
        
        // Always update index.json with current timestamp to reflect deployment time
        const indexData = {
            lastGenerated: new Date().toISOString(),
            ...indexDataWithoutTimestamp
        };
        
        // Check if content has changed (excluding timestamp) for logging purposes
        if (hasContentChanged(indexFilePath, indexDataWithoutTimestamp)) {
            writeFileSync(indexFilePath, JSON.stringify(indexData, null, 2));
            console.log(`✅ Updated index.json with ${dataFiles.length} data files grouped into ${monthlyGroups.length} months`);
        } else {
            // Still write the file to update the timestamp, but log it differently
            writeFileSync(indexFilePath, JSON.stringify(indexData, null, 2));
            console.log(`🕒 Updated index.json timestamp (no content changes)`);
        }
        
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
                        id: generateContentId("Microsoft Copilot in Intune", "Explore Intune data with natural language", "You can now use Microsoft Copilot in Intune to explore your Intune data using natural language, take action on the results, manage policies and settings, understand your security posture, and troubleshoot device issues."),
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
    const fallbackNoticeBase = {
        id: generateContentId("Data Generation Notice", "", "This site uses automated data generation. The displayed information is currently using fallback data while the system fetches the latest updates from Microsoft Learn."),
        title: "Data Generation Notice",
        content: "This site uses automated data generation. The displayed information is currently using fallback data while the system fetches the latest updates from Microsoft Learn.",
        date: new Date().toISOString().split('T')[0],
        type: "info",
        category: "system",
        status: "active",
        source: "system"
    };
    
    // Add timestamp when writing
    const fallbackNotice = {
        ...fallbackNoticeBase,
        lastUpdated: new Date().toISOString()
    };
    
    const noticeFilename = `${fallbackNotice.date}-data-generation-notice.json`;
    writeFileSync(`${NOTICES_DIR}/${noticeFilename}`, JSON.stringify(fallbackNotice, null, 2));
    console.log(`Generated fallback notices/${noticeFilename}`);
    
    // Create fallback notices index
    const noticesIndexData = {
        lastUpdated: new Date().toISOString(),
        totalNotices: 1,
        totalFiles: 1,
        noticeFiles: [
            {
                filename: noticeFilename,
                path: `notices/${noticeFilename}`,
                title: fallbackNotice.title,
                date: fallbackNotice.date,
                type: fallbackNotice.type,
                category: fallbackNotice.category
            }
        ]
    };
    
    writeFileSync(`${NOTICES_DIR}/index.json`, JSON.stringify(noticesIndexData, null, 2));
    console.log('Generated fallback notices/index.json');
    
    // Create fallback index
    const monthlyGroups = groupDataFilesByMonth([
        {
            filename: "2025-07-14.json",
            path: "updates/2025-07-14.json",
            week: "Week of July 14, 2025",
            date: "2025-07-14",
            serviceRelease: null,
            updates: 1
        }
    ]);
    
    const indexData = {
        lastGenerated: new Date().toISOString(),
        totalUpdates: 1,
        totalFiles: 1,
        totalMonths: monthlyGroups.length,
        monthlyGroups: monthlyGroups,
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

// Utility functions for change detection and monthly grouping
function generateFileHash(content) {
    return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

function generateContentId(title, subtitle = '', content = '') {
    // Create a deterministic ID based on content
    const combinedText = `${title}${subtitle}${content}`.toLowerCase().replace(/\s+/g, '');
    const hash = crypto.createHash('md5').update(combinedText).digest('hex');
    // Return first 8 characters as a shorter, readable ID
    return parseInt(hash.substring(0, 8), 16);
}

function fileExists(filePath) {
    return existsSync(filePath);
}

function readExistingFile(filePath) {
    try {
        if (fileExists(filePath)) {
            return JSON.parse(readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        console.warn(`Error reading existing file ${filePath}:`, error.message);
    }
    return null;
}

function hasContentChanged(filePath, newContent) {
    const existingContent = readExistingFile(filePath);
    if (!existingContent) return true;
    
    // For index.json files, exclude timestamp fields from comparison
    let contentToCompare = newContent;
    let existingToCompare = existingContent;
    
    if (filePath.includes('index.json')) {
        // Create copies without timestamp fields for comparison
        contentToCompare = { ...newContent };
        existingToCompare = { ...existingContent };
        delete contentToCompare.lastGenerated;
        delete existingToCompare.lastGenerated;
        delete contentToCompare.lastUpdated;
        delete existingToCompare.lastUpdated;
    }
    
    // For individual notice files, exclude lastUpdated from comparison  
    if (filePath.includes('notices/') && !filePath.includes('index.json')) {
        contentToCompare = { ...newContent };
        existingToCompare = { ...existingContent };
        delete contentToCompare.lastUpdated;
        delete existingToCompare.lastUpdated;
    }
    
    const existingHash = generateFileHash(existingToCompare);
    const newHash = generateFileHash(contentToCompare);
    
    return existingHash !== newHash;
}

function groupDataFilesByMonth(dataFiles) {
    const monthlyGroups = new Map();
    
    dataFiles.forEach(file => {
        const date = new Date(file.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthName = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        
        if (!monthlyGroups.has(monthKey)) {
            monthlyGroups.set(monthKey, {
                month: monthName,
                monthKey: monthKey,
                date: monthKey + '-01', // First day of month for sorting
                weeks: [],
                totalUpdates: 0,
                serviceReleases: []
            });
        }
        
        const monthGroup = monthlyGroups.get(monthKey);
        monthGroup.weeks.push(file);
        monthGroup.totalUpdates += file.updates;
        
        if (file.serviceRelease && !monthGroup.serviceReleases.includes(file.serviceRelease)) {
            monthGroup.serviceReleases.push(file.serviceRelease);
        }
    });
    
    // Sort weeks within each month by date (newest first)
    monthlyGroups.forEach(monthGroup => {
        monthGroup.weeks.sort((a, b) => new Date(b.date) - new Date(a.date));
    });
    
    return Array.from(monthlyGroups.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Run the generation
generateDataFiles().catch(error => {
    console.error('Failed to generate data files:', error);
    process.exit(1);
});
