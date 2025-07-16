class IntuneUpdatesTracker {
    constructor() {
        this.updates = [];
        this.notices = [];
        this.indexData = {};
        this.filteredUpdates = [];
        this.displayedUpdates = [];
        this.updatesPerPage = 20;
        this.currentPage = 1;
        
        this.searchInput = document.getElementById('searchInput');
        this.serviceFilter = document.getElementById('serviceFilter');
        this.categoryFilter = document.getElementById('categoryFilter');
        this.timeFilter = document.getElementById('timeFilter');
        this.updatesContainer = document.getElementById('updatesContainer');
        this.noticesContainer = document.getElementById('noticesContainer');
        this.loadMoreBtn = document.getElementById('loadMoreBtn');
        
        this.bindEvents();
        this.init();
    }

    bindEvents() {
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.debounce(() => this.filterUpdates(), 300));
        }
        
        if (this.serviceFilter) {
            this.serviceFilter.addEventListener('change', () => this.filterUpdates());
        }
        
        if (this.categoryFilter) {
            this.categoryFilter.addEventListener('change', () => this.filterUpdates());
        }
        
        if (this.timeFilter) {
            this.timeFilter.addEventListener('change', () => this.filterUpdates());
        }
        
        if (this.loadMoreBtn) {
            this.loadMoreBtn.addEventListener('click', () => this.loadMoreUpdates());
        }

        // Close modal when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeModal();
            }
        });

        // Close modal on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    async init() {
        this.setLoading(true);
        try {
            const data = await this.fetchIntuneUpdates();
            this.updates = data.updates;
            this.notices = data.notices;
            this.indexData = data.indexData;
            
            console.log('Init: indexData loaded:', this.indexData);
            
            this.populateServiceFilter();
            this.populateCategoryFilter();
            this.updateStats();
            this.filterUpdates();
            this.displayNotices();
            this.updateDeploymentTime();
        } catch (error) {
            console.error('Error initializing tracker:', error);
            this.showError('Failed to load updates. Please try again later.');
        } finally {
            this.setLoading(false);
        }
    }

    async fetchIntuneUpdates() {
        try {
            // Load the index file to get available data files
            const indexUrl = './data/index.json';
            const indexResponse = await fetch(indexUrl);
            
            if (!indexResponse.ok) {
                console.error('Index file not found or failed to load. Status:', indexResponse.status, 'URL:', indexUrl);
                return this.getFallbackData();
            }
            
            const indexData = await indexResponse.json();
            
            // Load all update files
            const updates = [];
            
            if (!indexData.dataFiles || indexData.dataFiles.length === 0) {
                console.error('No data files found in index.json');
                return this.getFallbackData();
            }
            
            for (const fileInfo of indexData.dataFiles) {
                try {
                    const filePath = fileInfo.path || `updates/${fileInfo.filename}`;
                    const fullUrl = `./data/${filePath}`;
                    const fileResponse = await fetch(fullUrl);
                    
                    if (!fileResponse.ok) {
                        console.warn(`Failed to load ${filePath}, status: ${fileResponse.status}`);
                        continue;
                    }
                    
                    const fileData = await fileResponse.json();
                    
                    // Process each topic and its updates
                    if (fileData.topics) {
                        fileData.topics.forEach(topic => {
                            if (topic.updates) {
                                topic.updates.forEach(update => {
                                    updates.push({
                                        ...update,
                                        category: topic.category,
                                        topic: topic.topic,
                                        date: fileData.date,
                                        week: fileData.week || fileData.month, // Handle both week and month structures
                                        service: fileData.service || update.service, // Ensure service field is set
                                        serviceRelease: fileData.serviceRelease
                                    });
                                });
                            }
                        });
                    }
                } catch (fileError) {
                    console.error(`Error loading file ${fileInfo.filename}:`, fileError);
                    console.error('File info:', fileInfo);
                }
            }
            
            // Load notices from both service directories
            let notices = [];
            try {
                // List of service directories to check for notices
                const serviceDirectories = ['intune', 'entra'];
                
                for (const service of serviceDirectories) {
                    try {
                        const noticesIndexResponse = await fetch(`./data/notices/${service}/index.json`);
                        if (noticesIndexResponse.ok) {
                            const noticesIndexData = await noticesIndexResponse.json();
                            const noticeFiles = noticesIndexData.noticeFiles || [];
                            
                            // Load individual notice files
                            for (const noticeFile of noticeFiles) {
                                try {
                                    const noticeResponse = await fetch(`./data/${noticeFile.path}`);
                                    if (noticeResponse.ok) {
                                        const notice = await noticeResponse.json();
                                        notices.push(notice);
                                    }
                                } catch (noticeError) {
                                    console.warn(`Error loading notice file ${noticeFile.path}:`, noticeError);
                                }
                            }
                        } else {
                            console.warn(`Notices index file not found for service: ${service}`);
                        }
                    } catch (serviceNoticeError) {
                        console.warn(`Error loading notices for service ${service}:`, serviceNoticeError);
                    }
                }
            } catch (noticesError) {
                console.error('Error loading notices:', noticesError);
            }
            
            return {
                updates: updates.sort((a, b) => new Date(b.date) - new Date(a.date)),
                notices: notices,
                indexData: indexData
            };
            
        } catch (error) {
            console.error('Error loading JSON data:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack
            });
            return this.getFallbackData();
        }
    }

    getFallbackData() {
        // Show a warning to the user
        const warningDiv = document.createElement('div');
        warningDiv.className = 'alert alert-warning';
        warningDiv.innerHTML = `
            <strong>⚠️ No Data Available:</strong> All data files have been cleared. 
            Please regenerate data to see updates and notices.
        `;
        
        const container = document.querySelector('.container');
        if (container) {
            container.insertBefore(warningDiv, container.firstChild);
        }
        
        return {
            updates: [],
            notices: [],
            indexData: {
                dataFiles: [],
                totalUpdates: 0
            }
        };
    }

    populateServiceFilter() {
        if (!this.serviceFilter || !this.updates) return;

        // Extract unique services from all updates
        const services = new Set();
        
        this.updates.forEach(update => {
            if (update.service) {
                services.add(update.service);
            }
        });

        // Convert to array and sort alphabetically
        const sortedServices = Array.from(services).sort();

        // Create a mapping for better display names
        const serviceDisplayNames = {
            'Intune': 'Microsoft Intune',
            'Entra': 'Microsoft Entra ID'
        };

        // Clear existing options except "All Services"
        this.serviceFilter.innerHTML = '<option value="all">All Services</option>';

        // Add service options
        sortedServices.forEach(service => {
            const option = document.createElement('option');
            option.value = service;
            option.textContent = serviceDisplayNames[service] || service;
            this.serviceFilter.appendChild(option);
        });

        console.log('Populated services:', sortedServices);
    }

    populateCategoryFilter() {
        if (!this.categoryFilter || !this.updates) return;

        // Extract unique categories from all updates
        const categories = new Set();
        
        this.updates.forEach(update => {
            if (update.category) {
                categories.add(update.category);
            }
        });

        // Convert to array and sort alphabetically
        const sortedCategories = Array.from(categories).sort();

        // Create a mapping for better display names
        const categoryDisplayNames = {
            'device-management': 'Device Management',
            'app-management': 'App Management', 
            'device-security': 'Device Security',
            'device-configuration': 'Device Configuration',
            'microsoft-intune-suite': 'Microsoft Intune Suite',
            'intune-suite': 'Microsoft Intune Suite',
            'intune-apps': 'Intune Apps',
            'monitor-troubleshoot': 'Monitor & Troubleshoot',
            'identity-management': 'Identity Management',
            'conditional-access': 'Conditional Access',
            'authentication': 'Authentication',
            'identity-governance': 'Identity Governance',
            'privileged-identity': 'Privileged Identity Management',
            'external-identities': 'External Identities',
            'application-management': 'Application Management',
            'notices': 'Notices'
        };

        // Clear existing options except "All Categories"
        this.categoryFilter.innerHTML = '<option value="all">All Categories</option>';

        // Add category options
        sortedCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = categoryDisplayNames[category] || 
                category.split('-').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1)
                ).join(' ');
            this.categoryFilter.appendChild(option);
        });

        console.log('Populated categories:', sortedCategories);
    }

    filterUpdates() {
        const searchTerm = this.searchInput?.value.toLowerCase() || '';
        const serviceFilter = this.serviceFilter?.value || '';
        const categoryFilter = this.categoryFilter?.value || '';
        const timeFilter = this.timeFilter?.value || '';

        console.log('=== FILTER DEBUG ===');
        console.log('Selected service filter:', `"${serviceFilter}"`);
        console.log('All available services:', [...new Set(this.updates.map(u => u.service))]);

        this.filteredUpdates = this.updates.filter(update => {
            // Search filter
            const matchesSearch = !searchTerm || 
                update.title.toLowerCase().includes(searchTerm) ||
                update.subtitle?.toLowerCase().includes(searchTerm) ||
                update.content.toLowerCase().includes(searchTerm) ||
                update.topic.toLowerCase().includes(searchTerm) ||
                (update.features && update.features.some(feature => 
                    feature.toLowerCase().includes(searchTerm)));

            // Service filter
            const matchesService = !serviceFilter || serviceFilter === 'all' || update.service === serviceFilter;

            // Category filter
            const matchesCategory = !categoryFilter || categoryFilter === 'all' || update.category === categoryFilter;

            // Time filter
            const matchesTime = this.checkTimeFilter(update.date, timeFilter);

            // Debug individual update filtering
            if (serviceFilter && serviceFilter !== 'all') {
                console.log(`Update "${update.title.substring(0, 30)}..." - service: "${update.service}" - matches: ${matchesService}`);
            }

            return matchesSearch && matchesService && matchesCategory && matchesTime;
        });

        console.log('Total filtered updates:', this.filteredUpdates.length);
        
        // Log service breakdown of filtered results
        if (serviceFilter && serviceFilter !== 'all') {
            const serviceBreakdown = {};
            this.filteredUpdates.forEach(update => {
                const service = update.service || 'no-service';
                serviceBreakdown[service] = (serviceBreakdown[service] || 0) + 1;
            });
            console.log('Service breakdown of filtered results:', serviceBreakdown);
        }
        
        this.currentPage = 1;
        this.displayUpdates();
    }

    checkTimeFilter(dateString, filter) {
        if (!filter || filter === 'all') return true;

        const updateDate = new Date(dateString);
        const now = new Date();
        const timeDiff = now - updateDate;
        const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

        switch (filter) {
            case '7days':
                return daysDiff <= 7;
            case '30days':
                return daysDiff <= 30;
            case '90days':
                return daysDiff <= 90;
            default:
                return true;
        }
    }

    displayUpdates() {
        if (!this.updatesContainer) return;

        const startIndex = 0;
        const endIndex = this.currentPage * this.updatesPerPage;
        this.displayedUpdates = this.filteredUpdates.slice(startIndex, endIndex);

        if (this.displayedUpdates.length === 0) {
            this.updatesContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <h3>No updates found</h3>
                    <p>Try adjusting your search criteria or filters.</p>
                </div>
            `;
        } else {
            // Separate Entra and Intune updates
            const entraUpdates = this.displayedUpdates.filter(update => update.service === 'Entra');
            const intuneUpdates = this.displayedUpdates.filter(update => update.service !== 'Entra');
                  // Debug logging
        console.log('=== DISPLAY UPDATES DEBUG ===');
        console.log('Total displayed updates:', this.displayedUpdates.length);
        console.log('Entra updates:', entraUpdates.length);
        console.log('Intune updates:', intuneUpdates.length);
        
        // Check for service field issues
        const servicesFound = [...new Set(this.displayedUpdates.map(u => u.service))];
        console.log('Unique services found:', servicesFound);
        
        // Check current filter state
        console.log('Current service filter:', this.serviceFilter ? this.serviceFilter.value : 'none');
        
        // Log some sample updates to see their structure
        if (this.displayedUpdates.length > 0) {
            console.log('Sample update service fields:');
            this.displayedUpdates.slice(0, 3).forEach((update, index) => {
                console.log(`  Update ${index}: service="${update.service}", title="${update.title.substring(0, 50)}..."`);
            });
        }
            
            // Check for undefined/null services
            const noServiceUpdates = this.displayedUpdates.filter(u => !u.service);
            console.log('Updates with no service field:', noServiceUpdates.length);
            
            if (entraUpdates.length > 0) {
                console.log('First Entra update service field:', `"${entraUpdates[0].service}"`);
                console.log('Entra update structure:', entraUpdates[0]);
            }
            if (intuneUpdates.length > 0) {
                console.log('First Intune update service field:', `"${intuneUpdates[0].service}"`);
            }
            
            let html = '';
            
            // Check current service filter
            const serviceFilterValue = this.serviceFilter ? this.serviceFilter.value : 'all';
            
            // If a specific service is selected, show unified table view
            if (serviceFilterValue !== 'all' && serviceFilterValue !== '') {
                html += `
                    <div class="unified-updates-section">
                        <h2 class="service-section-title">
                            <span class="service-badge service-${serviceFilterValue.toLowerCase()}">${serviceFilterValue === 'Entra' ? 'Microsoft Entra ID' : serviceFilterValue === 'Intune' ? 'Microsoft Intune' : serviceFilterValue}</span>
                        </h2>
                        <div class="updates-table-container">
                            <table class="updates-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Month</th>
                                        <th>Service</th>
                                        <th>Category</th>
                                        <th>Topic</th>
                                        <th>Type</th>
                                        <th>Features</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.displayedUpdates.map(update => this.createUpdateRow(update)).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            } else {
                // Default view: Show all updates in unified table
                html += `
                    <div class="unified-updates-section">
                        <h2 class="service-section-title">
                            <span class="service-badge">All Microsoft Cloud Updates</span>
                        </h2>
                        <div class="updates-table-container">
                            <table class="updates-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Month</th>
                                        <th>Service</th>
                                        <th>Category</th>
                                        <th>Topic</th>
                                        <th>Type</th>
                                        <th>Features</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.displayedUpdates.map(update => this.createUpdateRow(update)).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
            
            this.updatesContainer.innerHTML = html;
        }

        // Show/hide load more button
        if (this.loadMoreBtn) {
            const hasMoreUpdates = this.filteredUpdates.length > this.displayedUpdates.length;
            this.loadMoreBtn.style.display = hasMoreUpdates ? 'block' : 'none';
        }
    }

    createUpdateRow(update) {
        const formattedDate = this.formatDate(update.date);
        const categoryName = this.formatCategoryName(update.category);
        const featuresCount = update.features ? update.features.length : 0;
        const monthName = this.extractMonthFromWeek(update.week || update.date);
        
        // Extract type from subtitle or fallback to title extraction
        const type = update.subtitle || this.extractTypeFromTitle(update.title);
        
        // This function should only handle Intune updates - Entra updates go through createGroupedEntraUpdates
        return `
            <tr class="update-row" onclick="window.tracker.showUpdateModal('${update.id}')" style="cursor: pointer;">
                <td data-label="Date">${formattedDate}</td>
                <td data-label="Month">${monthName}</td>
                <td data-label="Service">
                    <span class="service-badge service-${(update.service || 'unknown').toLowerCase()}">${update.service || 'Unknown'}</span>
                </td>
                <td data-label="Category">
                    <span class="category-badge category-${update.category}">${categoryName}</span>
                </td>
                <td data-label="Topic">${this.truncateText(update.title, 50)}</td>
                <td data-label="Type">${this.truncateText(type, 25)}</td>
                <td data-label="Features">${featuresCount > 0 ? `${featuresCount} features` : 'N/A'}</td>
                <td data-label="Action">
                    <button class="view-details-btn" onclick="event.stopPropagation(); window.tracker.showUpdateModal('${update.id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                </td>
            </tr>
        `;
    }

    createGroupedEntraUpdates(entraUpdates) {
        // Group updates by month
        const updatesByMonth = {};
        
        entraUpdates.forEach(update => {
            const monthName = this.extractMonthFromWeek(update.week || update.date);
            if (!updatesByMonth[monthName]) {
                updatesByMonth[monthName] = [];
            }
            updatesByMonth[monthName].push(update);
        });
        
        // Sort months by date (most recent first)
        const sortedMonths = Object.keys(updatesByMonth).sort((a, b) => {
            // Parse month names like "June 2025" into dates for proper sorting
            const parseMonthYear = (monthYear) => {
                const parts = monthYear.split(' ');
                if (parts.length === 2) {
                    const month = parts[0];
                    const year = parts[1];
                    return new Date(`${month} 1, ${year}`);
                }
                return new Date(monthYear);
            };
            
            const dateA = parseMonthYear(a);
            const dateB = parseMonthYear(b);
            return dateB - dateA;
        });
        
        let html = '';
        
        sortedMonths.forEach(monthName => {
            const monthUpdates = updatesByMonth[monthName];
            
            // Sort updates within each month by date (most recent first)
            monthUpdates.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Add month header
            html += `<div class="month-section">`;
            html += `<h3 class="month-header">${monthName}</h3>`;
            
            // Add all updates for this month (without individual month headers)
            monthUpdates.forEach(update => {
                html += this.createEntraUpdateCard(update, false); // false = don't show month
            });
            
            html += `</div>`;
        });
        
        return html;
    }
    
    createEntraUpdateCard(update, showMonth = true) {
        const categoryName = this.formatCategoryName(update.category);
        const type = update.subtitle || this.extractTypeFromTitle(update.title);
        const monthName = this.extractMonthFromWeek(update.week || update.date);
        
        return `
            <div class="entra-update-card" onclick="window.tracker.showUpdateModal('${update.id}')" style="cursor: pointer;">
                <div class="update-header">
                    ${showMonth ? `<h3 class="update-month">${monthName}</h3>` : ''}
                    <h4 class="update-topic">${update.title}</h4>
                </div>
                <div class="update-meta">
                    <div class="meta-row"><strong>Type:</strong> ${type}</div>
                    <div class="meta-row"><strong>Service Category:</strong> <span class="category-badge category-${update.category}">${categoryName}</span></div>
                    ${update.productCapability ? `<div class="meta-row"><strong>Product Capability:</strong> ${update.productCapability}</div>` : ''}
                </div>
                <div class="update-description">
                    <p>${this.truncateText(update.content, 200)}</p>
                </div>
                <div class="update-actions">
                    <button class="view-details-btn" onclick="event.stopPropagation(); window.tracker.showUpdateModal('${update.id}')">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                </div>
            </div>
            <hr class="update-separator">
        `;
    }

    displayNotices() {
        if (!this.noticesContainer || !this.notices.length) {
            this.noticesContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-info-circle"></i>
                    <h3>No important notices</h3>
                    <p>No important notices are currently available.</p>
                </div>
            `;
            return;
        }

        // Sort notices by date (most recent first)
        const sortedNotices = [...this.notices].sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return dateB - dateA; // Descending order (newest first)
        });

        const noticesHtml = `
            <div class="notices-table-container">
                <table class="notices-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Service</th>
                            <th>Plan Type</th>
                            <th>Type</th>
                            <th>Title</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedNotices.map(notice => this.createNoticeRow(notice)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        this.noticesContainer.innerHTML = noticesHtml;
    }

    createNoticeRow(notice) {
        const formattedDate = this.formatDate(notice.date);
        const statusClass = notice.status || 'active';
        const typeClass = notice.type || 'info';
        const serviceName = notice.service || 'Unknown';
        
        // Extract plan type and clean title
        const { planType, cleanTitle } = this.extractPlanTypeFromTitle(notice.title);
        
        return `
            <tr class="notice-row" onclick="window.tracker.showNoticeModal('${notice.id}')" style="cursor: pointer;">
                <td data-label="Date">${formattedDate}</td>
                <td data-label="Service">
                    <span class="service-badge service-${serviceName.toLowerCase()}">
                        <i class="fas ${this.getServiceIcon(serviceName)}"></i>
                        ${serviceName}
                    </span>
                </td>
                <td data-label="Plan Type">
                    ${planType ? `<span class="plan-type-badge">${planType}</span>` : '<span class="plan-type-badge plan-type-none">N/A</span>'}
                </td>
                <td data-label="Type">
                    <span class="notice-type-badge notice-type-${typeClass}">
                        <i class="fas ${this.getNoticeIcon(typeClass)}"></i>
                        ${this.formatNoticeType(typeClass)}
                    </span>
                </td>
                <td data-label="Title">${this.truncateText(cleanTitle, 60)}</td>
                <td data-label="Status">
                    <span class="notice-status-badge status-${statusClass}">${this.formatStatus(statusClass)}</span>
                </td>
                <td data-label="Action">
                    <button class="view-details-btn" onclick="event.stopPropagation(); window.tracker.showNoticeModal('${notice.id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                </td>
            </tr>
        `;
    }

    getNoticeIcon(type) {
        switch (type) {
            case 'warning': return 'fa-exclamation-triangle';
            case 'error': return 'fa-times-circle';
            case 'info': return 'fa-info-circle';
            case 'success': return 'fa-check-circle';
            default: return 'fa-info-circle';
        }
    }

    getServiceIcon(service) {
        switch (service.toLowerCase()) {
            case 'intune': return 'fa-shield-alt';
            case 'entra': return 'fa-key';
            case 'defender': return 'fa-shield-virus';
            case 'teams': return 'fa-users';
            case 'exchange': return 'fa-envelope';
            case 'sharepoint': return 'fa-share-alt';
            case 'onedrive': return 'fa-cloud';
            case 'office': return 'fa-file-alt';
            default: return 'fa-cog';
        }
    }

    extractPlanTypeFromTitle(title) {
        // Extract plan type prefixes from title
        const planTypePrefixes = [
            'Plan for Change: ',
            'Plan for change: ',
            'Plan for Change - ',  // Added dash variant
            'Plan for change - ',  // Added dash variant
            'Important Notice: ',
            'Notice: ',
            'Announcement: ',
            'Breaking Change: '
        ];
        
        for (const prefix of planTypePrefixes) {
            if (title.startsWith(prefix)) {
                // Extract the plan type part, handling both colon and dash formats
                let planType;
                if (prefix.includes(':')) {
                    planType = prefix.replace(': ', '').trim();
                } else if (prefix.includes(' - ')) {
                    planType = prefix.replace(' - ', '').trim();
                } else {
                    planType = prefix.trim();
                }
                
                return {
                    planType: planType,
                    cleanTitle: title.substring(prefix.length).trim()
                };
            }
        }
        
        // If no prefix found, return original title with no plan type
        return {
            planType: null,
            cleanTitle: title
        };
    }

    formatNoticeType(type) {
        return type.charAt(0).toUpperCase() + type.slice(1);
    }

    formatStatus(status) {
        return status.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    showNoticeModal(noticeId) {
        const notice = this.notices.find(n => n.id == noticeId);
        if (!notice) return;

        const formattedDate = this.formatDate(notice.date);
        const typeClass = notice.type || 'info';
        const { planType, cleanTitle } = this.extractPlanTypeFromTitle(notice.title);
        
        // Extract structured metadata from content (for Entra notices)
        const structuredMetadata = this.extractStructuredMetadata(notice.content);
        
        const modalHtml = `
            <div class="modal-overlay" onclick="window.tracker.closeModal()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>
                            <i class="fas ${this.getNoticeIcon(typeClass)}"></i>
                            ${cleanTitle}
                        </h2>
                        <button class="modal-close" onclick="window.tracker.closeModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="notice-meta-info">
                            <div class="meta-item">
                                <strong>Date:</strong> ${formattedDate}
                            </div>
                            <div class="meta-item">
                                <strong>Service:</strong> 
                                <span class="service-badge service-${(notice.service || 'unknown').toLowerCase()}">
                                    <i class="fas ${this.getServiceIcon(notice.service || 'Unknown')}"></i>
                                    ${notice.service || 'Unknown'}
                                </span>
                            </div>
                            ${planType ? `
                                <div class="meta-item">
                                    <strong>Plan Type:</strong> 
                                    <span class="plan-type-badge">${planType}</span>
                                </div>
                            ` : ''}
                            <div class="meta-item">
                                <strong>Type:</strong> 
                                <span class="notice-type-badge notice-type-${typeClass}">
                                    <i class="fas ${this.getNoticeIcon(typeClass)}"></i>
                                    ${this.formatNoticeType(typeClass)}
                                </span>
                            </div>
                            ${notice.status ? `
                                <div class="meta-item">
                                    <strong>Status:</strong> 
                                    <span class="notice-status-badge status-${notice.status}">${this.formatStatus(notice.status)}</span>
                                </div>
                            ` : ''}
                            ${structuredMetadata.serviceCategory || notice.category ? `
                                <div class="meta-item">
                                    <strong>Service Category:</strong> ${structuredMetadata.serviceCategory || this.formatStatus(notice.category)}
                                </div>
                            ` : ''}
                            ${structuredMetadata.productCapability ? `
                                <div class="meta-item">
                                    <strong>Product Capability:</strong> ${structuredMetadata.productCapability}
                                </div>
                            ` : ''}
                            ${notice.lastUpdated ? `
                                <div class="meta-item">
                                    <strong>Last Updated:</strong> ${this.formatDate(notice.lastUpdated.split('T')[0])}
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="notice-content-full">
                            <h3>Notice Details</h3>
                            <div class="notice-content">${this.renderNoticeContent(notice.content)}</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        ${notice.link ? `
                            <a href="${notice.link}" target="_blank" class="learn-more-btn primary">
                                <i class="fas fa-external-link-alt"></i>
                                Learn More
                            </a>
                        ` : ''}
                        <button onclick="window.tracker.closeModal()" class="close-btn">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    renderNoticeContent(content) {
        // If content is already HTML markup, return it as-is
        if (content.includes('<') && content.includes('>')) {
            return content;
        }
        
        // Remove structured metadata lines from content before rendering
        let cleanContent = content;
        
        // Remove Type, Service category, and Product capability lines
        cleanContent = cleanContent.replace(/\*\*Type:\*\*\s*[^\n]*\n*/gi, '');
        cleanContent = cleanContent.replace(/\*\*Service category:\*\*\s*[^\n]*\n*/gi, '');
        cleanContent = cleanContent.replace(/\*\*Product capability:\*\*\s*[^\n]*\n*/gi, '');
        
        // Remove any extra leading/trailing whitespace or newlines
        cleanContent = cleanContent.trim();
        
        // Convert basic markdown-like formatting to HTML
        return cleanContent
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **bold** to <strong>
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // *italic* to <em>
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>') // [text](url) to links
            .replace(/\n/g, '<br>') // newlines to <br>
            .replace(/`(.*?)`/g, '<code>$1</code>'); // `code` to <code>
    }

    extractMonthFromWeek(weekOrDate) {
        if (!weekOrDate) return 'Unknown';
        
        // Try to extract date from week string like "Week of July 14, 2025"
        const weekMatch = weekOrDate.match(/Week of (.+?)(?:\s*\(|$)/);
        if (weekMatch) {
            const date = new Date(weekMatch[1]);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            }
        }
        
        // Fallback: try to parse as direct date
        const date = new Date(weekOrDate);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        }
        
        return 'Unknown';
    }

    downloadFile(filename) {
        const link = document.createElement('a');
        link.href = `./data/${filename}`;
        link.download = filename.split('/').pop(); // Get just the filename without path
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    loadMoreUpdates() {
        this.currentPage++;
        this.displayUpdates();
    }

    updateStats() {
        const totalUpdatesElement = document.getElementById('totalUpdates');
        const totalWeeksElement = document.getElementById('totalWeeks');
        const totalNoticesElement = document.getElementById('totalNotices');

        if (totalUpdatesElement) {
            totalUpdatesElement.textContent = this.updates.length;
        }
        
        if (totalWeeksElement) {
            // Use monthly groups if available, otherwise fall back to unique weeks
            if (this.indexData?.monthlyGroups) {
                totalWeeksElement.textContent = this.indexData.monthlyGroups.length;
                // Update the label to show "Total Months"
                const labelElement = totalWeeksElement.nextElementSibling;
                if (labelElement && labelElement.classList.contains('stat-label')) {
                    labelElement.textContent = 'Total Months';
                }
            } else {
                const uniqueWeeks = new Set(this.updates.map(update => update.week));
                totalWeeksElement.textContent = uniqueWeeks.size;
            }
        }
        
        if (totalNoticesElement) {
            totalNoticesElement.textContent = this.notices.length;
        }

        // Update the "This Week" stat to show "Total Months" or "Total Weeks"
        const thisWeekElement = document.getElementById('thisWeek');
        if (thisWeekElement) {
            if (this.indexData?.monthlyGroups) {
                thisWeekElement.textContent = this.indexData.monthlyGroups.length;
                // Update the label
                const labelElement = thisWeekElement.nextElementSibling;
                if (labelElement && labelElement.classList.contains('stat-label')) {
                    labelElement.textContent = 'Total Months';
                }
            } else {
                const uniqueWeeks = new Set(this.updates.map(update => update.week));
                thisWeekElement.textContent = uniqueWeeks.size;
            }
        }
    }

    updateDeploymentTime() {
        const deploymentDateElement = document.getElementById('deploymentDate');
        const deploymentTimeElement = document.getElementById('deploymentTime');
        
        if (deploymentDateElement && deploymentTimeElement) {
            // Use the lastGenerated time from the index data if available
            let deploymentDate;
            if (this.indexData && this.indexData.lastGenerated) {
                deploymentDate = new Date(this.indexData.lastGenerated);
            } else {
                // Fallback to current date if no lastGenerated available
                deploymentDate = new Date();
            }
            
            deploymentDateElement.textContent = deploymentDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            deploymentTimeElement.textContent = deploymentDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            });
        }
    }

    handleNavigation(link) {
        // Close mobile menu if open
        const navbar = document.querySelector('.navbar');
        if (navbar && navbar.classList.contains('active')) {
            navbar.classList.remove('active');
        }

        // Smooth scroll to section
        if (link.startsWith('#')) {
            const targetElement = document.querySelector(link);
            if (targetElement) {
                targetElement.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    }

    setLoading(isLoading) {
        const loadingElements = document.querySelectorAll('.loading');
        const contentElements = document.querySelectorAll('.content');
        
        loadingElements.forEach(el => {
            el.style.display = isLoading ? 'flex' : 'none';
        });
        
        contentElements.forEach(el => {
            el.style.display = isLoading ? 'none' : 'block';
        });
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'toast error';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => errorDiv.remove(), 5000);
    }

    closeModal() {
        const modals = document.querySelectorAll('.modal-overlay');
        modals.forEach(modal => modal.remove());
    }

    showUpdateModal(updateId) {
        const update = this.updates.find(u => u.id == updateId);
        if (!update) return;

        const formattedDate = this.formatDate(update.date);
        const categoryName = this.formatCategoryName(update.category);
        const type = update.subtitle || this.extractTypeFromTitle(update.title);
        const monthName = this.extractMonthFromWeek(update.week || update.date);
        
        const featuresHtml = update.features ? 
            update.features.map(feature => `<li>${feature}</li>`).join('') : '<li>No specific features listed</li>';

        const modalHtml = `
            <div class="modal-overlay" onclick="window.tracker.closeModal()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>${update.title}</h2>
                        <button class="modal-close" onclick="window.tracker.closeModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="update-meta-info">
                            <div class="meta-item">
                                <strong>Date:</strong> ${formattedDate}
                            </div>
                            <div class="meta-item">
                                <strong>Month:</strong> ${monthName}
                            </div>
                            <div class="meta-item">
                                <strong>Service:</strong> 
                                <span class="service-badge service-${(update.service || 'unknown').toLowerCase()}">${update.service || 'Unknown'}</span>
                            </div>
                            <div class="meta-item">
                                <strong>Service Category:</strong> 
                                <span class="category-badge category-${update.category}">${categoryName}</span>
                            </div>
                            <div class="meta-item">
                                <strong>Type:</strong> ${type}
                            </div>
                            ${update.productCapability && update.service === 'Entra' ? `
                                <div class="meta-item">
                                    <strong>Product Capability:</strong> ${update.productCapability}
                                </div>
                            ` : ''}
                            ${update.serviceRelease ? `
                                <div class="meta-item">
                                    <strong>Service Release:</strong> ${update.serviceRelease}
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="update-content-full">
                            <h3>Description</h3>
                            <p>${update.content}</p>
                        </div>
                        
                        ${update.features ? `
                            <div class="update-features-full">
                                <h3>Key Features</h3>
                                <ul>${featuresHtml}</ul>
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <a href="${update.link}" target="_blank" class="learn-more-btn primary">
                            <i class="fas fa-external-link-alt"></i>
                            Learn More on Microsoft Learn
                        </a>
                        <button onclick="window.tracker.closeModal()" class="close-btn">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    formatDate(dateString) {
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return dateString;
        }
    }

    formatCategoryName(category) {
        return category.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    extractTypeFromTitle(title) {
        // Extract type from title for Entra updates
        if (title.includes('General Availability')) {
            return 'General Availability';
        } else if (title.includes('Public Preview')) {
            return 'Public Preview';
        } else if (title.includes('Deprecated')) {
            return 'Deprecated';
        } else if (title.includes('Plan for change')) {
            return 'Plan for change';
        } else if (title.includes('Changed feature')) {
            return 'Changed feature';
        } else if (title.includes('New feature')) {
            return 'New feature';
        } else {
            return 'Update';
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    extractStructuredMetadata(content) {
        const metadata = {};
        
        if (!content) return metadata;
        
        // Extract service category
        const serviceCategoryMatch = content.match(/\*\*Service category:\*\*\s*(.+?)(?:\n|$)/i);
        if (serviceCategoryMatch) {
            metadata.serviceCategory = serviceCategoryMatch[1].trim();
        }
        
        // Extract product capability
        const productCapabilityMatch = content.match(/\*\*Product capability:\*\*\s*(.+?)(?:\n|$)/i);
        if (productCapabilityMatch) {
            metadata.productCapability = productCapabilityMatch[1].trim();
        }
        
        return metadata;
    }
}

// Initialize the tracker when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.tracker = new IntuneUpdatesTracker();
});

// Handle mobile menu toggle
document.addEventListener('DOMContentLoaded', () => {
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navbar = document.querySelector('.navbar');
    
    if (mobileMenuBtn && navbar) {
        mobileMenuBtn.addEventListener('click', () => {
            navbar.classList.toggle('active');
        });
    }
});
