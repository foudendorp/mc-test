import fetch from 'node-fetch';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { JSDOM } from 'jsdom';
import crypto from 'crypto';

// Microsoft Learn URLs for different services
const SERVICES = {
    intune: {
        name: 'Intune',
        url: 'https://learn.microsoft.com/en-us/mem/intune/fundamentals/whats-new',
        tag: 'Intune'
    },
    entra: {
        name: 'Entra ID',
        url: 'https://learn.microsoft.com/en-us/entra/fundamentals/whats-new',
        tag: 'Entra'
    }
};

const DATA_DIR = './data';
const UPDATES_DIR = './data/updates';
const NOTICES_DIR = './data/notices';

// Service-specific directories
const INTUNE_UPDATES_DIR = './data/updates/intune';
const INTUNE_NOTICES_DIR = './data/notices/intune';
const ENTRA_UPDATES_DIR = './data/updates/entra';
const ENTRA_NOTICES_DIR = './data/notices/entra';

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
if (!existsSync(INTUNE_UPDATES_DIR)) {
    mkdirSync(INTUNE_UPDATES_DIR, { recursive: true });
}
if (!existsSync(INTUNE_NOTICES_DIR)) {
    mkdirSync(INTUNE_NOTICES_DIR, { recursive: true });
}
if (!existsSync(ENTRA_UPDATES_DIR)) {
    mkdirSync(ENTRA_UPDATES_DIR, { recursive: true });
}
if (!existsSync(ENTRA_NOTICES_DIR)) {
    mkdirSync(ENTRA_NOTICES_DIR, { recursive: true });
}

// Helper function to check if an element is a month header
function isNextMonthHeader(element) {
    if (!element || element.tagName !== 'H2') return false;
    const text = element.textContent.trim();
    return /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(text);
}

// Helper function to check if the previous element is a header (to avoid double-parsing lists)
function isPreviousElementHeader(element) {
    let prev = element.previousElementSibling;
    let lookBack = 0;
    let foundParagraphCount = 0;
    
    console.log(`    Checking if previous element is header for list...`);
    
    // Look back up to 10 elements to find a header, but be smart about it
    while (prev && lookBack < 10) {
        console.log(`    Looking back ${lookBack + 1}: ${prev.tagName} - "${prev.textContent.trim().substring(0, 50)}..."`);
        
        // If we find a header, this list should be part of that header's content
        if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(prev.tagName)) {
            console.log(`    Found header ${prev.tagName}, list belongs to header`);
            return true;
        }
        
        // Count paragraphs - if we find too many, this might be a different section
        if (prev.tagName === 'P') {
            foundParagraphCount++;
            // If we've found more than 8 paragraphs, this list is probably standalone
            if (foundParagraphCount > 8) {
                console.log(`    Found too many paragraphs (${foundParagraphCount}), treating as standalone`);
                break;
            }
        }
        
        // If we find another significant structural element, stop looking
        if (['UL', 'OL', 'TABLE'].includes(prev.tagName) && prev.textContent.trim()) {
            console.log(`    Found blocking element ${prev.tagName}, stopping search`);
            break;
        }
        
        prev = prev.previousElementSibling;
        lookBack++;
    }
    
    console.log(`    No header found within reasonable distance, treating as standalone list`);
    return false;
}

