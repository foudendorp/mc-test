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
    },
    defender: {
        name: 'Defender XDR',
        url: 'https://learn.microsoft.com/en-us/defender-xdr/whats-new',
        tag: 'Defender'
    },
    defenderoffice: {
        name: 'Defender for Office 365',
        url: 'https://learn.microsoft.com/en-us/defender-office-365/defender-for-office-365-whats-new',
        tag: 'DefenderOffice'
    },
    defenderendpoint: {
        name: 'Defender for Endpoint',
        url: 'https://learn.microsoft.com/en-us/defender-endpoint/whats-new-in-microsoft-defender-endpoint',
        tag: 'DefenderEndpoint'
    },
    windows365: {
        name: 'Windows 365',
        url: 'https://learn.microsoft.com/en-us/windows-365/enterprise/whats-new',
        tag: 'Windows365'
    },
    defenderidentity: {
        name: 'Microsoft Defender for Identity',
        displayName: 'Defender for Identity', // Shorter name for table display
        url: 'https://learn.microsoft.com/en-us/defender-for-identity/whats-new',
        tag: 'DefenderIdentity'
    },
    defendercloudapps: {
        name: 'Microsoft Defender for Cloud Apps',
        displayName: 'Defender for Cloud Apps', // Shorter name for table display
        url: 'https://learn.microsoft.com/en-us/defender-cloud-apps/release-notes',
        tag: 'DefenderCloudApps'
    }
};

const DATA_DIR = './data';
const UPDATES_DIR = './data/updates';

// Service-specific directories for updates only
const INTUNE_UPDATES_DIR = './data/updates/intune';
const ENTRA_UPDATES_DIR = './data/updates/entra';
const DEFENDER_UPDATES_DIR = './data/updates/defender';
const DEFENDEROFFICE_UPDATES_DIR = './data/updates/defenderoffice';
const DEFENDERENDPOINT_UPDATES_DIR = './data/updates/defenderendpoint';
const DEFENDERIDENTITY_UPDATES_DIR = './data/updates/defenderidentity';
const DEFENDERCLOUDAPPS_UPDATES_DIR = './data/updates/defendercloudapps';
const WINDOWS365_UPDATES_DIR = './data/updates/windows365';

// Ensure data directories exist
if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
}
if (!existsSync(UPDATES_DIR)) {
    mkdirSync(UPDATES_DIR, { recursive: true });
}
if (!existsSync(INTUNE_UPDATES_DIR)) {
    mkdirSync(INTUNE_UPDATES_DIR, { recursive: true });
}
if (!existsSync(ENTRA_UPDATES_DIR)) {
    mkdirSync(ENTRA_UPDATES_DIR, { recursive: true });
}
if (!existsSync(DEFENDER_UPDATES_DIR)) {
    mkdirSync(DEFENDER_UPDATES_DIR, { recursive: true });
}
if (!existsSync(DEFENDEROFFICE_UPDATES_DIR)) {
    mkdirSync(DEFENDEROFFICE_UPDATES_DIR, { recursive: true });
}
if (!existsSync(DEFENDERENDPOINT_UPDATES_DIR)) {
    mkdirSync(DEFENDERENDPOINT_UPDATES_DIR, { recursive: true });
}
if (!existsSync(DEFENDERIDENTITY_UPDATES_DIR)) {
    mkdirSync(DEFENDERIDENTITY_UPDATES_DIR, { recursive: true });
}
if (!existsSync(DEFENDERCLOUDAPPS_UPDATES_DIR)) {
    mkdirSync(DEFENDERCLOUDAPPS_UPDATES_DIR, { recursive: true });
}
if (!existsSync(WINDOWS365_UPDATES_DIR)) {
    mkdirSync(WINDOWS365_UPDATES_DIR, { recursive: true });
}

// Helper function to check if an element is a month header
function isNextMonthHeader(element) {
    if (!element || element.tagName !== 'H2') return false;
    const text = element.textContent.trim();
    
    // Handle both single months like "January 2025" and compound months like "November-December 2024"
    const singleMonthPattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i;
    const compoundMonthPattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)[-\s]+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i;
    
    return singleMonthPattern.test(text) || compoundMonthPattern.test(text);
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

// Helper function to parse Intune update elements 
// Handles two different structures:
// 1. "What's new" section: H3 (Category) -> H4 (Individual Topics as separate updates)
// 2. "Notices" section: H3 (Topics as "Notice" updates) -> H4 (Sub-content)
function parseIntuneUpdateElement(currentElement, service) {
    const elementTitle = currentElement.textContent.trim();
    
    // Check if we're in the "Notices" section
    const isNoticeSection = isInNoticesSection(currentElement);
    
    if (isNoticeSection) {
        // For Notices section: H3 topics become "Notice" type updates with H4 sub-content
        return parseNoticeUpdate(currentElement, service);
    } else {
        // For What's new section: H4 topics become individual updates under H3 category
        return parseWhatsNewUpdates(currentElement, service);
    }
}

// Helper function to check if an element is within the Notices section
function isInNoticesSection(element) {
    let currentEl = element;
    // Look backwards up to 500 elements to find a "Notices" H2 header (generous limit for future growth)
    let lookBack = 0;
    
    while (currentEl && lookBack < 500) {
        if (currentEl.tagName === 'H2' && currentEl.textContent.trim().toLowerCase().includes('notice')) {
            return true;
        }
        // Stop looking if we find another H2 (different section)
        if (currentEl.tagName === 'H2' && !currentEl.textContent.trim().toLowerCase().includes('notice')) {
            return false;
        }
        currentEl = currentEl.previousElementSibling;
        lookBack++;
    }
    
    return false;
}

// Helper function to generate anchor URL for notices based on title
function generateNoticeAnchorUrl(title, baseUrl) {
    if (!title) return baseUrl;
    
    // Convert title to anchor format (lowercase, spaces to hyphens, remove special chars)
    const anchor = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
        .replace(/\s+/g, '-')     // Replace spaces with hyphens
        .replace(/-+/g, '-')      // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens
    
    return `${baseUrl}#${anchor}`;
}

// Parse H3 topics in Notices section as individual "Notice" updates
function parseNoticeUpdate(currentElement, service) {
    let noticeTitle = currentElement.textContent.trim();
    const category = 'notices';
    
    let content = [];
    let features = [];
    let hasFoundMeaningfulContent = false;
    
    // Get content from following elements until next H3 or H2
    let nextEl = currentElement.nextElementSibling;
    
    while (nextEl && nextEl.tagName !== 'H3' && nextEl.tagName !== 'H2') {
        if (nextEl.tagName === 'H4') {
            // Add H4 as a subheading in the content (keep all H4s as subsections)
            const h4Title = nextEl.textContent.trim();
            content.push(`<h4>${h4Title}</h4>`);
            
            // If notice title is generic/empty, use first meaningful H4 as title
            if (!hasFoundMeaningfulContent && h4Title && h4Title.length > 5) {
                hasFoundMeaningfulContent = true;
                if (!noticeTitle || noticeTitle.length < 5 || noticeTitle === 'Notice' || /^(Update|Plan for|Change)/.test(noticeTitle)) {
                    // Clean up the title by removing common prefixes
                    noticeTitle = h4Title
                        .replace(/^(Update to the latest|Plan for [Cc]hange:|Plan for change:|How does this change affect|How can you prepare)\s*/i, '')
                        .replace(/^\s*•\s*/, '');
                }
            }
            
        } else if (nextEl.tagName === 'P') {
            const text = nextEl.textContent.trim();
            if (text) {
                const htmlContent = extractHTMLContent(nextEl, service.url);
                content.push(`<p>${htmlContent}</p>`);
                
                // If notice title is still generic, use first meaningful paragraph
                if (!hasFoundMeaningfulContent && text.length > 20) {
                    hasFoundMeaningfulContent = true;
                    if (!noticeTitle || noticeTitle.length < 5 || noticeTitle === 'Notice') {
                        // Use first sentence or first 100 chars as title
                        const sentences = text.split(/[.!?]+/);
                        noticeTitle = sentences[0].trim().substring(0, 100);
                        if (noticeTitle.length === 100) noticeTitle += '...';
                    }
                }
            }
        } else if (nextEl.tagName === 'UL' || nextEl.tagName === 'OL') {
            const listItems = Array.from(nextEl.querySelectorAll('li'));
            const listText = listItems.map(li => li.textContent.trim());
            const listHTML = extractHTMLContent(nextEl, service.url);
            
            features.push(...listText);
            if (listHTML.trim()) {
                content.push(`<${nextEl.tagName.toLowerCase()}>${listHTML}</${nextEl.tagName.toLowerCase()}>`);
            }
        }
        
        nextEl = nextEl.nextElementSibling;
    }
    
    if (content.length > 0) {
        const htmlContent = content.join('');
        
        // Generate anchor URL based on the notice title for Microsoft Learn What's New page
        const link = generateNoticeAnchorUrl(noticeTitle, service.url);
        
        // Determine the notice type based on the title
        let noticeType = 'notice'; // Default type for notices
        if (noticeTitle && noticeTitle.toLowerCase().includes('plan for change')) {
            noticeType = 'plan-for-change';
        }
        
        const update = {
            id: generateContentId(noticeTitle, '', htmlContent),
            title: noticeTitle || 'Notice',
            content: htmlContent,
            features: features.length > 0 ? features : undefined,
            service: service.displayName || service.name,
            category: category,
            type: noticeType, // Dynamic type based on notice title
            link: link
        };
        
        return [update];
    }
    
    return [];
}

