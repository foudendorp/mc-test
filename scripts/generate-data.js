import fetch from 'node-fetch';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
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
        
        // Find all week sections (h2 headers with "Week of" in the text)
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
                        service: service.tag, // Add service tag to individual updates
                        link: link || service.url
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
                        week: weekData.week,
                        date: weekData.date,
                        service: service.tag,
                        serviceRelease: weekData.serviceRelease,
                        updates: updateCount
                    });
                    
                    serviceUpdates += updateCount;
                }
            }
            
            console.log(`📁 ${service.name} - Files processed: ${serviceDataFiles.length}, Files updated: ${filesUpdated}`);
            
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
                        content: "You can now use Microsoft Copilot in Intune to explore your Intune data using natural language, take action on the results, manage policies and settings, understand your security posture, and troubleshoot device issues.",
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
        week: "Week of July 14, 2025",
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
                        content: "Microsoft Entra ID continues to evolve with new features for identity and access management, providing better security and user experience.",
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
        content: "This site uses automated data generation. The displayed information is currently using fallback data while the system fetches the latest updates from Microsoft Learn.",
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
            week: "Week of July 14, 2025",
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

// Run the generation
generateDataFiles().catch(error => {
    console.error('Failed to generate data files:', error);
    process.exit(1);
});