// Helper function to parse update elements
function parseUpdateElement(currentElement, service) {
    const updateTitle = currentElement.textContent.trim();
    let content = '';
    let features = [];
    let link = '';
    const htmlParts = [];
    
    // Get content from following elements
    let nextEl = currentElement.nextElementSibling;
    while (nextEl && nextEl.tagName !== 'H4' && nextEl.tagName !== 'H3' && nextEl.tagName !== 'H2') {
        if (nextEl.tagName === 'P') {
            const text = nextEl.textContent.trim();
            if (text) {
                content += (content ? ' ' : '') + text;
                // Preserve HTML for better formatting
                htmlParts.push(`<p>${extractHTMLContent(nextEl)}</p>`);
            }
        } else if (nextEl.tagName === 'UL') {
            const listItems = Array.from(nextEl.querySelectorAll('li'));
            features.push(...listItems.map(li => li.textContent.trim()));
            // Preserve HTML list structure
            const listHTML = extractHTMLContent(nextEl);
            if (listHTML.trim()) {
                htmlParts.push(`<ul>${listHTML}</ul>`);
            }
        } else if (nextEl.tagName === 'OL') {
            const listItems = Array.from(nextEl.querySelectorAll('li'));
            features.push(...listItems.map(li => li.textContent.trim()));
            // Preserve HTML list structure
            const listHTML = extractHTMLContent(nextEl);
            if (listHTML.trim()) {
                htmlParts.push(`<ol>${listHTML}</ol>`);
            }
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
    
    // Create content with HTML markup for proper display
    const htmlContent = htmlParts.length > 0 ? htmlParts.join('') : `<p>${content || 'No additional details available.'}</p>`;
    
    return {
        id: generateContentId(title, subtitle, content), // Deterministic ID based on content
        title: title,
        subtitle: subtitle || undefined,
        content: htmlContent, // Now includes HTML markup
        features: features.length > 0 ? features : undefined,
        service: service.tag, // Add service tag to individual updates
        link: link || service.url
    };
}

// Parse Microsoft Learn page content for a specific service
async function fetchServiceUpdates(service) {
    try {
        console.log(`Fetching ${service.name} updates from Microsoft Learn...`);
        const response = await fetch(service.url);
        const html = await response.text();
        
        // Use JSDOM to parse HTML (lighter alternative to cheerio for this use case)
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        const updates = [];
        const notices = [];
        const weeklyUpdates = new Map();
        
        // Handle different structures for different services
        if (service.tag === 'Entra') {
            // For Entra ID, use enhanced parsing for the comprehensive structure
            const weeklyUpdates = await parseEntraUpdates(document, service);
            
            // Still need to parse notices for Entra
            const notices = [];
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
                        service: service.tag, // Add service tag to notices
                        type: 'warning',
                        category: 'plan-for-change',
                        status: 'active',
                        source: 'microsoft-learn'
                    };
                    
                    notices.push(noticeData);
                }
            });
            
            return { weeklyUpdates, notices };
        } else {
            // For Intune and other services, use week-based structure
            const weekHeaders = Array.from(document.querySelectorAll('h2'))
                .filter(h2 => h2.textContent.includes('Week of'));
            
            console.log(`Found ${weekHeaders.length} week sections for ${service.name}`);
            
            weekHeaders.forEach((weekHeader, index) => {
                const weekText = weekHeader.textContent.trim();
                console.log(`Processing ${service.name}: ${weekText}`);
                
                // Extract date from week header
                const dateMatch = weekText.match(/Week of (.+?)(?:\s*\(|$)/);
                const date = dateMatch ? new Date(dateMatch[1]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                
                // Check for service release info
                const serviceReleaseMatch = weekText.match(/\(([^)]+)\)/);
                const serviceRelease = serviceReleaseMatch ? serviceReleaseMatch[1] : null;
                
                const weekData = {
                    week: weekText,
                    date: date,
                    service: service.tag, // Add service tag
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
                        const update = parseUpdateElement(currentElement, service);
                        if (update) {
                            currentTopic.updates.push(update);
                        }
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
        }
        
        // Look for important notices (typically at the top of the page)
        const noticeHeaders = Array.from(document.querySelectorAll('h3, h4'))
            .filter(h => h.textContent.toLowerCase().includes('plan for change') || 
                        h.textContent.toLowerCase().includes('notice') ||
                        h.textContent.toLowerCase().includes('important'));
        
        noticeHeaders.forEach(header => {
            let content = '';
            const htmlParts = [];
            let nextEl = header.nextElementSibling;
            
            while (nextEl && !['H2', 'H3', 'H4'].includes(nextEl.tagName)) {
                if (nextEl.tagName === 'P') {
                    // Preserve HTML markup for better formatting
                    const text = nextEl.textContent.trim();
                    const htmlContent = extractHTMLContent(nextEl);
                    
                    content += (content ? '\n' : '') + text;
                    htmlParts.push(`<p>${htmlContent}</p>`);
                } else if (nextEl.tagName === 'UL' || nextEl.tagName === 'OL') {
                    // Include list content in notices
                    const listItems = Array.from(nextEl.querySelectorAll('li'));
                    const listText = listItems.map(li => '• ' + li.textContent.trim()).join('\n');
                    const listHTML = extractHTMLContent(nextEl);
                    
                    content += (content ? '\n' : '') + listText;
                    htmlParts.push(`<${nextEl.tagName.toLowerCase()}>${listHTML}</${nextEl.tagName.toLowerCase()}>`);
                }
                nextEl = nextEl.nextElementSibling;
            }
            
            if (content) {
                // Create content with HTML markup for proper display
                const htmlContent = htmlParts.length > 0 ? htmlParts.join('') : `<p>${content}</p>`;
                
                // Create notice without timestamp for consistent content
                const noticeData = {
                    id: generateContentId(header.textContent.trim(), '', content), // Deterministic ID based on content
                    title: header.textContent.trim(),
                    content: htmlContent, // Now includes HTML markup
                    content: content.trim(),
                    date: new Date().toISOString().split('T')[0],
                    service: service.tag, // Add service tag to notices
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

// Fetch updates from all services and return them separated by service
async function fetchAllServiceUpdates() {
    const serviceData = {};
    
    // Fetch from each service
    for (const [serviceKey, service] of Object.entries(SERVICES)) {
        try {
            const { weeklyUpdates, notices } = await fetchServiceUpdates(service);
            serviceData[serviceKey] = { weeklyUpdates, notices, service };
            
        } catch (error) {
            console.error(`Error fetching ${service.name} updates:`, error);
            serviceData[serviceKey] = { weeklyUpdates: new Map(), notices: [], service };
        }
    }
    
    return serviceData;
}

function mapTopicToCategory(topicText) {
    const topic = topicText.toLowerCase();
    
    // Intune-specific mappings
    if (topic.includes('app') && topic.includes('management')) return 'app-management';
    if (topic.includes('device') && topic.includes('configuration')) return 'device-configuration';
    if (topic.includes('device') && topic.includes('management')) return 'device-management';
    if (topic.includes('device') && topic.includes('security')) return 'device-security';
    if (topic.includes('intune') && topic.includes('apps')) return 'intune-apps';
    if (topic.includes('monitor') || topic.includes('troubleshoot')) return 'monitor-troubleshoot';
    if (topic.includes('microsoft') && topic.includes('intune') && topic.includes('suite')) return 'intune-suite';
    
    // Entra ID-specific mappings
    if (topic.includes('identity') && topic.includes('management')) return 'identity-management';
    if (topic.includes('conditional') && topic.includes('access')) return 'conditional-access';
    if (topic.includes('multi-factor') || topic.includes('mfa')) return 'authentication';
    if (topic.includes('authentication')) return 'authentication';
    if (topic.includes('identity') && topic.includes('governance')) return 'identity-governance';
    if (topic.includes('privileged') && topic.includes('identity')) return 'privileged-identity';
    if (topic.includes('external') && topic.includes('identities')) return 'external-identities';
    if (topic.includes('application') && topic.includes('management')) return 'application-management';
    
    // General mappings
    if (topic.includes('app') || topic.includes('application')) return 'app-management';
    if (topic.includes('device')) return 'device-management';
    if (topic.includes('security')) return 'device-security';
    if (topic.includes('configuration') || topic.includes('policy')) return 'device-configuration';
    if (topic.includes('identity')) return 'identity-management';
    
    return 'device-management'; // Default category
}

// Generate JSON files separated by service
async function generateDataFiles() {
    console.log('Starting data generation...');
    
    // Ensure all service directories exist
    [DATA_DIR, UPDATES_DIR, NOTICES_DIR, INTUNE_UPDATES_DIR, INTUNE_NOTICES_DIR, ENTRA_UPDATES_DIR, ENTRA_NOTICES_DIR].forEach(dir => {
        if (!existsSync(dir)) {
            console.log(`Creating directory: ${dir}`);
            mkdirSync(dir, { recursive: true });
        }
    });
    
    try {
        const serviceData = await fetchAllServiceUpdates();
        
        // Track overall stats
        let totalUpdates = 0;
        let totalNotices = 0;
        const allDataFiles = [];
        
        // Process each service separately
        for (const [serviceKey, { weeklyUpdates, notices, service }] of Object.entries(serviceData)) {
            console.log(`\n=== Processing ${service.name} ===`);
            console.log(`Found ${weeklyUpdates.size} weeks of updates`);
            console.log(`Found ${notices.length} notices`);
            
            // Generate service-specific update files
            const serviceDataFiles = [];
            let serviceUpdates = 0;
            let filesUpdated = 0;
            
            // Determine service directory
            const serviceUpdatesDir = serviceKey === 'intune' ? INTUNE_UPDATES_DIR : ENTRA_UPDATES_DIR;
            const serviceNoticesDir = serviceKey === 'intune' ? INTUNE_NOTICES_DIR : ENTRA_NOTICES_DIR;
            
            for (const [date, weekData] of weeklyUpdates) {
                const filename = `${date}.json`;
                const filePath = `${serviceUpdatesDir}/${filename}`;
                const updateCount = weekData.topics.reduce((sum, topic) => sum + topic.updates.length, 0);
                
                if (updateCount > 0) {
                    // Check if content has changed before writing
                    if (hasContentChanged(filePath, weekData)) {
                        writeFileSync(filePath, JSON.stringify(weekData, null, 2));
                        filesUpdated++;
                        console.log(`✅ Updated ${serviceKey}/updates/${filename} with ${updateCount} updates`);
                    } else {
                        console.log(`⏭️  Skipped ${serviceKey}/updates/${filename} (no changes)`);
                    }
                    
                    serviceDataFiles.push({
                        filename: filename,
                        path: `updates/${serviceKey}/${filename}`,
                        week: weekData.week || weekData.month || `Week of ${weekData.date}`,
                        date: weekData.date,
                        service: service.tag,
                        serviceRelease: weekData.serviceRelease,
                        updates: updateCount
                    });
                    
                    serviceUpdates += updateCount;
                }
            }
            
            console.log(`📁 ${service.name} - Files processed: ${serviceDataFiles.length}, Files updated: ${filesUpdated}`);
            
            // Scan for existing files that weren't generated by scraping
            try {
                if (existsSync(serviceUpdatesDir)) {
                    const existingFiles = readdirSync(serviceUpdatesDir);
                    const jsonFiles = existingFiles.filter(file => file.endsWith('.json'));
                    
                    for (const filename of jsonFiles) {
                        const filePath = `${serviceUpdatesDir}/${filename}`;
                        
                        // Check if this file was already processed during scraping
                        const alreadyProcessed = serviceDataFiles.some(df => df.filename === filename);
                        
                        if (!alreadyProcessed) {
                            try {
                                const existingData = JSON.parse(readFileSync(filePath, 'utf8'));
                                const updateCount = existingData.topics ? 
                                    existingData.topics.reduce((sum, topic) => sum + (topic.updates ? topic.updates.length : 0), 0) : 0;
                                
                                if (updateCount > 0) {
                                    // Handle different structures for different services
                                    let displayText;
                                    if (existingData.month) {
                                        // Month-based structure (Entra)
                                        displayText = existingData.month;
                                    } else if (existingData.week) {
                                        // Week-based structure (Intune)
                                        displayText = existingData.week;
                                    } else {
                                        // Fallback
                                        displayText = `Week of ${existingData.date}`;
                                    }
                                    
                                    serviceDataFiles.push({
                                        filename: filename,
                                        path: `updates/${serviceKey}/${filename}`,
                                        week: displayText,
                                        date: existingData.date,
                                        service: existingData.service || service.tag,
                                        serviceRelease: existingData.serviceRelease || null,
                                        updates: updateCount
                                    });
                                    
                                    serviceUpdates += updateCount;
                                    console.log(`📄 Found existing ${serviceKey} updates/${filename} with ${updateCount} updates`);
                                }
                            } catch (parseError) {
                                console.warn(`⚠️  Error parsing existing file ${filename}:`, parseError.message);
                            }
                        }
                    }
                }
            } catch (scanError) {
                console.warn(`⚠️  Error scanning existing files for ${service.name}:`, scanError.message);
            }
            
            // Generate service-specific notice files
            const serviceNoticeFiles = [];
            let noticesUpdated = 0;
            
            if (notices.length > 0) {
                notices.forEach((notice) => {
                    // Create a unique filename based on notice title and date
                    const sanitizedTitle = notice.title
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, '-')
                        .replace(/-+/g, '-')
                        .replace(/^-|-$/g, '')
                        .substring(0, 50);
                    
                    const filename = `${notice.date}-${sanitizedTitle}.json`;
                    const filePath = `${serviceNoticesDir}/${filename}`;
                    
                    if (hasContentChanged(filePath, notice)) {
                        // Add timestamp only when writing
                        const noticeWithTimestamp = {
                            ...notice,
                            lastUpdated: new Date().toISOString()
                        };
                        
                        writeFileSync(filePath, JSON.stringify(noticeWithTimestamp, null, 2));
                        noticesUpdated++;
                        console.log(`✅ Updated ${serviceKey}/notices/${filename}`);
                    } else {
                        console.log(`⏭️  Skipped ${serviceKey}/notices/${filename} (no changes)`);
                    }
                    
                    serviceNoticeFiles.push({
                        filename: filename,
                        path: `notices/${serviceKey}/${filename}`,
                        title: notice.title,
                        date: notice.date,
                        service: service.tag,
                        type: notice.type,
                        category: notice.category
                    });
                });
                
                console.log(`📁 ${service.name} - Notices processed: ${notices.length}, Files updated: ${noticesUpdated}`);
            }
            
            // Create service-specific notices index
            const serviceNoticesIndexPath = `${serviceNoticesDir}/index.json`;
            const serviceNoticesIndexDataWithoutTimestamp = {
                service: service.tag,
                serviceName: service.name,
                totalNotices: notices.length,
                totalFiles: serviceNoticeFiles.length,
                noticeFiles: serviceNoticeFiles.sort((a, b) => new Date(b.date) - new Date(a.date))
            };
            
            if (hasContentChanged(serviceNoticesIndexPath, serviceNoticesIndexDataWithoutTimestamp)) {
                const serviceNoticesIndexData = {
                    lastUpdated: new Date().toISOString(),
                    ...serviceNoticesIndexDataWithoutTimestamp
                };
                
                writeFileSync(serviceNoticesIndexPath, JSON.stringify(serviceNoticesIndexData, null, 2));
                console.log(`✅ Updated ${serviceKey}/notices/index.json with ${serviceNoticeFiles.length} notice files`);
            } else {
                console.log(`⏭️  Skipped ${serviceKey}/notices/index.json (no changes)`);
            }
            
            // Add to overall tracking
            totalUpdates += serviceUpdates;
            totalNotices += notices.length;
            allDataFiles.push(...serviceDataFiles);
        }
        
        // If no data was scraped from any service, create fallback data
        if (allDataFiles.length === 0) {
            console.log('No data scraped from any service, creating fallback data...');
            await createFallbackData();
            return;
        }
        
        // Group all data files by month for the main index
        const monthlyGroups = groupDataFilesByMonth(allDataFiles);
        
        // Create main index data without timestamp first for comparison
        const indexDataWithoutTimestamp = {
            totalUpdates: totalUpdates,
            totalFiles: allDataFiles.length,
            totalMonths: monthlyGroups.length,
            totalNotices: totalNotices,
            services: Object.keys(serviceData).map(key => serviceData[key].service.tag),
            monthlyGroups: monthlyGroups,
            dataFiles: allDataFiles.sort((a, b) => new Date(b.date) - new Date(a.date))
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
            console.log(`✅ Updated index.json with ${allDataFiles.length} data files from ${Object.keys(serviceData).length} services grouped into ${monthlyGroups.length} months`);
        } else {
            // Still write the file to update the timestamp, but log it differently
            writeFileSync(indexFilePath, JSON.stringify(indexData, null, 2));
            console.log(`🕒 Updated index.json timestamp (no content changes)`);
        }
        
        console.log('\n=== Data generation completed successfully! ===');
        console.log(`Total: ${totalUpdates} updates across ${allDataFiles.length} weeks from ${Object.keys(serviceData).length} services`);
        console.log(`Total: ${totalNotices} notices from all services`);
        
    } catch (error) {
        console.error('Error during data generation:', error);
        console.log('Creating fallback data due to error...');
        await createFallbackData();
    }
}

async function createFallbackData() {
    console.log('Creating fallback data with service separation...');
    
    // Ensure all service directories exist
    [DATA_DIR, UPDATES_DIR, NOTICES_DIR, INTUNE_UPDATES_DIR, INTUNE_NOTICES_DIR, ENTRA_UPDATES_DIR, ENTRA_NOTICES_DIR].forEach(dir => {
        if (!existsSync(dir)) {
            console.log(`Creating directory: ${dir}`);
            mkdirSync(dir, { recursive: true });
        }
    });
    
    // Create fallback Intune update data
    const fallbackIntuneData = {
        week: "Week of July 14, 2025",
        date: "2025-07-14",
        service: "Intune",
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
                        content: "<p>You can now use Microsoft Copilot in Intune to explore your Intune data using natural language, take action on the results, manage policies and settings, understand your security posture, and troubleshoot device issues.</p><ul><li>Explore your Intune data using natural language queries</li><li>Conversational chat experience for device troubleshooting</li><li>Policy and setting management assistance</li></ul>",
                        features: [
                            "Explore your Intune data using natural language queries",
                            "Conversational chat experience for device troubleshooting",
                            "Policy and setting management assistance"
                        ],
                        service: "Intune",
                        link: "https://learn.microsoft.com/en-us/mem/intune/fundamentals/whats-new"
                    }
                ]
            }
        ]
    };
    
    writeFileSync(`${INTUNE_UPDATES_DIR}/2025-07-14.json`, JSON.stringify(fallbackIntuneData, null, 2));
    console.log('Generated fallback updates/intune/2025-07-14.json');
    
    // Create fallback Entra update data
    const fallbackEntraData = {
        month: "July 2025", // Use month instead of week for Entra
        date: "2025-07-14",
        service: "Entra",
        serviceRelease: null,
        topics: [
            {
                topic: "Identity management",
                category: "identity-management",
                updates: [
                    {
                        id: generateContentId("Microsoft Entra ID Updates", "Latest identity management features", "Microsoft Entra ID continues to evolve with new features for identity and access management, providing better security and user experience."),
                        title: "Microsoft Entra ID Updates",
                        subtitle: "Latest identity management features",
                        content: "<p>Microsoft Entra ID continues to evolve with new features for identity and access management, providing better security and user experience.</p><ul><li>Enhanced conditional access policies</li><li>Improved multi-factor authentication</li><li>Better integration with Microsoft 365</li></ul>",
                        features: [
                            "Enhanced conditional access policies",
                            "Improved multi-factor authentication",
                            "Better integration with Microsoft 365"
                        ],
                        service: "Entra",
                        link: "https://learn.microsoft.com/en-us/entra/fundamentals/whats-new"
                    }
                ]
            }
        ]
    };
    
    writeFileSync(`${ENTRA_UPDATES_DIR}/2025-07-14.json`, JSON.stringify(fallbackEntraData, null, 2));
    console.log('Generated fallback updates/entra/2025-07-14.json');
    
    // Create fallback system notice
    const fallbackNoticeBase = {
        id: generateContentId("Data Generation Notice", "", "This site uses automated data generation. The displayed information is currently using fallback data while the system fetches the latest updates from Microsoft Learn."),
        title: "Data Generation Notice",
        content: "<p>This site uses automated data generation. The displayed information is currently using fallback data while the system fetches the latest updates from Microsoft Learn.</p>",
        date: new Date().toISOString().split('T')[0],
        service: "System",
        type: "info",
        category: "system",
        status: "active",
        source: "system"
    };
    
    const fallbackNotice = {
        ...fallbackNoticeBase,
        lastUpdated: new Date().toISOString()
    };
    
    const noticeFilename = `${fallbackNotice.date}-data-generation-notice.json`;
    
    // Create notices in both service directories for visibility
    [INTUNE_NOTICES_DIR, ENTRA_NOTICES_DIR].forEach(dir => {
        writeFileSync(`${dir}/${noticeFilename}`, JSON.stringify(fallbackNotice, null, 2));
    });
    console.log(`Generated fallback notices in both service directories`);
    
    // Create service-specific notices indexes
    const noticeFileEntry = {
        filename: noticeFilename,
        path: `notices/system/${noticeFilename}`,
        title: fallbackNotice.title,
        date: fallbackNotice.date,
        service: "System",
        type: fallbackNotice.type,
        category: fallbackNotice.category
    };
    
    // Intune notices index
    const intuneNoticesIndexData = {
        lastUpdated: new Date().toISOString(),
        service: "Intune",
        serviceName: "Microsoft Intune",
        totalNotices: 1,
        totalFiles: 1,
        noticeFiles: [noticeFileEntry]
    };
    writeFileSync(`${INTUNE_NOTICES_DIR}/index.json`, JSON.stringify(intuneNoticesIndexData, null, 2));
    
    // Entra notices index
    const entraNoticesIndexData = {
        lastUpdated: new Date().toISOString(),
        service: "Entra",
        serviceName: "Microsoft Entra ID",
        totalNotices: 1,
        totalFiles: 1,
        noticeFiles: [noticeFileEntry]
    };
    writeFileSync(`${ENTRA_NOTICES_DIR}/index.json`, JSON.stringify(entraNoticesIndexData, null, 2));
    console.log('Generated fallback notices indexes for both services');
    
    // Create fallback main index
    const allDataFiles = [
        {
            filename: "2025-07-14.json",
            path: "updates/intune/2025-07-14.json",
            week: "Week of July 14, 2025",
            date: "2025-07-14",
            service: "Intune",
            serviceRelease: null,
            updates: 1
        },
        {
            filename: "2025-07-14.json",
            path: "updates/entra/2025-07-14.json",
            week: "July 2025", // Use month for Entra display
            date: "2025-07-14",
            service: "Entra",
            serviceRelease: null,
            updates: 1
        }
    ];
    
    const monthlyGroups = groupDataFilesByMonth(allDataFiles);
    
    const indexData = {
        lastGenerated: new Date().toISOString(),
        totalUpdates: 2,
        totalFiles: 2,
        totalMonths: monthlyGroups.length,
        totalNotices: 2,
        services: ["Intune", "Entra"],
        monthlyGroups: monthlyGroups,
        dataFiles: allDataFiles
    };
    
    writeFileSync(`${DATA_DIR}/index.json`, JSON.stringify(indexData, null, 2));
    console.log('Generated fallback index.json with service separation');
    
    console.log('Fallback data creation completed with service-separated structure');
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

// Enhanced parsing function specifically for Entra updates
async function parseEntraUpdates(document, service) {
    const weeklyUpdates = new Map();
    
    console.log(`\n=== DEBUGGING ENTRA STRUCTURE ===`);
    console.log(`Processing ${service.name} from ${service.url}`);
    
    // First, let's understand the actual page structure
    const allElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, table, div.tabpanel'));
    console.log(`\nFound ${allElements.length} structural elements`);
    
    // Log first 15 elements to understand structure
    allElements.slice(0, 15).forEach((el, index) => {
        const text = el.textContent.trim().substring(0, 100);
        console.log(`${index}: ${el.tagName} - "${text}..."`);
    });
    
    // Look for month-based headers (e.g., "July 2025", "June 2025")
    const monthHeaders = Array.from(document.querySelectorAll('h2, h3'))
        .filter(header => {
            const text = header.textContent.trim();
            const isMonth = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(text);
            if (isMonth) {
                console.log(`Found month header: "${text}" (${header.tagName})`);
            }
            return isMonth;
        });
    
    console.log(`\nFound ${monthHeaders.length} month sections for ${service.name}`);
    
    // If no month headers found, try a different approach
    if (monthHeaders.length === 0) {
        console.log('No month headers found, trying alternative parsing...');
        
        // Look for tabpanel divs which might contain the content
        const tabPanels = Array.from(document.querySelectorAll('div[role="tabpanel"], .tabpanel'));
        console.log(`Found ${tabPanels.length} tab panels`);
        
        tabPanels.forEach((panel, index) => {
            console.log(`Tab panel ${index}: ${panel.textContent.trim().substring(0, 200)}...`);
            
            // Look for month headers within tab panels
            const innerMonthHeaders = Array.from(panel.querySelectorAll('h2, h3, h4'))
                .filter(header => {
                    const text = header.textContent.trim();
                    return /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(text);
                });
            
            if (innerMonthHeaders.length > 0) {
                console.log(`Found ${innerMonthHeaders.length} month headers in tab panel ${index}`);
                monthHeaders.push(...innerMonthHeaders);
            }
        });
        
        // If still no month headers, try looking for any content that might be updates
        if (monthHeaders.length === 0) {
            console.log('Still no month headers, looking for table-based content...');
            
            // Look for tables that might contain the updates
            const tables = Array.from(document.querySelectorAll('table'));
            console.log(`Found ${tables.length} tables`);
            
            tables.forEach((table, index) => {
                const rows = table.querySelectorAll('tr');
                console.log(`Table ${index}: ${rows.length} rows`);
                if (rows.length > 1) {
                    // This might be our updates table
                    const headers = Array.from(rows[0].querySelectorAll('th, td')).map(cell => cell.textContent.trim());
                    console.log(`Table ${index} headers:`, headers);
                    
                    // Create a synthetic month entry for the current date
                    const currentDate = new Date();
                    const monthText = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
                    
                    const monthData = {
                        month: monthText,
                        date: monthDate,
                        service: service.tag,
                        serviceRelease: null,
                        topics: []
                    };
                    
                    parseTableUpdates(table, monthData);
                    
                    if (monthData.topics.length > 0) {
                        console.log(`Parsed ${monthData.topics.length} topics from table ${index}`);
                        weeklyUpdates.set(monthDate, monthData);
                    }
                }
            });
        }
    }
    
    // Process found month headers
    for (const monthHeader of monthHeaders) {
        const monthText = monthHeader.textContent.trim();
        console.log(`\n=== Processing ${service.name}: ${monthText} ===`);
        
        // Extract date from month header (use last day of previous month to match the pattern)
        const [monthName, year] = monthText.split(' ');
        const monthIndex = new Date(Date.parse(monthName + " 1, 2000")).getMonth();
        const monthDate = new Date(parseInt(year), monthIndex, 1);
        const lastDayOfMonth = new Date(parseInt(year), monthIndex + 1, 0);
        const dateString = lastDayOfMonth.toISOString().split('T')[0];
        
        const monthData = {
            month: monthText,
            date: dateString,
            service: service.tag,
            serviceRelease: null,
            topics: []
        };
        
        // Find content between this month header and the next one
        let currentElement = monthHeader.nextElementSibling;
        let foundUpdates = 0;
        
        console.log(`Looking for content after month header...`);
        
        while (currentElement && !isNextMonthHeader(currentElement)) {
            if (currentElement.tagName === 'TABLE') {
                console.log(`Found table, parsing...`);
                parseTableUpdates(currentElement, monthData);
                foundUpdates++;
            } else if ((currentElement.tagName === 'UL' || currentElement.tagName === 'OL') && 
                       !isPreviousElementHeader(currentElement)) {
                // Only parse standalone lists, not lists that follow headers (those are handled by header parsing)
                console.log(`Found standalone list, checking if it should be parsed...`);
                console.log(`List content preview: "${currentElement.textContent.trim().substring(0, 100)}..."`);
                console.log(`isPreviousElementHeader result: ${isPreviousElementHeader(currentElement)}`);
                parseListUpdates(currentElement, monthData);
                foundUpdates++;
            } else if (currentElement.tagName === 'DIV' && currentElement.querySelector('h3, h4, table')) {
                console.log(`Found div with content, parsing...`);
                // Check for tables within the div
                const tables = currentElement.querySelectorAll('table');
                tables.forEach(table => parseTableUpdates(table, monthData));
                
                // Check for direct sections
                parseSectionUpdates(currentElement, monthData);
                foundUpdates++;
            } else if (currentElement.tagName === 'H3' || currentElement.tagName === 'H4') {
                console.log(`Found ${currentElement.tagName}: "${currentElement.textContent.trim().substring(0, 50)}..."`);
                parseDirectSection(currentElement, monthData);
                foundUpdates++;
            }
            
            currentElement = currentElement.nextElementSibling;
        }
        
        console.log(`Found ${foundUpdates} potential update elements in ${monthText}`);
        console.log(`Total topics created: ${monthData.topics.length}`);
        monthData.topics.forEach(topic => {
            console.log(`  Topic: "${topic.topic}" (${topic.updates.length} updates)`);
        });
        
        // Add months that have topics with updates
        const hasUpdates = monthData.topics.some(topic => topic.updates && topic.updates.length > 0);
        if (hasUpdates) {
            console.log(`✅ Adding month ${monthText} with ${monthData.topics.reduce((sum, topic) => sum + topic.updates.length, 0)} total updates`);
            weeklyUpdates.set(dateString, monthData);
        } else {
            console.log(`❌ Skipping month ${monthText} - no updates found`);
        }
    }
    
    console.log(`\n=== ENTRA PARSING COMPLETE ===`);
    console.log(`Total months with updates: ${weeklyUpdates.size}`);
    
    return weeklyUpdates;
}

// Parse table-based updates (common in Microsoft Learn)
function parseTableUpdates(table, monthData) {
    const rows = Array.from(table.querySelectorAll('tr'));
    
    // Skip header row if present
    const dataRows = rows.slice(1);
    
    dataRows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length >= 3) {
            const typeCell = cells[0];
            const serviceCategoryCell = cells[1];
            const descriptionCell = cells[2];
            const productCapabilityCell = cells.length > 3 ? cells[3] : null;
            
            const title = extractTextContent(descriptionCell);
            const type = extractTextContent(typeCell);
            const serviceCategory = extractTextContent(serviceCategoryCell);
            const productCapability = productCapabilityCell ? extractTextContent(productCapabilityCell) : null;
            
            // Get HTML content for better formatting
            const descriptionHTML = extractHTMLContent(descriptionCell);
            const contentHTML = descriptionHTML ? `<div>${descriptionHTML}</div>` : `<p>${title}</p>`;
            const finalContent = contentHTML + (productCapability ? ` <span class="product-capability">- ${productCapability}</span>` : '');
            
            // Convert to frontend-compatible format with correct mapping
            const update = {
                id: generateContentId(title, type, title),
                title: title, // Topic (Title) from Microsoft Learn
                subtitle: type ? `Type: ${type}` : undefined,
                content: finalContent, // Now includes HTML markup
                service: 'Entra',
                link: extractLinks(descriptionCell)[0]?.url || 'whats-new-archive'
            };
            
            // Use Product Capability as the topic (for "Topic" column)
            // Use Service Category for category mapping (for "Category" column)
            const topicName = productCapability || 'General';
            let topic = monthData.topics.find(t => t.topic === topicName);
            if (!topic) {
                topic = {
                    topic: topicName, // Product Capability -> Topic column
                    category: mapServiceCategoryToCategory(serviceCategory), // Service Category -> Category column
                    updates: []
                };
                monthData.topics.push(topic);
            }
            
            topic.updates.push(update);
        }
    });
}

// Parse list-based updates
function parseListUpdates(list, monthData) {
    const items = Array.from(list.querySelectorAll('li'));
    
    items.forEach(item => {
        const text = extractTextContent(item);
        if (text.trim()) {
            // Get HTML content for better formatting
            const itemHTML = extractHTMLContent(item);
            const contentHTML = itemHTML ? `<div>${itemHTML}</div>` : `<p>${text}</p>`;
            
            // Convert to frontend-compatible format
            const update = {
                id: generateContentId(text, 'Update', text),
                title: text,
                subtitle: undefined,
                content: contentHTML, // Now includes HTML markup
                service: 'Entra',
                link: extractLinks(item)[0]?.url || 'whats-new-archive'
            };
            
            // Find or create general topic
            let topic = monthData.topics.find(t => t.topic === 'General Updates');
            if (!topic) {
                topic = {
                    topic: 'General Updates',
                    category: 'identity-management',
                    updates: []
                };
                monthData.topics.push(topic);
            }
            
            topic.updates.push(update);
        }
    });
}

// Parse section-based updates
function parseSectionUpdates(section, monthData) {
    const headers = section.querySelectorAll('h3, h4');
    
    headers.forEach(header => {
        const update = parseEntraUpdateFromHeader(header, monthData.date);
        
        if (update) {
            // Use Product Capability as the topic (for "Topic" column)
            // Use Service Category for category mapping (for "Category" column)
            const topicName = update.productCapability || 'General';
            let topic = monthData.topics.find(t => t.topic === topicName);
            if (!topic) {
                topic = {
                    topic: topicName, // Product Capability -> Topic column
                    category: mapServiceCategoryToCategory(update.serviceCategory), // Service Category -> Category column
                    updates: []
                };
                monthData.topics.push(topic);
            }
            
            topic.updates.push(update);
        }
    });
}

// Parse direct H3 sections (this is where the real Entra data is)
function parseDirectSection(header, monthData) {
    const update = parseEntraUpdateFromHeader(header, monthData.date);
    
    if (update) {
        // Use Product Capability as the topic (for "Topic" column)
        // Use Service Category for category mapping (for "Category" column)
        const topicName = update.productCapability || 'General';
        let topic = monthData.topics.find(t => t.topic === topicName);
        if (!topic) {
            topic = {
                topic: topicName, // Product Capability -> Topic column
                category: mapServiceCategoryToCategory(update.serviceCategory), // Service Category -> Category column
                updates: []
            };
            monthData.topics.push(topic);
        }
        
        topic.updates.push(update);
    }
}

// Parse update from header element specifically for Entra format
function parseEntraUpdateFromHeader(header, date) {
    const originalTitle = extractTextContent(header);
    console.log(`Parsing Entra update: "${originalTitle}"`);
    
    // Extract availability status and clean the title
    let cleanTitle = originalTitle;
    let availabilityStatus = null;
    
    const statusMap = [
        { prefix: 'General Availability - ', status: 'General Availability' },
        { prefix: 'General Availability – ', status: 'General Availability' }, // Different dash character
        { prefix: 'General Availability- ', status: 'General Availability' }, // No space before dash
        { prefix: 'General Availability ΓÇô ', status: 'General Availability' }, // Another dash character variant
        { prefix: 'Public Preview - ', status: 'Public Preview' },
        { prefix: 'Public Preview – ', status: 'Public Preview' }, // Different dash character
        { prefix: 'Public Preview- ', status: 'Public Preview' }, // No space before dash
        { prefix: 'Public Preview ΓÇô ', status: 'Public Preview' }, // Another dash character variant
        { prefix: 'Deprecated - ', status: 'Deprecated' },
        { prefix: 'Deprecated – ', status: 'Deprecated' }, // Different dash character
        { prefix: 'Deprecated- ', status: 'Deprecated' }, // No space before dash
        { prefix: 'Deprecated ΓÇô ', status: 'Deprecated' }, // Another dash character variant
        { prefix: 'New feature - ', status: 'New feature' },
        { prefix: 'New feature – ', status: 'New feature' }, // Different dash character
        { prefix: 'New feature- ', status: 'New feature' }, // No space before dash
        { prefix: 'New feature ΓÇô ', status: 'New feature' }, // Another dash character variant
        { prefix: 'Changed feature - ', status: 'Changed feature' },
        { prefix: 'Changed feature – ', status: 'Changed feature' }, // Different dash character
        { prefix: 'Changed feature- ', status: 'Changed feature' }, // No space before dash
        { prefix: 'Changed feature ΓÇô ', status: 'Changed feature' }, // Another dash character variant
        { prefix: 'Plan for change - ', status: 'Plan for change' },
        { prefix: 'Plan for change – ', status: 'Plan for change' }, // Different dash character
        { prefix: 'Plan for change- ', status: 'Plan for change' }, // No space before dash
        { prefix: 'Plan for change ΓÇô ', status: 'Plan for change' } // Another dash character variant
    ];
    
    // Extract availability status and remove prefix from title
    for (const item of statusMap) {
        if (cleanTitle.startsWith(item.prefix)) {
            availabilityStatus = item.status;
            cleanTitle = cleanTitle.substring(item.prefix.length);
            break;
        }
    }
    
    console.log(`Cleaned title: "${cleanTitle}"`);
    console.log(`Availability status: "${availabilityStatus}"`);
    
    // Look for the structured content after the header
    let description = cleanTitle;
    let type = 'Update';
    let serviceCategory = 'General';
    let productCapability = null;
    let currentElement = header.nextElementSibling;
    const descriptionParts = [];
    const htmlParts = [];
    
    // Look for the Type/Service category/Product capability line and collect all content
    while (currentElement && !['H1', 'H2', 'H3', 'H4'].includes(currentElement.tagName)) {
        const text = extractTextContent(currentElement);
        
        // Check if this element contains the structured metadata
        if (text.includes('Type:') && text.includes('Service category:')) {
            console.log(`Found structured metadata: "${text}"`);
            // Parse the structured line like: "Type: New featureService category: Conditional AccessProduct capability: Identity Security & Protection"
            const typeMatch = text.match(/Type:\s*([^]+?)(?=Service category:|Product capability:|$)/);
            const serviceCategoryMatch = text.match(/Service category:\s*([^]+?)(?=Product capability:|Type:|$)/);
            const productCapabilityMatch = text.match(/Product capability:\s*([^]+?)(?=Type:|Service category:|$)/);
            
            if (typeMatch) {
                type = typeMatch[1].trim();
                console.log(`Extracted type: "${type}"`);
            }
            if (serviceCategoryMatch) {
                serviceCategory = serviceCategoryMatch[1].trim();
                console.log(`Extracted serviceCategory: "${serviceCategory}"`);
            }
            if (productCapabilityMatch) {
                productCapability = productCapabilityMatch[1].trim();
                console.log(`Extracted productCapability: "${productCapability}"`);
            }
        } else if (currentElement.tagName === 'P' && text.trim() && !text.includes('Type:')) {
            // Regular description paragraph - preserve HTML
            descriptionParts.push(text);
            htmlParts.push(`<p>${extractHTMLContent(currentElement)}</p>`);
        } else if (currentElement.tagName === 'UL' || currentElement.tagName === 'OL') {
            // Include list content as part of the update description - preserve HTML structure
            const listItems = Array.from(currentElement.querySelectorAll('li'));
            const textContent = listItems.map(item => '• ' + extractTextContent(item)).join('\n');
            const htmlContent = extractHTMLContent(currentElement);
            
            if (textContent.trim()) {
                descriptionParts.push('The following combinations are supported:\n' + textContent);
                htmlParts.push(`<p>The following combinations are supported:</p><${currentElement.tagName.toLowerCase()}>${htmlContent}</${currentElement.tagName.toLowerCase()}>`);
            }
        }
        
        currentElement = currentElement.nextElementSibling;
        
        // Don't limit description content too much, we want complete updates
        if (descriptionParts.length >= 5) break;
    }
    
    if (descriptionParts.length > 0) {
        description = descriptionParts.join(' ');
    }
    
    // Create content with HTML markup for proper display
    const htmlContent = htmlParts.length > 0 ? htmlParts.join('') : `<p>${description}</p>`;
    const finalContent = htmlContent + (productCapability ? ` <span class="product-capability">- ${productCapability}</span>` : '');
    
    // If no availability status was found in prefix, try to use the extracted type if it looks like an availability status
    let finalSubtitle = availabilityStatus;
    if (!finalSubtitle && type) {
        const availabilityTypes = ['General Availability', 'Public Preview', 'Deprecated', 'Plan for change'];
        if (availabilityTypes.includes(type)) {
            finalSubtitle = type;
        } else {
            finalSubtitle = `Type: ${type}`;
        }
    }
    
    // Convert to frontend-compatible format with correct field mapping
    const update = {
        id: generateContentId(cleanTitle, finalSubtitle || type, description),
        title: cleanTitle, // Use cleaned title without type prefix
        subtitle: finalSubtitle || (type ? `Type: ${type}` : undefined),
        content: finalContent, // Now includes HTML markup
        service: 'Entra',
        serviceCategory: serviceCategory, // Keep for topic assignment logic
        productCapability: productCapability, // Keep for topic assignment logic  
        link: extractLinks(header.parentElement)[0]?.url || 'whats-new-archive'
    };
    
    console.log(`Created update:`, JSON.stringify(update, null, 2));
    return update;
}

// Parse update from header element and following content (legacy format)
function parseUpdateFromHeader(header, date) {
    const title = extractTextContent(header);
    
    // Look for description in following elements
    let description = title;
    let currentElement = header.nextElementSibling;
    const descriptionParts = [];
    
    while (currentElement && !['H1', 'H2', 'H3', 'H4'].includes(currentElement.tagName)) {
        if (currentElement.tagName === 'P' || currentElement.tagName === 'DIV') {
            const text = extractTextContent(currentElement);
            if (text.trim()) {
                descriptionParts.push(text);
            }
        }
        
        currentElement = currentElement.nextElementSibling;
        
        // Limit to avoid too much content
        if (descriptionParts.length >= 2) break;
    }
    
    if (descriptionParts.length > 0) {
        description = descriptionParts.join(' ');
    }
    
    return {
        title: title,
        description: description,
        type: inferTypeFromTitle(title),
        serviceCategory: inferServiceCategoryFromTitle(title),
        date: date,
        links: extractLinks(header.parentElement)
    };
}

// Extract clean text content from element
function extractTextContent(element) {
    if (!element) return '';
    return element.textContent.trim().replace(/\s+/g, ' ');
}

// Extract HTML content from element while preserving structure
function extractHTMLContent(element) {
    if (!element) return '';
    
    // Clean up the HTML while preserving structure
    let html = element.innerHTML;
    
    // Clean up Microsoft Learn specific classes and attributes
    html = html.replace(/\s*class="[^"]*"/g, '');
    html = html.replace(/\s*id="[^"]*"/g, '');
    html = html.replace(/\s*data-[^=]*="[^"]*"/g, '');
    html = html.replace(/\s*role="[^"]*"/g, '');
    html = html.replace(/\s*aria-[^=]*="[^"]*"/g, '');
    
    // Clean up empty attributes and extra whitespace
    html = html.replace(/\s+>/g, '>');
    html = html.replace(/>\s+</g, '><');
    html = html.trim();
    
    return html;
}

// Extract links from element
function extractLinks(element) {
    if (!element) return [];
    
    const links = Array.from(element.querySelectorAll('a'));
    return links.map(link => ({
        text: link.textContent.trim(),
        url: link.href
    })).filter(link => link.url && link.text);
}

// Infer update type from title
function inferTypeFromTitle(title) {
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.includes('new') || lowerTitle.includes('introducing') || lowerTitle.includes('announced')) {
        return 'New feature';
    } else if (lowerTitle.includes('deprecated') || lowerTitle.includes('retirement') || lowerTitle.includes('removed')) {
        return 'Deprecated';
    } else if (lowerTitle.includes('preview') || lowerTitle.includes('beta')) {
        return 'Public preview';
    } else if (lowerTitle.includes('general availability') || lowerTitle.includes('ga') || lowerTitle.includes('generally available')) {
        return 'General availability';
    } else if (lowerTitle.includes('fix') || lowerTitle.includes('resolved') || lowerTitle.includes('issue')) {
        return 'Fixed';
    } else if (lowerTitle.includes('change') || lowerTitle.includes('update') || lowerTitle.includes('improvement')) {
        return 'Changed';
    }
    
    return 'Update';
}