// Parse H4 topics in What's new section as individual updates under H3 category
function parseWhatsNewUpdates(currentElement, service) {
    const categoryTitle = currentElement.textContent.trim();
    const category = mapTopicToCategory(categoryTitle) || 'device-management';
    const updates = [];
    
    // Find all H4 elements that belong to this H3 category
    let nextEl = currentElement.nextElementSibling;
    
    while (nextEl && nextEl.tagName !== 'H3' && nextEl.tagName !== 'H2' && !nextEl.textContent.includes('Week of')) {
        if (nextEl.tagName === 'H4') {
            // Each H4 becomes a separate update
            const h4Update = parseH4Update(nextEl, service, category);
            if (h4Update) {
                updates.push(h4Update);
            }
            
            // Skip past the content of this H4 to avoid double-processing
            nextEl = skipPastH4Content(nextEl);
        } else {
            nextEl = nextEl.nextElementSibling;
        }
    }
    
    return updates;
}

// Parse individual H4 topic as a separate update
function parseH4Update(h4Element, service, category) {
    const topicTitle = h4Element.textContent.trim();
    let content = [];
    let features = [];
    
    // Get content from following elements until next H4, H3, or H2
    let nextEl = h4Element.nextElementSibling;
    
    while (nextEl && nextEl.tagName !== 'H4' && nextEl.tagName !== 'H3' && nextEl.tagName !== 'H2' && !nextEl.textContent.includes('Week of')) {
        if (nextEl.tagName === 'P') {
            const text = nextEl.textContent.trim();
            if (text) {
                const htmlContent = extractHTMLContent(nextEl, service.url);
                content.push(`<p>${htmlContent}</p>`);
            }
        } else if (nextEl.tagName === 'UL' || nextEl.tagName === 'OL') {
            const listItems = Array.from(nextEl.querySelectorAll('li'));
            const listText = listItems.map(li => li.textContent.trim());
            const listHTML = extractHTMLContent(nextEl, service.url);
            
            features.push(...listText);
            if (listHTML.trim()) {
                content.push(`<${nextEl.tagName.toLowerCase()}>${listHTML}</${nextEl.tagName.toLowerCase()}>`);
            }
        }
        
        nextEl = nextEl.nextElementSibling;
    }
    
    if (content.length > 0) {
        const htmlContent = content.join('');
        const link = extractLinkFromContent(htmlContent, service.url);
        
        return {
            id: generateContentId(topicTitle, '', htmlContent),
            title: topicTitle,
            content: htmlContent,
            features: features.length > 0 ? features : undefined,
            service: service.displayName || service.name,
            category: category,
            type: 'update',
            link: link || service.url
        };
    }
    
    return null;
}

// Helper function to skip past all content belonging to an H4
function skipPastH4Content(h4Element) {
    let nextEl = h4Element.nextElementSibling;
    
    // Skip all content until we reach another H4, H3, H2, or Week header
    while (nextEl && nextEl.tagName !== 'H4' && nextEl.tagName !== 'H3' && nextEl.tagName !== 'H2' && !nextEl.textContent.includes('Week of')) {
        nextEl = nextEl.nextElementSibling;
    }
    
    return nextEl;
}

// Helper function to parse orphaned H4 elements in notices section as a single notice
function parseOrphanedH4sAsNotice(startingH4Element, service) {
    let noticeTitle = 'Notice'; // Default title for orphaned H4s
    const category = 'notices';
    let content = [];
    let features = [];
    let hasFoundMeaningfulTitle = false;
    
    // Collect all consecutive H4s and their content
    let currentElement = startingH4Element;
    
    while (currentElement && currentElement.tagName !== 'H3' && currentElement.tagName !== 'H2') {
        if (currentElement.tagName === 'H4') {
            const h4Title = currentElement.textContent.trim();
            
            // Don't use "How does this change affect..." or "How can you prepare?" as the main title
            if (!hasFoundMeaningfulTitle && h4Title && 
                !h4Title.toLowerCase().includes('how does this change affect') &&
                !h4Title.toLowerCase().includes('how can you prepare') &&
                h4Title.length > 5) {
                noticeTitle = h4Title;
                hasFoundMeaningfulTitle = true;
            }
            
            // Add H4 as a subheading in the content
            content.push(`<h4>${h4Title}</h4>`);
            
            // Get content following this H4
            let nextEl = currentElement.nextElementSibling;
            while (nextEl && nextEl.tagName !== 'H4' && nextEl.tagName !== 'H3' && nextEl.tagName !== 'H2') {
                if (nextEl.tagName === 'P') {
                    const text = nextEl.textContent.trim();
                    if (text) {
                        const htmlContent = extractHTMLContent(nextEl, service.url);
                        content.push(`<p>${htmlContent}</p>`);
                        
                        // If we still don't have a meaningful title, use the first paragraph
                        if (!hasFoundMeaningfulTitle && text.length > 20) {
                            const sentences = text.split(/[.!?]+/);
                            noticeTitle = sentences[0].trim().substring(0, 100);
                            if (noticeTitle.length === 100) noticeTitle += '...';
                            hasFoundMeaningfulTitle = true;
                        }
                    }
                } else if (nextEl.tagName === 'UL' || nextEl.tagName === 'OL') {
                    const listItems = Array.from(nextEl.querySelectorAll('li'));
                    const listText = listItems.map(li => li.textContent.trim());
                    const listHTML = extractHTMLContent(nextEl, service.url);
                    
                    features.push(...listText);
                    if (listHTML.trim()) {
                        content.push(`<${nextEl.tagName.toLowerCase()}>${listHTML}</${nextEl.tagName.toLowerCase()}>`);
                    }
                }
                nextEl = nextEl.nextElementSibling;
            }
            
            currentElement = nextEl; // Move to next H4 or end
        } else {
            // Skip non-H4 elements (shouldn't happen in this context)
            currentElement = currentElement.nextElementSibling;
        }
    }
    
    if (content.length > 0) {
        const htmlContent = content.join('');
        
        // Generate anchor URL based on the notice title for Microsoft Learn What's New page
        const link = generateNoticeAnchorUrl(noticeTitle, service.url);
        
        // Determine the notice type based on the title
        let noticeType = 'notice'; // Default type for notices
        if (noticeTitle && noticeTitle.toLowerCase().includes('plan for change')) {
            noticeType = 'plan-for-change';
        }
        
        const update = {
            id: generateContentId(noticeTitle, '', htmlContent),
            title: noticeTitle,
            content: htmlContent,
            features: features.length > 0 ? features : undefined,
            service: service.displayName || service.name,
            category: category,
            type: noticeType,
            link: link
        };
        
        return [update];
    }
    
    return [];
}

// Helper function to extract links from HTML content
function extractLinkFromContent(htmlContent, baseUrl) {
    if (!htmlContent) return baseUrl;
    
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/g;
    const match = linkRegex.exec(htmlContent);
    
    if (match && match[1]) {
        const href = match[1];
        
        // If it's already a full URL, return as-is
        if (href.startsWith('http://') || href.startsWith('https://')) {
            return href;
        }
        
        // If it's a relative link starting with / or ../, make it absolute
        if (href.startsWith('/') || href.startsWith('../')) {
            return new URL(href, baseUrl).href;
        }
        
        // For bare anchor references or paths without leading slash, 
        // assume they are meant to be anchor links on the main page
        if (href.includes('#')) {
            // If it contains a hash, treat it as an anchor link on the main page
            return `${baseUrl}#${href.split('#')[1]}`;
        } else if (!href.includes('/') && !href.includes('.')) {
            // If it's just a simple name without slashes or dots, treat it as an anchor
            return `${baseUrl}#${href}`;
        }
        
        // For other relative paths, make them absolute relative to the base URL directory
        return new URL(href, baseUrl).href;
    }
    
    return baseUrl;
}


// Helper function to parse update elements (optimized)
function parseUpdateElement(currentElement, service) {
    const updateTitle = currentElement.textContent.trim();
    let content = '';
    let features = [];
    let link = '';
    const htmlParts = [];
    
    // First, try to extract the section anchor link from the header itself
    const sectionAnchorLink = extractSectionAnchorLink(currentElement, service.url);
    if (sectionAnchorLink) {
        link = sectionAnchorLink;
    }
    
    // Get content from following elements
    let nextEl = currentElement.nextElementSibling;
    while (nextEl && nextEl.tagName !== 'H4' && nextEl.tagName !== 'H3' && nextEl.tagName !== 'H2') {
        if (nextEl.tagName === 'P') {
            const text = nextEl.textContent.trim();
            if (text) {
                content += (content ? ' ' : '') + text;
                // Preserve HTML for better formatting
                htmlParts.push(`<p>${extractHTMLContent(nextEl, service.url)}</p>`);
            }
        } else if (nextEl.tagName === 'UL') {
            const listItems = Array.from(nextEl.querySelectorAll('li'));
            features.push(...listItems.map(li => li.textContent.trim()));
            // Preserve HTML list structure
            const listHTML = extractHTMLContent(nextEl, service.url);
            if (listHTML.trim()) {
                htmlParts.push(`<ul>${listHTML}</ul>`);
            }
        } else if (nextEl.tagName === 'OL') {
            const listItems = Array.from(nextEl.querySelectorAll('li'));
            features.push(...listItems.map(li => li.textContent.trim()));
            // Preserve HTML list structure
            const listHTML = extractHTMLContent(nextEl, service.url);
            if (listHTML.trim()) {
                htmlParts.push(`<ol>${listHTML}</ol>`);
            }
        }
        
        // Fallback: Look for content links if we didn't get a section anchor
        if (!link) {
            const links = nextEl.querySelectorAll('a[href*="learn.microsoft.com"]');
            if (links.length > 0) {
                link = links[0].href;
            }
        }
        
        nextEl = nextEl.nextElementSibling;
    }
    
    // Extract subtitle from title (often after a colon or dash)
    let title = updateTitle;
    let subtitle = '';
    
    const colonIndex = title.indexOf(':');
    const dashIndex = title.indexOf(' - ');
    
    // Only split on colon if the part before it looks like a status indicator
    if (colonIndex > 0) {
        const beforeColon = title.substring(0, colonIndex).trim();
        const statusIndicators = [
            'General Availability', 'Public Preview', 'Private Preview', 'Deprecated', 
            'Plan for Change', 'Important Notice', 'Notice', 'Announcement', 'Breaking Change'
        ];
        
        // Check if the part before colon is a known status indicator
        const isStatusIndicator = statusIndicators.some(status => 
            beforeColon.toLowerCase().includes(status.toLowerCase())
        );
        
        if (isStatusIndicator) {
            subtitle = title.substring(colonIndex + 1).trim();
            title = title.substring(0, colonIndex).trim();
        }
        // If not a status indicator, keep the full title including the colon
    } else if (dashIndex > 0) {
        subtitle = title.substring(dashIndex + 3).trim();
        title = title.substring(0, dashIndex).trim();
    }
    
    // Create content with HTML markup for proper display
    const htmlContent = htmlParts.length > 0 ? htmlParts.join('') : `<p>${content || 'No additional details available.'}</p>`;
    
    // Determine category based on title content first, then fall back to default
    const titleBasedCategory = mapTitleToCategory(title, service.name);
    
    // Determine the type based on the title prefix
    let updateType = 'update'; // default type
    if (title.toLowerCase().includes('plan for change')) {
        updateType = 'plan-for-change';
    } else if (title.toLowerCase().includes('breaking change')) {
        updateType = 'breaking-change';
    } else if (title.toLowerCase().includes('general availability')) {
        updateType = 'general-availability';
    } else if (title.toLowerCase().includes('public preview')) {
        updateType = 'public-preview';
    } else if (title.toLowerCase().includes('important')) {
        updateType = 'important';
    }
    
    // For Plan for Change items, swap title and subtitle so the descriptive content becomes the title
    let finalTitle = title;
    let finalSubtitle = subtitle;
    
    if (updateType === 'plan-for-change' && subtitle) {
        finalTitle = subtitle;  // Use the descriptive content as the title
        finalSubtitle = title;  // Use "Plan for Change" as the subtitle
    }
    
    return {
        id: generateContentId(finalTitle, finalSubtitle, content), // Deterministic ID based on content
        title: finalTitle,
        subtitle: finalSubtitle || undefined,
        content: htmlContent, // Now includes HTML markup
        features: features.length > 0 ? features : undefined,
        service: service.displayName || service.name, // Use displayName for table display, fallback to name
        category: titleBasedCategory, // Add individual update categorization
        type: updateType, // Add type field to distinguish different kinds of updates
        link: link || service.url
    };
}