// Infer service category from title
function inferServiceCategoryFromTitle(title) {
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.includes('conditional access')) return 'Conditional Access';
    if (lowerTitle.includes('authentication') || lowerTitle.includes('mfa') || lowerTitle.includes('multi-factor')) return 'Authentication';
    if (lowerTitle.includes('identity protection')) return 'Identity Protection';
    if (lowerTitle.includes('privileged identity') || lowerTitle.includes('pim')) return 'Privileged Identity Management';
    if (lowerTitle.includes('application') || lowerTitle.includes('app')) return 'Applications';
    if (lowerTitle.includes('device') || lowerTitle.includes('mobile')) return 'Devices';
    if (lowerTitle.includes('governance') || lowerTitle.includes('entitlement')) return 'Identity Governance';
    if (lowerTitle.includes('b2b') || lowerTitle.includes('guest')) return 'External Identities';
    if (lowerTitle.includes('connect') || lowerTitle.includes('hybrid')) return 'Hybrid Identity';
    if (lowerTitle.includes('monitoring') || lowerTitle.includes('audit') || lowerTitle.includes('log')) return 'Monitoring & Health';
    
    return 'General';
}

// Map service category to display category
function mapServiceCategoryToCategory(serviceCategory) {
    if (!serviceCategory) return 'identity-management';
    
    const lowerCategory = serviceCategory.toLowerCase();
    
    // Direct mappings for Microsoft Learn Service Categories
    const categoryMap = {
        // Exact Microsoft Learn categories
        'conditional access': 'conditional-access',
        'authentications (login)': 'authentication',
        'authentications (logins)': 'authentication', 
        'authentication': 'authentication',
        'mfa': 'authentication',
        'provisioning': 'identity-governance',
        'lifecycle workflows': 'identity-governance',
        'identity governance': 'identity-governance',
        'entitlement management': 'identity-governance',
        'microsoft entra connect': 'hybrid-identity',
        'microsoft entra domain services': 'directory-services',
        'identity protection': 'identity-protection',
        'privileged identity management': 'privileged-identity',
        'applications': 'application-management',
        'directory management': 'directory-services',
        'user management': 'directory-services',
        'devices': 'device-management',
        'external identities': 'external-identities',
        'b2c - consumer identity management': 'external-identities',
        'b2b/b2c': 'external-identities',
        'hybrid identity': 'hybrid-identity',
        'monitoring & health': 'monitoring',
        'reporting': 'monitoring',
        'audit logs': 'monitoring',
        'ms graph': 'application-management',
        'rbac': 'privileged-identity',
        'managed identities for azure resources': 'identity-protection',
        'azure ad graph': 'application-management',
        'legacy msonline and azuread powershell modules': 'application-management',
        'other': 'identity-management',
        'general': 'identity-management',
        'licensing': 'licensing',
        'security': 'identity-protection',
        'extensibility': 'application-management',
        '3rd party integration': 'application-management'
    };
    
    // Check for exact matches first
    if (categoryMap[lowerCategory]) {
        return categoryMap[lowerCategory];
    }
    
    // Check for partial matches for common Microsoft Learn categories
    if (lowerCategory.includes('conditional access')) return 'conditional-access';
    if (lowerCategory.includes('authentication') || lowerCategory.includes('login') || lowerCategory.includes('mfa') || lowerCategory.includes('multi-factor')) return 'authentication';
    if (lowerCategory.includes('provisioning') || lowerCategory.includes('lifecycle') || lowerCategory.includes('governance') || lowerCategory.includes('entitlement')) return 'identity-governance';
    if (lowerCategory.includes('connect') || lowerCategory.includes('hybrid')) return 'hybrid-identity';
    if (lowerCategory.includes('domain services') || lowerCategory.includes('directory') || lowerCategory.includes('user management')) return 'directory-services';
    if (lowerCategory.includes('identity protection') || lowerCategory.includes('security')) return 'identity-protection';
    if (lowerCategory.includes('privileged identity') || lowerCategory.includes('pim') || lowerCategory.includes('rbac')) return 'privileged-identity';
    if (lowerCategory.includes('application') || lowerCategory.includes('app') || lowerCategory.includes('graph') || lowerCategory.includes('extensibility')) return 'application-management';
    if (lowerCategory.includes('device') || lowerCategory.includes('mobile')) return 'device-management';
    if (lowerCategory.includes('b2b') || lowerCategory.includes('b2c') || lowerCategory.includes('guest') || lowerCategory.includes('external')) return 'external-identities';
    if (lowerCategory.includes('monitoring') || lowerCategory.includes('audit') || lowerCategory.includes('log') || lowerCategory.includes('report')) return 'monitoring';
    if (lowerCategory.includes('license') || lowerCategory.includes('billing')) return 'licensing';
    
    return 'identity-management'; // Default category for Entra
}

// Run the generation
generateDataFiles().catch(error => {
    console.error('Failed to generate data files:', error);
    process.exit(1);
});