// Parse Microsoft Learn page content for a specific service
async function fetchServiceUpdates(service) {
    try {
        console.log(`📡 Fetching ${service.name} updates from Microsoft Learn...`);
        const response = await fetch(service.url);
        const html = await response.text();
        
        // Use JSDOM to parse HTML (lighter alternative to cheerio for this use case)
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        const weeklyUpdates = new Map();
        
        // Handle different structures for different services
        if (service.tag === 'Entra' || service.tag === 'DefenderIdentity' || service.tag === 'DefenderCloudApps') {
            // For Entra ID, Microsoft Defender for Identity, and Microsoft Defender for Cloud Apps, use enhanced parsing for the comprehensive structure
            console.log(`🔍 Parsing ${service.name} structure...`);
            const weeklyUpdates = await parseEntraUpdates(document, service);
            
            return { weeklyUpdates, notices: [] };
        } else if (service.tag === 'Defender') {
            // For Defender XDR, use month-based parsing with bullet points
            console.log(`🔍 Parsing Defender XDR structure...`);
            const weeklyUpdates = await parseDefenderUpdates(document, service);
            
            return { weeklyUpdates, notices: [] };
        } else if (service.tag === 'DefenderOffice') {
            // For Defender for Office 365, use month-based parsing with bullet points (same as Defender XDR)
            console.log(`🔍 Parsing Defender for Office 365 structure...`);
            const weeklyUpdates = await parseDefenderOfficeUpdates(document, service);
            
            return { weeklyUpdates, notices: [] };
        } else if (service.tag === 'DefenderEndpoint') {
            // For Defender for Endpoint, use month-based parsing with bullet points (same as Defender XDR)
            console.log(`🔍 Parsing Defender for Endpoint structure...`);
            const weeklyUpdates = await parseDefenderEndpointUpdates(document, service);
            
            return { weeklyUpdates, notices: [] };
        } else {
            // For Intune, Windows 365, and other services, use week-based structure
            const weekHeaders = Array.from(document.querySelectorAll('h2'))
                .filter(h2 => h2.textContent.includes('Week of'));
            
            console.log(`📅 Found ${weekHeaders.length} week sections for ${service.name}`);
            
            // For Intune, also process the Notices section
            if (service.name === 'Intune') {
                const noticesHeader = Array.from(document.querySelectorAll('h2'))
                    .find(h2 => h2.textContent.trim().toLowerCase().includes('notice'));
                
                if (noticesHeader) {
                    console.log(`📋 Found Notices section for ${service.name}`);
                    
                    // Process notices as a separate "week" entry
                    const noticesDate = new Date().toISOString().split('T')[0]; // Use current date for notices
                    const noticesWeekData = {
                        week: "Notices",
                        date: noticesDate,
                        service: service.displayName || service.name,
                        serviceRelease: null,
                        topics: []
                    };
                    
                    // Find H3 elements in the Notices section
                    let currentElement = noticesHeader.nextElementSibling;
                    let currentTopic = null;
                    let noticeUpdateCount = 0;
                    
                    // Process until we hit another H2 or end of content
                    while (currentElement && currentElement.tagName !== 'H2') {
                        if (currentElement.tagName === 'H3') {
                            // Each H3 in notices becomes a separate notice update
                            if (currentTopic) {
                                noticesWeekData.topics.push(currentTopic);
                            }
                            
                            const noticeText = currentElement.textContent.trim();
                            currentTopic = {
                                topic: 'Notices', // Group all notices under one topic
                                category: 'notices',
                                updates: []
                            };
                            
                            // Parse this H3 as a notice (always process, even if title is empty)
                            const noticeUpdates = parseIntuneUpdateElement(currentElement, service);
                            if (noticeUpdates && noticeUpdates.length > 0) {
                                currentTopic.updates.push(...noticeUpdates);
                                noticeUpdateCount += noticeUpdates.length;
                            }
                            
                            // Skip ahead past all content for this H3
                            while (currentElement.nextElementSibling && 
                                   currentElement.nextElementSibling.tagName !== 'H3' && 
                                   currentElement.nextElementSibling.tagName !== 'H2') {
                                currentElement = currentElement.nextElementSibling;
                            }
                        } else if (currentElement.tagName === 'H4') {
                            // This is a stray H4 that wasn't grouped under an H3 - it should be processed as part of notices
                            
                            // Create a new topic if we don't have one
                            if (!currentTopic) {
                                currentTopic = {
                                    topic: 'Notices',
                                    category: 'notices',
                                    updates: []
                                };
                            }
                            
                            // Process this H4 and any following elements as a notice
                            // We need to find the parent H3 or group these H4s together
                            const orphanedH4Updates = parseOrphanedH4sAsNotice(currentElement, service);
                            if (orphanedH4Updates && orphanedH4Updates.length > 0) {
                                currentTopic.updates.push(...orphanedH4Updates);
                                noticeUpdateCount += orphanedH4Updates.length;
                            }
                            
                            // Skip past the content we just processed
                            while (currentElement && currentElement.tagName !== 'H3' && currentElement.tagName !== 'H2') {
                                currentElement = currentElement.nextElementSibling;
                            }
                            continue; // Don't advance currentElement again
                        } else {
                            // Skip non-H3/H4 elements
                            currentElement = currentElement.nextElementSibling;
                        }
                        
                        currentElement = currentElement.nextElementSibling;
                    }
                    
                    // Add the last topic (if it exists)
                    if (currentTopic) {
                        noticesWeekData.topics.push(currentTopic);
                    }
                    
                    // Add notices data if we found any
                    if (noticeUpdateCount > 0) {
                        weeklyUpdates.set(noticesDate + '-notices', noticesWeekData);
                        console.log(`📋 Processed ${noticeUpdateCount} notice updates`);
                    }
                }
            }
            
            weekHeaders.forEach((weekHeader, index) => {
                const weekText = weekHeader.textContent.trim();
                if (index % 5 === 0 || index === weekHeaders.length - 1) {
                    console.log(`📊 Processing ${service.name}: ${index + 1}/${weekHeaders.length} weeks (Current: ${weekText.substring(0, 30)}...)`);
                }
                
                // Extract date from week header
                const dateMatch = weekText.match(/Week of (.+?)(?:\s*\(|$)/);
                const date = dateMatch ? new Date(dateMatch[1]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                
                // Check for service release info
                const serviceReleaseMatch = weekText.match(/\(([^)]+)\)/);
                const serviceRelease = serviceReleaseMatch ? serviceReleaseMatch[1] : null;
                
                const weekData = {
                    week: weekText,
                    date: date,
                    service: service.displayName || service.name, // Use displayName for table display, fallback to name
                    serviceRelease: serviceRelease,
                    topics: []
                };
                
                // Find content between this week header and the next one
                let currentElement = weekHeader.nextElementSibling;
                let currentTopic = null;
                let updateCount = 0;
                
                while (currentElement && !currentElement.textContent.includes('Week of')) {
                    if (currentElement.tagName === 'H3') {
                        // New topic section
                        if (currentTopic) {
                            weekData.topics.push(currentTopic);
                        }
                        
                        const topicText = currentElement.textContent.trim();
                        const cleanedTopicText = cleanTopicText(topicText);
                        currentTopic = {
                            topic: cleanedTopicText,
                            category: mapTopicToCategory(cleanedTopicText),
                            updates: []
                        };
                        
                        // For Intune, always use parseIntuneUpdateElement which properly handles H4 subsections
                        if (service.name === 'Intune') {
                            // parseIntuneUpdateElement returns an array of updates (one for each H4)
                            const updates = parseIntuneUpdateElement(currentElement, service);
                            if (updates && updates.length > 0) {
                                currentTopic.updates.push(...updates);
                                updateCount += updates.length;
                            }
                            
                            // Skip ahead past all H4 subsections for this H3
                            while (currentElement.nextElementSibling && 
                                   currentElement.nextElementSibling.tagName !== 'H3' && 
                                   !currentElement.nextElementSibling.textContent.includes('Week of')) {
                                currentElement = currentElement.nextElementSibling;
                            }
                        }
                    } else if (currentElement.tagName === 'H4' && currentTopic && service.name !== 'Intune') {
                        // Individual update (for non-Intune services that use H4 as separate updates)
                        const update = parseUpdateElement(currentElement, service);
                        if (update) {
                            // If the update has a specific category, update the topic category to match
                            if (update.category && update.category !== currentTopic.category) {
                                currentTopic.category = update.category;
                            }
                            currentTopic.updates.push(update);
                            updateCount++;
                        }
                    }
                    
                    currentElement = currentElement.nextElementSibling;
                }
                
                // Add the last topic (if it exists)
                if (currentTopic) {
                    weekData.topics.push(currentTopic);
                }
                
                // Only add weeks that have topics with updates
                const hasUpdates = weekData.topics.some(topic => topic.updates.length > 0);
                if (hasUpdates) {
                    weeklyUpdates.set(date, weekData);
                }
                
                // Log progress for this week
                if (updateCount > 0 && (index % 5 === 0 || index === weekHeaders.length - 1)) {
                    console.log(`   📈 Week ${index + 1}: ${updateCount} updates processed`);
                }
            });
            
            console.log(`✅ Completed ${service.name}: ${weekHeaders.length} weeks, ${weeklyUpdates.size} weeks with updates`);
        }
        
        return { weeklyUpdates, notices: [] };
        
    } catch (error) {
        console.error('Error fetching updates:', error);
        return { weeklyUpdates: new Map(), notices: [] };
    }
}

// Fetch updates from all services and return them separated by service
async function fetchAllServiceUpdates() {
    const serviceData = {};
    
    // Fetch from each service in parallel for better performance
    const servicePromises = Object.entries(SERVICES).map(async ([serviceKey, service]) => {
        try {
            console.log(`\n🚀 Starting ${service.name} fetch...`);
            const startTime = Date.now();
            const { weeklyUpdates, notices } = await fetchServiceUpdates(service);
            const endTime = Date.now();
            console.log(`✅ Completed ${service.name} in ${(endTime - startTime) / 1000}s`);
            return [serviceKey, { weeklyUpdates, notices, service }];
        } catch (error) {
            console.error(`❌ Error fetching ${service.name} updates:`, error);
            return [serviceKey, { weeklyUpdates: new Map(), notices: [], service }];
        }
    });
    
    // Wait for all services to complete
    const serviceResults = await Promise.all(servicePromises);
    
    // Convert results back to object
    for (const [serviceKey, data] of serviceResults) {
        serviceData[serviceKey] = data;
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
    
    // Defender XDR-specific mappings
    if (topic.includes('monthly') && topic.includes('updates')) return 'monthly-updates';
    if (topic.includes('advanced') && topic.includes('hunting')) return 'threat-hunting';
    if (topic.includes('incident') || topic.includes('response')) return 'incident-response';
    if (topic.includes('copilot') || topic.includes('ai')) return 'ai-security';
    if (topic.includes('api') || topic.includes('integration')) return 'integration';
    if (topic.includes('attack') || topic.includes('disruption')) return 'threat-protection';
    if (topic.includes('alert') || topic.includes('management')) return 'alert-management';
    if (topic.includes('report') || topic.includes('analytics')) return 'reporting';
    if (topic.includes('threat')) return 'threat-intelligence';
    if (topic.includes('portal') || topic.includes('experience')) return 'user-experience';
    if (topic.includes('detection') || topic.includes('rule')) return 'threat-hunting';
    
    // Windows 365-specific mappings
    if (topic.includes('provisioning') || topic.includes('custom images') || topic.includes('data disk')) return 'provisioning';
    if (topic.includes('disaster recovery') || topic.includes('backup') || topic.includes('restore')) return 'device-management';
    if (topic.includes('azure virtual desktop') || topic.includes('avd')) return 'integration';
    if (topic.includes('gallery') || topic.includes('apps')) return 'app-management';
    if (topic.includes('network') || topic.includes('connectivity')) return 'device-configuration';
    if (topic.includes('security') || topic.includes('compliance')) return 'device-security';
    if (topic.includes('performance') || topic.includes('optimization')) return 'device-configuration';
    if (topic.includes('licensing') || topic.includes('billing')) return 'device-management';
    if (topic.includes('monitoring') || topic.includes('analytics')) return 'monitor-troubleshoot';
    
    // General mappings
    if (topic.includes('app') || topic.includes('application')) return 'app-management';
    if (topic.includes('device')) return 'device-management';
    if (topic.includes('security')) return 'device-security';
    if (topic.includes('configuration') || topic.includes('policy')) return 'device-configuration';
    if (topic.includes('identity')) return 'identity-management';
    
    return 'device-management'; // Default category
}

// Enhanced category mapping based on title content for Windows 365
function mapTitleToCategory(title, service) {
    const titleLower = title.toLowerCase();
    
    // Windows 365 specific title-based mappings
    if (service === 'Windows 365') {
        if (titleLower.includes('data disk not allowed') || titleLower.includes('custom images')) {
            return 'provisioning';
        }
        if (titleLower.includes('disaster recovery') || titleLower.includes('backup') || titleLower.includes('restore')) {
            return 'device-management';
        }
        if (titleLower.includes('azure virtual desktop') || titleLower.includes('avd')) {
            return 'integration';
        }
        if (titleLower.includes('gallery') || titleLower.includes('apps')) {
            return 'app-management';
        }
        if (titleLower.includes('network') || titleLower.includes('connectivity')) {
            return 'device-configuration';
        }
        if (titleLower.includes('security') || titleLower.includes('compliance')) {
            return 'device-security';
        }
        if (titleLower.includes('performance') || titleLower.includes('optimization')) {
            return 'device-configuration';
        }
        if (titleLower.includes('licensing') || titleLower.includes('billing')) {
            return 'device-management';
        }
        if (titleLower.includes('monitoring') || titleLower.includes('analytics')) {
            return 'monitor-troubleshoot';
        }
    }
    
    return null; // Return null if no specific mapping found, will fall back to topic-based mapping
}

// Generate JSON files separated by service
async function generateDataFiles() {
    console.log('Starting data generation...');
    
    // Ensure all service directories exist (updates only)
    [DATA_DIR, UPDATES_DIR, INTUNE_UPDATES_DIR, ENTRA_UPDATES_DIR, DEFENDER_UPDATES_DIR, DEFENDEROFFICE_UPDATES_DIR, DEFENDERENDPOINT_UPDATES_DIR, DEFENDERIDENTITY_UPDATES_DIR, DEFENDERCLOUDAPPS_UPDATES_DIR, WINDOWS365_UPDATES_DIR].forEach(dir => {
        if (!existsSync(dir)) {
            console.log(`Creating directory: ${dir}`);
            mkdirSync(dir, { recursive: true });
        }
    });
    
    try {
        const serviceData = await fetchAllServiceUpdates();
        
        // Track overall stats
        let totalUpdates = 0;
        const allDataFiles = [];
        
        // Process each service separately
        for (const [serviceKey, { weeklyUpdates, service }] of Object.entries(serviceData)) {
            console.log(`\n=== Processing ${service.name} ===`);
            console.log(`Found ${weeklyUpdates.size} weeks of updates`);
            
            // Generate service-specific update files
            const serviceDataFiles = [];
            let serviceUpdates = 0;
            let filesUpdated = 0;
            
            // Determine service directory
            const serviceUpdatesDir = serviceKey === 'intune' ? INTUNE_UPDATES_DIR : 
                                    serviceKey === 'entra' ? ENTRA_UPDATES_DIR : 
                                    serviceKey === 'defender' ? DEFENDER_UPDATES_DIR :
                                    serviceKey === 'defenderoffice' ? DEFENDEROFFICE_UPDATES_DIR :
                                    serviceKey === 'defenderendpoint' ? DEFENDERENDPOINT_UPDATES_DIR :
                                    serviceKey === 'defenderidentity' ? DEFENDERIDENTITY_UPDATES_DIR :
                                    serviceKey === 'defendercloudapps' ? DEFENDERCLOUDAPPS_UPDATES_DIR :
                                    WINDOWS365_UPDATES_DIR;
            
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
                        service: service.name, // Use full service name for dropdown filter display
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
                                        service: service.name, // Use full service name for dropdown filter display
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
            
            // Add to overall tracking
            totalUpdates += serviceUpdates;
            allDataFiles.push(...serviceDataFiles);
        }
        
        // If no data was scraped from any service, create fallback data
        if (allDataFiles.length === 0) {
            console.log('No data scraped from any service, creating fallback data...');
            await createFallbackData();
            return;
        }
        
        // Group all data files by month for the main index (commented out to remove monthly grouping)
        // const monthlyGroups = groupDataFilesByMonth(allDataFiles);
        
        // Create main index data without timestamp first for comparison
        const indexDataWithoutTimestamp = {
            totalUpdates: totalUpdates,
            totalFiles: allDataFiles.length,
            totalNotices: 0, // No notices are generated anymore
            services: Object.keys(serviceData).map(key => serviceData[key].service.name), // Use service.name (full name) for dropdown filter display
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
            console.log(`✅ Updated index.json with ${allDataFiles.length} data files from ${Object.keys(serviceData).length} services`);
        } else {
            // Still write the file to update the timestamp, but log it differently
            writeFileSync(indexFilePath, JSON.stringify(indexData, null, 2));
            console.log(`🕒 Updated index.json timestamp (no content changes)`);
        }
        
        console.log('\n=== Data generation completed successfully! ===');
        console.log(`Total: ${totalUpdates} updates across ${allDataFiles.length} weeks from ${Object.keys(serviceData).length} services`);
        console.log(`Total: 0 notices from all services`);
        
    } catch (error) {
        console.error('Error during data generation:', error);
        console.log('Creating fallback data due to error...');
        await createFallbackData();
    }
}

async function createFallbackData() {
    console.log('Creating fallback data with service separation...');
    
    // Ensure all service directories exist
    [DATA_DIR, UPDATES_DIR, INTUNE_UPDATES_DIR, ENTRA_UPDATES_DIR, DEFENDER_UPDATES_DIR, DEFENDEROFFICE_UPDATES_DIR, DEFENDERENDPOINT_UPDATES_DIR, DEFENDERIDENTITY_UPDATES_DIR, WINDOWS365_UPDATES_DIR].forEach(dir => {
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
        service: "Entra ID", // Use full service name for consistency
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
                        service: "Entra ID", // Use full service name for consistency
                        link: "https://learn.microsoft.com/en-us/entra/fundamentals/whats-new"
                    }
                ]
            }
        ]
    };
    
    writeFileSync(`${ENTRA_UPDATES_DIR}/2025-07-14.json`, JSON.stringify(fallbackEntraData, null, 2));
    console.log('Generated fallback updates/entra/2025-07-14.json');
    
    // Create fallback Defender XDR update data
    const fallbackDefenderData = {
        month: "July 2025", // Use month instead of week for Defender
        date: "2025-07-14",
        service: "Defender XDR", // Use full service name for consistency
        serviceRelease: null,
        topics: [
            {
                topic: "July 2025 Updates",
                category: "monthly-updates",
                updates: [
                    {
                        id: generateContentId("July 2025 Updates", "Monthly Summary", "Microsoft Defender XDR continues to evolve with new features for threat detection, investigation, and response capabilities."),
                        title: "July 2025 Updates",
                        subtitle: "Monthly Summary",
                        content: "<ul><li>New advanced hunting tables are now available for preview, providing enhanced visibility into security events across Microsoft 365 workloads</li><li>Enhanced query performance and reliability for threat hunting operations</li><li>Improved integration with Microsoft Sentinel for comprehensive security operations</li><li>Updated incident response workflows with automated containment actions</li><li>Enhanced Microsoft Copilot integration for natural language threat hunting queries</li></ul>",
                        service: "Defender XDR", // Use full service name for consistency
                        link: "https://learn.microsoft.com/en-us/defender-xdr/whats-new"
                    }
                ]
            }
        ]
    };
    
    writeFileSync(`${DEFENDER_UPDATES_DIR}/2025-07-14.json`, JSON.stringify(fallbackDefenderData, null, 2));
    console.log('Generated fallback updates/defender/2025-07-14.json');
    
    // Create fallback Microsoft Defender for Identity update data
    const fallbackDefenderIdentityData = {
        month: "July 2025", // Use month instead of week for Defender Identity
        date: "2025-07-14",
        service: "Microsoft Defender for Identity", // Use full service name for consistency
        serviceRelease: null,
        topics: [
            {
                topic: "July 2025 Updates",
                category: "monthly-updates",
                updates: [
                    {
                        id: generateContentId("July 2025 Updates", "Monthly Summary", "Microsoft Defender for Identity continues to evolve with new features for identity security, threat detection, and user behavior analytics."),
                        title: "July 2025 Updates",
                        subtitle: "Monthly Summary",
                        content: "<ul><li>Enhanced identity protection with improved behavioral analytics for detecting suspicious user activities</li><li>New threat intelligence integration for better detection of identity-based attacks</li><li>Improved reporting capabilities with enhanced identity security posture dashboards</li><li>Updated investigation tools for faster identity threat response</li><li>Enhanced integration with Microsoft Sentinel for comprehensive identity security operations</li></ul>",
                        service: "Microsoft Defender for Identity", // Use full service name for consistency
                        link: "https://learn.microsoft.com/en-us/defender-for-identity/whats-new"
                    }
                ]
            }
        ]
    };
    
    writeFileSync(`${DEFENDERIDENTITY_UPDATES_DIR}/2025-07-14.json`, JSON.stringify(fallbackDefenderIdentityData, null, 2));
    console.log('Generated fallback updates/defenderidentity/2025-07-14.json');
    
    // Create fallback Microsoft Defender for Cloud Apps update data
    const fallbackDefenderCloudAppsData = {
        month: "July 2025", // Use month instead of week for Defender Cloud Apps
        date: "2025-07-14",
        service: "Microsoft Defender for Cloud Apps", // Use full service name for consistency
        serviceRelease: null,
        topics: [
            {
                topic: "July 2025 Updates",
                category: "monthly-updates",
                updates: [
                    {
                        id: generateContentId("July 2025 Updates", "Monthly Summary", "Microsoft Defender for Cloud Apps continues to evolve with new features for cloud security, app governance, and data protection."),
                        title: "July 2025 Updates",
                        subtitle: "Monthly Summary",
                        content: "<ul><li>Enhanced cloud app discovery with improved shadow IT detection capabilities</li><li>New data loss prevention policies for better protection of sensitive information in cloud apps</li><li>Improved threat protection with advanced behavioral analytics for cloud app usage</li><li>Updated governance controls for better management of cloud app permissions and access</li><li>Enhanced integration with Microsoft Purview for comprehensive data protection across cloud services</li></ul>",
                        service: "Microsoft Defender for Cloud Apps", // Use full service name for consistency
                        link: "https://learn.microsoft.com/en-us/defender-cloud-apps/release-notes"
                    }
                ]
            }
        ]
    };
    
    writeFileSync(`${DEFENDERCLOUDAPPS_UPDATES_DIR}/2025-07-14.json`, JSON.stringify(fallbackDefenderCloudAppsData, null, 2));
    console.log('Generated fallback updates/defendercloudapps/2025-07-14.json');
    
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
    
    console.log(`Generated fallback notices data structure (notices section removed)`);
    
    // Service-specific notice indexes removed - notices section eliminated
    console.log('Notice system completely removed - Plan for Change items integrated into regular updates');
    
    // Create fallback main index
    const allDataFiles = [
        {
            filename: "2025-07-14.json",
            path: "updates/intune/2025-07-14.json",
            week: "Week of July 14, 2025",
            date: "2025-07-14",
            service: "Intune", // Use full service name
            serviceRelease: null,
            updates: 1
        },
        {
            filename: "2025-07-14.json",
            path: "updates/entra/2025-07-14.json",
            week: "July 2025", // Use month for Entra display
            date: "2025-07-14",
            service: "Entra ID", // Use full service name
            serviceRelease: null,
            updates: 1
        },
        {
            filename: "2025-07-14.json",
            path: "updates/defender/2025-07-14.json",
            week: "July 2025", // Use month for Defender display
            date: "2025-07-14",
            service: "Defender XDR", // Use full service name
            serviceRelease: null,
            updates: 1
        },
        {
            filename: "2025-07-14.json",
            path: "updates/defenderidentity/2025-07-14.json",
            week: "July 2025", // Use month for Defender Identity display
            date: "2025-07-14",
            service: "Defender for Identity", // Use full service name
            serviceRelease: null,
            updates: 1
        }
    ];
    
    const monthlyGroups = groupDataFilesByMonth(allDataFiles);
    
    const indexData = {
        lastGenerated: new Date().toISOString(),
        totalUpdates: 4,
        totalFiles: 4,
        totalMonths: monthlyGroups.length,
        totalNotices: 4,
        services: ["Intune", "Entra ID", "Defender XDR", "Defender for Identity"], // Use full service names
        monthlyGroups: monthlyGroups,
        dataFiles: allDataFiles
    };
    
    writeFileSync(`${DATA_DIR}/index.json`, JSON.stringify(indexData, null, 2));
    console.log('Generated fallback index.json with service separation');
    
    console.log('Fallback data creation completed with service-separated structure');
}

// Helper function to clean topic text by removing type prefixes
function cleanTopicText(topicText) {
    // List of type prefixes to remove from topic names
    const typePrefixes = [
        'Plan for Change:', 'Plan for change:', 
        'Breaking Change:', 'Breaking change:',
        'General Availability:', 'Public Preview:', 'Private Preview:',
        'Deprecated:', 'Important Notice:', 'Notice:', 'Announcement:',
        'Important:', 'Update:', 'New Feature:', 'Feature Update:'
    ];
    
    let cleanedText = topicText;
    
    // Remove type prefixes from the beginning of the topic text
    for (const prefix of typePrefixes) {
        if (cleanedText.startsWith(prefix)) {
            cleanedText = cleanedText.substring(prefix.length).trim();
            break;
        }
    }
    
    // If the cleaned text is empty or too short, return the original
    if (!cleanedText || cleanedText.length < 10) {
        return topicText;
    }
    
    return cleanedText;
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
                        service: service.displayName || service.name, // Use displayName for table display, fallback to name
                        serviceRelease: null,
                        topics: []
                    };
                    
                    parseTableUpdates(table, monthData, service);
                    
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
            service: service.displayName || service.name, // Use displayName for table display, fallback to name
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
                parseTableUpdates(currentElement, monthData, service);
                foundUpdates++;
            } else if ((currentElement.tagName === 'UL' || currentElement.tagName === 'OL') && 
                       !isPreviousElementHeader(currentElement)) {
                // Only parse standalone lists, not lists that follow headers (those are handled by header parsing)
                console.log(`Found standalone list, checking if it should be parsed...`);
                console.log(`List content preview: "${currentElement.textContent.trim().substring(0, 100)}..."`);
                console.log(`isPreviousElementHeader result: ${isPreviousElementHeader(currentElement)}`);
                
                // Skip very short lists that might be fragments of larger updates
                const listText = currentElement.textContent.trim();
                if (listText.length < 80) {
                    console.log(`    Skipping short standalone list (${listText.length} chars): "${listText}"`);
                } else {
                    parseListUpdates(currentElement, monthData, service);
                    foundUpdates++;
                }
            } else if (currentElement.tagName === 'DIV' && currentElement.querySelector('h3, h4, table')) {
                console.log(`Found div with content, parsing...`);
                // Check for tables within the div
                const tables = currentElement.querySelectorAll('table');
                tables.forEach(table => parseTableUpdates(table, monthData, service));
                
                // Check for direct sections
                parseSectionUpdates(currentElement, monthData, service);
                foundUpdates++;
            } else if (currentElement.tagName === 'H3' || currentElement.tagName === 'H4') {
                console.log(`Found ${currentElement.tagName}: "${currentElement.textContent.trim().substring(0, 50)}..."`);
                parseDirectSection(currentElement, monthData, service);
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

// Enhanced parsing function specifically for Defender XDR updates
async function parseDefenderUpdates(document, service) {
    const weeklyUpdates = new Map();
    
    console.log(`\n=== DEBUGGING DEFENDER XDR STRUCTURE ===`);
    console.log(`Processing ${service.name} from ${service.url}`);
    
    // Look for month-based headers (e.g., "July 2025", "June 2025")
    const monthHeaders = Array.from(document.querySelectorAll('h2'))
        .filter(header => {
            const text = header.textContent.trim();
            const isMonth = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(text);
            if (isMonth) {
                console.log(`Found month header: "${text}" (${header.tagName})`);
            }
            return isMonth;
        });
    
    console.log(`\nFound ${monthHeaders.length} month sections for ${service.name}`);
    
    // Process found month headers
    for (const monthHeader of monthHeaders) {
        const monthText = monthHeader.textContent.trim();
        console.log(`\n=== Processing ${service.name}: ${monthText} ===`);
        
        // Extract date from month header
        const [monthName, year] = monthText.split(' ');
        const monthIndex = new Date(Date.parse(monthName + " 1, 2000")).getMonth();
        const lastDayOfMonth = new Date(parseInt(year), monthIndex + 1, 0);
        const dateString = lastDayOfMonth.toISOString().split('T')[0];
        
        // Extract URL for the month section using the month header
        const monthLink = extractSectionAnchorLink(monthHeader, service.url) || service.url;
        
        const monthData = {
            month: monthText,
            date: dateString,
            service: service.displayName || service.name, // Use displayName for table display, fallback to name
            serviceRelease: null,
            topics: []
        };
        
        // Collect all bullet points for this month and combine them into a single update
        const allBulletPoints = [];
        let currentElement = monthHeader.nextElementSibling;
        
        console.log(`Looking for content after month header...`);
        
        while (currentElement && !isNextMonthHeader(currentElement)) {
            if (currentElement.tagName === 'UL') {
                console.log(`Found bullet list, collecting bullet points...`);
                const listItems = Array.from(currentElement.querySelectorAll(':scope > li'));
                
                listItems.forEach(item => {
                    const fullText = extractTextContent(item);
                    if (fullText.trim()) {
                        const itemHTML = extractHTMLContent(item, service.url);
                        allBulletPoints.push({
                            text: fullText.trim(),
                            html: itemHTML
                        });
                    }
                });
            }
            
            currentElement = currentElement.nextElementSibling;
        }
        
        // If we found bullet points, create a single combined update for the month
        if (allBulletPoints.length > 0) {
            console.log(`Found ${allBulletPoints.length} updates in ${monthText}, combining into single update`);
            
            // Create combined HTML content with all bullet points
            const combinedHTML = `<ul>${allBulletPoints.map(bp => `<li>${bp.html}</li>`).join('')}</ul>`;
            const combinedText = allBulletPoints.map(bp => bp.text).join(' ');
            
            // Create a single update for the entire month
            const monthlyUpdate = {
                id: generateContentId(`${monthText} Updates`, 'Monthly Summary', combinedText),
                title: `${monthText} Updates`,
                subtitle: 'Monthly Summary',
                content: combinedHTML,
                service: service.name, // Use service.name for display consistency
                link: monthLink
            };
            
            // Create a single topic containing the monthly update
            const monthlyTopic = {
                topic: `${monthText} Updates`,
                category: 'monthly-updates',
                updates: [monthlyUpdate]
            };
            
            monthData.topics.push(monthlyTopic);
            
            console.log(`✅ Created combined update for ${monthText} with ${allBulletPoints.length} bullet points`);
            weeklyUpdates.set(dateString, monthData);
        } else {
            console.log(`❌ Skipping month ${monthText} - no updates found`);
        }
    }
    
    console.log(`\n=== DEFENDER XDR PARSING COMPLETE ===`);
    console.log(`Total months with updates: ${weeklyUpdates.size}`);
    
    return weeklyUpdates;
}

// Enhanced parsing function specifically for Defender for Office 365 updates
async function parseDefenderOfficeUpdates(document, service) {
    const weeklyUpdates = new Map();
    
    console.log(`\n=== DEBUGGING DEFENDER FOR OFFICE 365 STRUCTURE ===`);
    console.log(`Processing ${service.name} from ${service.url}`);
    
    // Look for month-based headers (e.g., "July 2025", "June 2025", "April/May 2021", "February/March 2021")
    const monthHeaders = Array.from(document.querySelectorAll('h2'))
        .filter(header => {
            const text = header.textContent.trim();
            // Match single months like "June 2021" or combined months like "April/May 2021"
            const isMonth = /^(January|February|March|April|May|June|July|August|September|October|November|December)(\/(January|February|March|April|May|June|July|August|September|October|November|December))?\s+\d{4}$/i.test(text);
            if (isMonth) {
                console.log(`Found month header: "${text}" (${header.tagName})`);
            }
            return isMonth;
        });
    
    console.log(`\nFound ${monthHeaders.length} month sections for ${service.name}`);
    
    // Process found month headers
    for (const monthHeader of monthHeaders) {
        const monthText = monthHeader.textContent.trim();
        console.log(`\n=== Processing ${service.name}: ${monthText} ===`);
        
        // Extract date from month header
        let dateString;
        if (monthText.includes('/')) {
            // Handle combined months like "April/May 2021" - use the last month mentioned
            const parts = monthText.split(' ');
            const year = parts[parts.length - 1];
            const monthPart = parts.slice(0, -1).join(' ');
            const lastMonth = monthPart.split('/').pop().trim();
            const monthIndex = new Date(Date.parse(lastMonth + " 1, 2000")).getMonth();
            const lastDayOfMonth = new Date(parseInt(year), monthIndex + 1, 0);
            dateString = lastDayOfMonth.toISOString().split('T')[0];
        } else {
            // Handle single months like "June 2021"
            const [monthName, year] = monthText.split(' ');
            const monthIndex = new Date(Date.parse(monthName + " 1, 2000")).getMonth();
            const lastDayOfMonth = new Date(parseInt(year), monthIndex + 1, 0);
            dateString = lastDayOfMonth.toISOString().split('T')[0];
        }
        
        // Extract URL for the month section using the month header
        const monthLink = extractSectionAnchorLink(monthHeader, service.url) || service.url;
        
        const monthData = {
            month: monthText,
            date: dateString,
            service: service.displayName || service.name, // Use displayName for table display, fallback to name
            serviceRelease: null,
            topics: []
        };
        
        // Collect all bullet points for this month and combine them into a single update
        const allBulletPoints = [];
        let currentElement = monthHeader.nextElementSibling;
        
        console.log(`Looking for content after month header...`);
        
        while (currentElement && !isNextMonthHeader(currentElement)) {
            if (currentElement.tagName === 'UL') {
                console.log(`Found bullet list, collecting bullet points...`);
                const listItems = Array.from(currentElement.querySelectorAll(':scope > li'));
                
                listItems.forEach(item => {
                    const fullText = extractTextContent(item);
                    if (fullText.trim()) {
                        const itemHTML = extractHTMLContent(item, service.url);
                        allBulletPoints.push({
                            text: fullText.trim(),
                            html: itemHTML
                        });
                    }
                });
            }
            
            currentElement = currentElement.nextElementSibling;
        }
        
        // If we found bullet points, create a single combined update for the month
        if (allBulletPoints.length > 0) {
            console.log(`Found ${allBulletPoints.length} updates in ${monthText}, combining into single update`);
            
            // Create combined HTML content with all bullet points
            const combinedHTML = `<ul>${allBulletPoints.map(bp => `<li>${bp.html}</li>`).join('')}</ul>`;
            const combinedText = allBulletPoints.map(bp => bp.text).join(' ');
            
            // Create a single update for the entire month
            const monthlyUpdate = {
                id: generateContentId(`${monthText} Updates`, 'Monthly Summary', combinedText),
                title: `${monthText} Updates`,
                subtitle: 'Monthly Summary',
                content: combinedHTML,
                service: service.name, // Use service.name for display consistency
                link: monthLink
            };
            
            // Create a single topic containing the monthly update
            const monthlyTopic = {
                topic: `${monthText} Updates`,
                category: 'monthly-updates',
                updates: [monthlyUpdate]
            };
            
            monthData.topics.push(monthlyTopic);
            
            console.log(`✅ Created combined update for ${monthText} with ${allBulletPoints.length} bullet points`);
            weeklyUpdates.set(dateString, monthData);
        } else {
            console.log(`❌ Skipping month ${monthText} - no updates found`);
        }
    }
    
    console.log(`\n=== DEFENDER FOR OFFICE 365 PARSING COMPLETE ===`);
    console.log(`Total months with updates: ${weeklyUpdates.size}`);
    
    return weeklyUpdates;
}

// Parse Defender for Endpoint updates with month-based structure
async function parseDefenderEndpointUpdates(document, service) {
    const weeklyUpdates = new Map();
    
    console.log(`\n=== DEBUGGING DEFENDER FOR ENDPOINT STRUCTURE ===`);
    console.log(`Processing ${service.name} from ${service.url}`);
    
    // Look for month-based headers (e.g., "July 2025", "June 2025", "November-December 2024")
    const monthHeaders = Array.from(document.querySelectorAll('h2'))
        .filter(header => {
            const text = header.textContent.trim();
            
            // Handle both single months like "January 2025" and compound months like "November-December 2024"
            const singleMonthPattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i;
            const compoundMonthPattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)[-\s]+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i;
            
            const isMonth = singleMonthPattern.test(text) || compoundMonthPattern.test(text);
            if (isMonth) {
                console.log(`Found month header: "${text}" (${header.tagName})`);
            }
            return isMonth;
        });
    
    console.log(`\nFound ${monthHeaders.length} month sections for ${service.name}`);
    
    // Process found month headers
    for (const monthHeader of monthHeaders) {
        const monthText = monthHeader.textContent.trim();
        console.log(`\n=== Processing ${service.name}: ${monthText} ===`);
        
        // Extract date from month header
        const [monthName, year] = monthText.split(' ');
        const monthIndex = new Date(Date.parse(monthName + " 1, 2000")).getMonth();
        const lastDayOfMonth = new Date(parseInt(year), monthIndex + 1, 0);
        const dateString = lastDayOfMonth.toISOString().split('T')[0];
        
        // Extract URL for the month section using the month header
        const monthLink = extractSectionAnchorLink(monthHeader, service.url) || service.url;
        
        const monthData = {
            month: monthText,
            date: dateString,
            service: service.displayName || service.name, // Use displayName for table display, fallback to name
            serviceRelease: null,
            topics: []
        };
        
        // Collect all bullet points for this month and combine them into a single update
        const allBulletPoints = [];
        let currentElement = monthHeader.nextElementSibling;
        
        console.log(`Looking for content after month header...`);
        
        while (currentElement && !isNextMonthHeader(currentElement)) {
            if (currentElement.tagName === 'UL') {
                console.log(`Found bullet list, collecting bullet points...`);
                const listItems = Array.from(currentElement.querySelectorAll(':scope > li'));
                
                listItems.forEach(item => {
                    const fullText = extractTextContent(item);
                    if (fullText.trim()) {
                        const itemHTML = extractHTMLContent(item, service.url);
                        allBulletPoints.push({
                            text: fullText.trim(),
                            html: itemHTML
                        });
                    }
                });
            }
            
            currentElement = currentElement.nextElementSibling;
        }
        
        // If we found bullet points, create a single combined update for the month
        if (allBulletPoints.length > 0) {
            console.log(`Found ${allBulletPoints.length} updates in ${monthText}, combining into single update`);
            
            // Create combined HTML content with all bullet points
            const combinedHTML = `<ul>${allBulletPoints.map(bp => `<li>${bp.html}</li>`).join('')}</ul>`;
            const combinedText = allBulletPoints.map(bp => bp.text).join(' ');
            
            // Create a single update for the entire month
            const monthlyUpdate = {
                id: generateContentId(`${monthText} Updates`, 'Monthly Summary', combinedText),
                title: `${monthText} Updates`,
                subtitle: 'Monthly Summary',
                content: combinedHTML,
                service: service.name, // Use service.name for display consistency
                link: monthLink
            };
            
            // Create a single topic containing the monthly update
            const monthlyTopic = {
                topic: `${monthText} Updates`,
                category: 'monthly-updates',
                updates: [monthlyUpdate]
            };
            
            monthData.topics.push(monthlyTopic);
            
            console.log(`✅ Created combined update for ${monthText} with ${allBulletPoints.length} bullet points`);
            weeklyUpdates.set(dateString, monthData);
        } else {
            console.log(`❌ Skipping month ${monthText} - no updates found`);
        }
    }
    
    console.log(`\n=== DEFENDER FOR ENDPOINT PARSING COMPLETE ===`);
    console.log(`Total months with updates: ${weeklyUpdates.size}`);
    
    return weeklyUpdates;
}

// Parse table-based updates (common in Microsoft Learn)
function parseTableUpdates(table, monthData, service) {
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
            const descriptionHTML = extractHTMLContent(descriptionCell, service?.url);
            const contentHTML = descriptionHTML ? `<div>${descriptionHTML}</div>` : `<p>${title}</p>`;
            const finalContent = contentHTML + (productCapability ? ` <span class="product-capability">- ${productCapability}</span>` : '');
            
            // Convert to frontend-compatible format with correct mapping
            const update = {
                id: generateContentId(title, type, title),
                title: title, // Topic (Title) from Microsoft Learn
                subtitle: type ? `Type: ${type}` : undefined,
                content: finalContent, // Now includes HTML markup
                service: 'Entra ID',
                link: extractLinks(descriptionCell, 'https://learn.microsoft.com/en-us/mem/intune/fundamentals/whats-new')[0]?.url || 'https://learn.microsoft.com/en-us/mem/intune/fundamentals/whats-new'
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
function parseListUpdates(list, monthData, service) {
    const items = Array.from(list.querySelectorAll('li'));
    
    items.forEach(item => {
        const text = extractTextContent(item);
        if (text.trim()) {
            // Skip very short items that are likely fragments (like single DNS entries)
            if (text.trim().length < 40) {
                console.log(`    Skipping short list item: "${text.trim()}"`);
                return;
            }
            
            // Skip items that look like they're just DNS names or IP addresses
            if (/^[\w\-\.]+\.[\w]+$/.test(text.trim()) || /^\d+\.\d+\.\d+\.\d+/.test(text.trim())) {
                console.log(`    Skipping DNS/IP item: "${text.trim()}"`);
                return;
            }
            
            // Get HTML content for better formatting
            const itemHTML = extractHTMLContent(item, service?.url);
            const contentHTML = itemHTML ? `<div>${itemHTML}</div>` : `<p>${text}</p>`;
            
            // Convert to frontend-compatible format
            const update = {
                id: generateContentId(text, 'Update', text),
                title: text,
                subtitle: undefined,
                content: contentHTML, // Now includes HTML markup
                service: 'Entra ID',
                link: extractLinks(item, 'https://learn.microsoft.com/en-us/mem/intune/fundamentals/whats-new')[0]?.url || 'https://learn.microsoft.com/en-us/mem/intune/fundamentals/whats-new'
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
function parseSectionUpdates(section, monthData, service) {
    const headers = section.querySelectorAll('h3, h4');
    
    headers.forEach(header => {
        const update = parseEntraUpdateFromHeader(header, monthData.date, service);
        
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
function parseDirectSection(header, monthData, service) {
    const update = parseEntraUpdateFromHeader(header, monthData.date, service);
    
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
function parseEntraUpdateFromHeader(header, date, service = null) {
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
            htmlParts.push(`<p>${extractHTMLContent(currentElement, service?.url)}</p>`);
        } else if (currentElement.tagName === 'UL' || currentElement.tagName === 'OL') {
            // Include list content as part of the update description - preserve HTML structure
            const listItems = Array.from(currentElement.querySelectorAll('li'));
            const textContent = listItems.map(item => '• ' + extractTextContent(item)).join('\n');
            const htmlContent = extractHTMLContent(currentElement, service?.url);
            
            if (textContent.trim()) {
                descriptionParts.push('The following combinations are supported:\n' + textContent);
                htmlParts.push(`<p>The following combinations are supported:</p><${currentElement.tagName.toLowerCase()}>${htmlContent}</${currentElement.tagName.toLowerCase()}>`);
            }
        }
        
        currentElement = currentElement.nextElementSibling;
        
        // Allow more content to be collected to ensure complete updates
        if (descriptionParts.length >= 10) break;
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
        service: service ? service.name : 'Entra ID',
        serviceCategory: serviceCategory, // Keep for topic assignment logic
        productCapability: productCapability, // Keep for topic assignment logic  
        link: extractSectionAnchorLink(header, service ? service.url : 'https://learn.microsoft.com/en-us/entra/fundamentals/whats-new') || extractLinks(header.parentElement)[0]?.url || (service ? service.url : 'https://learn.microsoft.com/en-us/entra/fundamentals/whats-new')
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
function extractHTMLContent(element, baseUrl = null) {
    if (!element) return '';
    
    // Clean up the HTML while preserving structure
    let html = element.innerHTML;
    
    // Convert relative URLs to absolute URLs if baseUrl is provided
    if (baseUrl) {
        html = convertRelativeUrlsToAbsolute(html, baseUrl);
    }
    
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
    
    // Final sanitization to catch any remaining malformed HTML
    html = sanitizeHTML(html);
    
    return html;
}

// Sanitize HTML content to fix malformed tags and attributes
function sanitizeHTML(html) {
    if (!html) return html;
    
    // Fix malformed link tags with unescaped > characters
    html = html.replace(/<a([^>]*?)href="([^"]*?)"([^>]*?)>/g, (match, before, url, after) => {
        // Sanitize the URL and reconstruct the tag
        const cleanUrl = sanitizeUrl(url);
        return `<a${before}href="${cleanUrl}"${after}>`;
    });
    
    // Fix any remaining unescaped > characters that might break parsing
    html = html.replace(/([^<])>([^<])/g, '$1&gt;$2');
    
    return html;
}

// Convert relative URLs in HTML content to absolute URLs
function convertRelativeUrlsToAbsolute(html, baseUrl) {
    if (!html || !baseUrl) return html;
    
    // Convert href attributes
    html = html.replace(/href="([^"]+)"/g, (match, url) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            // Clean up any malformed characters in absolute URLs
            const cleanUrl = sanitizeUrl(url);
            return `href="${cleanUrl}"`;
        }
        
        if (url.startsWith('/')) {
            // Root-relative URL - use the domain from baseUrl
            const baseUrlObj = new URL(baseUrl);
            const cleanUrl = sanitizeUrl(`${baseUrlObj.origin}${url}`);
            return `href="${cleanUrl}"`;
        }
        
        if (url.startsWith('#')) {
            // Fragment-only URL - append to current page
            const cleanUrl = sanitizeUrl(`${baseUrl}${url}`);
            return `href="${cleanUrl}"`;
        }
        
        // Relative URL - resolve against baseUrl
        try {
            const absoluteUrl = new URL(url, baseUrl);
            const cleanUrl = sanitizeUrl(absoluteUrl.href);
            return `href="${cleanUrl}"`;
        } catch (e) {
            // If URL parsing fails, at least sanitize what we have
            const cleanUrl = sanitizeUrl(url);
            return `href="${cleanUrl}"`;
        }
    });
    
    return html;
}

// Sanitize URLs to fix common issues with malformed characters
function sanitizeUrl(url) {
    if (!url) return url;
    
    // Fix common malformed URL patterns
    return url
        // Fix URLs with unescaped > characters in fragments
        .replace(/#([^#]*?)>([^#]*?)$/g, '#$1-$2')  // Replace > with - in fragments
        // Fix any other unescaped > characters that might break HTML
        .replace(/([^=]|^)>([^<])/g, '$1%3E$2')
        // Fix double slashes (except after protocol)
        .replace(/([^:])\/\/+/g, '$1/')
        // Clean up any malformed anchor patterns
        .replace(/#[^a-zA-Z0-9-_]*$/g, '');
}

// Extract links from element, prioritizing anchor links for section headers
// Helper function to extract section anchor link from header element (optimized)
function extractSectionAnchorLink(header, baseUrl) {
    if (!header) return null;
    
    // FASTEST: Check for id attribute first (most common case for Microsoft Learn)
    const headerId = header.getAttribute('id') || header.getAttribute('data-anchor-id');
    if (headerId) {
        const directUrl = `${baseUrl}#${headerId}`;
        return directUrl;
    }
    
    // FAST: Look for anchor links within the header itself
    const inHeaderLinks = header.querySelectorAll('a[href*="#"]');
    for (const link of inHeaderLinks) {
        const href = link.getAttribute('href');
        if (href && href.includes('#')) {
            const text = link.textContent.trim();
            const hasIcon = link.querySelector('svg, i, .icon') || 
                           link.className.includes('icon') ||
                           link.className.includes('anchor') ||
                           link.getAttribute('aria-label')?.includes('anchor') ||
                           link.getAttribute('title')?.includes('anchor') ||
                           href.includes('whats-new') // Ensure it's still on the what's new page
            ;
            
            if (text.length <= 2 || hasIcon || text === '' || text === '#') {
                return href.startsWith('http') ? href : `${baseUrl}${href}`;
            }
        }
    }
    
    // Generate anchor from header text as fallback (most reliable for Microsoft Learn)
    const headerText = header.textContent.trim();
    if (headerText) {
        // Fix the double dash issue for Microsoft Learn compatibility
        const anchorId = headerText
            .toLowerCase()
            .replace(/–/g, '--')      // Replace em-dash with double dash FIRST
            .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
            .replace(/\s+/g, '-')     // Replace spaces with hyphens
            .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens (keep internal double dashes)
        
        if (anchorId) {
            const generatedUrl = `${baseUrl}#${anchorId}`;
            return generatedUrl;
        }
    }
    
    return null;
}

function extractLinks(element, baseUrl = '') {
    if (!element) return [];
    
    // First, look for the anchor link icon that appears next to headers on Microsoft Learn
    // These usually have an href that includes a fragment identifier (#)
    const anchorLinks = Array.from(element.querySelectorAll('a[href*="#"]'));
    const sectionAnchorLinks = anchorLinks.filter(link => {
        // Look for links that contain fragment identifiers and are likely section anchors
        const href = link.href;
        const text = link.textContent.trim();
        
        // Microsoft Learn anchor links often have no text content or contain icons
        // They typically point to the same page with a fragment
        return href.includes('#') && (
            text === '' || 
            text.length < 3 || 
            link.querySelector('i, svg, .icon') || // Contains icon elements
            link.classList.contains('anchor') ||
            link.getAttribute('aria-label')?.includes('anchor') ||
            link.getAttribute('title')?.includes('anchor') ||
            href.includes('whats-new') // Ensure it's still on the what's new page
        );
    });
    
    // If we found anchor links, prioritize those
    if (sectionAnchorLinks.length > 0) {
        const bestAnchorLink = sectionAnchorLinks[0];
        console.log(`Found section anchor link: ${bestAnchorLink.href}`);
        return [{
            text: 'Section Link',
            url: bestAnchorLink.href
        }];
    }
    
    // Fallback: look for any links within the element
    const allLinks = Array.from(element.querySelectorAll('a'));
    const validLinks = allLinks
        .map(link => ({
            text: link.textContent.trim(),
            url: link.href
        }))
        .filter(link => {
            const url = link.url;
            return url && (
                url.includes('learn.microsoft.com') || 
                url.startsWith('/') || 
                url.startsWith('../')
            );
        })
        .map(link => ({
            ...link,
            // Convert relative URLs to absolute
            url: link.url.startsWith('http') ? link.url : 
                 link.url.startsWith('/') ? `https://learn.microsoft.com${link.url}` :
                 baseUrl ? `${baseUrl.replace(/\/[^\/]*$/, '/')}${link.url}` : link.url
        }));
    
    return validLinks.length > 0 ? validLinks : [];
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
