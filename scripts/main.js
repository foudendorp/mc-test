class CloudUpdatesTracker {
    constructor() {
        this.updates = [];
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
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    async init() {
        this.setLoading(true);
        try {
            const data = await this.fetchUpdates();
            this.updates = data.updates;
            this.indexData = data.indexData;
            
            console.log('Init: indexData loaded:', this.indexData);
            
            this.populateServiceFilter();
            this.populateCategoryFilter();
            this.updateStats();
            this.filterUpdates();
            this.updateDeploymentTime();
            
            // Report any dynamically detected categories
            this.reportDetectedCategories();
        } catch (error) {
            console.error('Error initializing tracker:', error);
            this.showError('Failed to load updates. Please try again later.');
        } finally {
            this.setLoading(false);
        }
    }

    async fetchUpdates() {
        try {
            // Load main index to get list of data files
            const indexResponse = await fetch('./data/index.json');
            if (!indexResponse.ok) {
                throw new Error(`HTTP ${indexResponse.status}: ${indexResponse.statusText}`);
            }
            
            const indexData = await indexResponse.json();
            console.log('Index data loaded:', indexData);
            
            let updates = [];
            
            for (const fileInfo of indexData.dataFiles) {
                try {
                    console.log(`Loading file: ${fileInfo.path}`);
                    const fileResponse = await fetch(`./data/${fileInfo.path}`);
                    
                    if (!fileResponse.ok) {
                        console.warn(`Failed to load ${fileInfo.path}: HTTP ${fileResponse.status}`);
                        continue;
                    }
                    
                    const fileData = await fileResponse.json();
                    
                    // Process each topic and update within the file
                    if (fileData.topics) {
                        fileData.topics.forEach((topic, topicIndex) => {
                            if (topic.updates) {
                                topic.updates.forEach((update, updateIndex) => {
                                    // Regular update processing
                                    const uniqueId = `${fileInfo.path}_${topicIndex}_${updateIndex}`;
                                    updates.push({
                                        ...update,
                                        id: uniqueId,
                                        week: fileData.week || fileData.month || `Week of ${fileData.date}`,
                                        date: fileData.date,
                                        topic: topic.topic,
                                        category: topic.category || update.category || 'General',
                                        serviceRelease: fileData.serviceRelease
                                    });
                                });
                            }
                        });
                    } else {
                        console.warn('No topics found in file:', fileInfo.path);
                    }
                } catch (fileError) {
                    console.error(`Error loading file ${fileInfo.path}:`, fileError);
                    console.error('File info:', fileInfo);
                }
            }
            
            return {
                updates: updates.sort((a, b) => new Date(b.date) - new Date(a.date)),
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
            <i class="fas fa-exclamation-triangle"></i>
            <strong>Unable to load data</strong> - Using fallback data. 
            The system may be updating or experiencing temporary issues.
        `;
        
        // Insert warning at the top of the updates container
        if (this.updatesContainer) {
            this.updatesContainer.insertBefore(warningDiv, this.updatesContainer.firstChild);
        }
        
        return {
            updates: [],
            indexData: {
                totalUpdates: 0,
                totalFiles: 0,
                services: ['Entra ID', 'Defender XDR'],
                dataFiles: [],
                lastGenerated: new Date().toISOString()
            }
        };
    }

    populateServiceFilter() {
        if (!this.serviceFilter) return;
        
        // Get unique services from updates and map to display names
        const serviceDisplayNames = new Set();
        this.updates.forEach(update => {
            const displayName = this.getServiceDisplayName(update.service);
            serviceDisplayNames.add(displayName);
        });
        
        const sortedServices = Array.from(serviceDisplayNames).sort();
        
        // Clear existing options except "All Services"
        while (this.serviceFilter.children.length > 1) {
            this.serviceFilter.removeChild(this.serviceFilter.lastChild);
        }
        
        // Add service options with clean display names
        sortedServices.forEach(displayName => {
            const option = document.createElement('option');
            option.value = displayName;
            option.textContent = displayName;
            this.serviceFilter.appendChild(option);
        });
    }

    populateCategoryFilter() {
        if (!this.categoryFilter) return;
        
        // Get unique categories from updates, including mapped categories
        const categories = new Set();
        
        this.updates.forEach(update => {
            // Use service-specific category if available
            const serviceSpecificCategory = this.getServiceSpecificCategory(update);
            if (serviceSpecificCategory) {
                categories.add(serviceSpecificCategory);
            } else {
                // Fall back to the update's category
                const category = update.category || 'General';
                categories.add(category);
            }
        });
        
        const sortedCategories = Array.from(categories).sort();
        
        // Clear existing options except "All Categories"
        while (this.categoryFilter.children.length > 1) {
            this.categoryFilter.removeChild(this.categoryFilter.lastChild);
        }
        
        // Add category options
        sortedCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = this.formatCategoryName(category);
            this.categoryFilter.appendChild(option);
        });
    }

    filterUpdates() {
        const searchTerm = this.searchInput ? this.searchInput.value.toLowerCase() : '';
        const selectedService = this.serviceFilter ? this.serviceFilter.value : 'all';
        const selectedCategory = this.categoryFilter ? this.categoryFilter.value : 'all';
        const selectedTimeFilter = this.timeFilter ? this.timeFilter.value : 'all';
        
        this.filteredUpdates = this.updates.filter(update => {
            // Search filter
            const matchesSearch = !searchTerm || 
                update.title.toLowerCase().includes(searchTerm) ||
                update.content.toLowerCase().includes(searchTerm) ||
                (update.topic && update.topic.toLowerCase().includes(searchTerm)) ||
                (update.service && update.service.toLowerCase().includes(searchTerm));
            
            // Service filter
            const matchesService = selectedService === 'all' || 
                this.getServiceDisplayName(update.service) === selectedService ||
                update.service === selectedService;
            
            // Category filter
            let matchesCategory = true;
            if (selectedCategory !== 'all') {
                const serviceSpecificCategory = this.getServiceSpecificCategory(update);
                const updateCategory = serviceSpecificCategory || update.category || 'General';
                matchesCategory = updateCategory === selectedCategory;
            }
            
            // Time filter
            const matchesTime = this.checkTimeFilter(update.date, selectedTimeFilter);
            
            return matchesSearch && matchesService && matchesCategory && matchesTime;
        });
        
        // Reset pagination
        this.currentPage = 1;
        this.displayUpdates();
    }

    checkTimeFilter(dateString, filter) {
        if (filter === 'all') return true;
        
        const updateDate = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - updateDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        switch (filter) {
            case '7days': return diffDays <= 7;
            case '30days': return diffDays <= 30;
            case '90days': return diffDays <= 90;
            default: return true;
        }
    }

    displayUpdates() {
        if (!this.updatesContainer) return;
        
        if (this.filteredUpdates.length === 0) {
            this.updatesContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <h3>No updates found</h3>
                    <p>Try adjusting your search criteria or filters.</p>
                </div>
            `;
            if (this.loadMoreBtn) this.loadMoreBtn.style.display = 'none';
            return;
        }
        
        // Calculate updates to display
        const startIndex = 0;
        const endIndex = this.currentPage * this.updatesPerPage;
        this.displayedUpdates = this.filteredUpdates.slice(startIndex, endIndex);
        
        // Display all updates in unified table format (no more grouped displays)
        let updatesHtml = `
            <div class="updates-table-container">
                <table class="updates-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Service</th>
                            <th>Title</th>
                            <th>Type</th>
                            <th>Category</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.displayedUpdates.map(update => this.createUpdateRow(update)).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        this.updatesContainer.innerHTML = updatesHtml;
        
        // Show/hide load more button
        if (this.loadMoreBtn) {
            if (endIndex >= this.filteredUpdates.length) {
                this.loadMoreBtn.style.display = 'none';
            } else {
                this.loadMoreBtn.style.display = 'block';
            }
        }
    }

    createUpdateRow(update) {
        const formattedDate = this.formatDate(update.date);
        const categoryClassName = this.getCategoryClassName(update);
        const serviceSpecificCategory = this.getServiceSpecificCategory(update);
        const displayCategory = serviceSpecificCategory || update.category || 'General';
        const formattedCategory = this.formatCategoryName(displayCategory);
        
        // Get and format the update type - prioritize data field over title extraction
        // Check subtitle field first (used by Entra), then type field, then extract from title
        let updateType = update.subtitle || update.type || this.extractTypeFromTitle(update.title) || 'update';
        
        // Clean up subtitle if it contains type information
        if (update.subtitle && this.isTypeIndicator(update.subtitle)) {
            updateType = update.subtitle;
        }
        
        // Remove "Type: " prefix if present (common in Defender services)
        if (typeof updateType === 'string' && updateType.toLowerCase().startsWith('type: ')) {
            updateType = updateType.substring(6); // Remove "Type: " (6 characters)
        }
        
        const formattedType = this.cleanTypeText(updateType);
        
        // Ensure category styles are available
        this.ensureCategoryStyle(categoryClassName, formattedCategory);
        
        return `
            <tr class="update-row" onclick="window.tracker.showUpdateModal('${update.id}')" style="cursor: pointer;">
                <td data-label="Date">${formattedDate}</td>
                <td data-label="Service">
                    <span class="service-badge service-${this.getServiceCssClass(update.service)}">
                        <i class="fas ${this.getServiceIcon(update.service)}"></i>
                        ${this.getServiceDisplayName(update.service)}
                    </span>
                </td>
                <td data-label="Title">${this.truncateText(update.title, 80)}</td>
                <td data-label="Type">
                    <span class="type-badge type-${updateType}">
                        ${formattedType}
                    </span>
                </td>
                <td data-label="Category">
                    <span class="category-badge ${categoryClassName}">
                        ${formattedCategory}
                    </span>
                </td>
                <td data-label="Action">
                    <button class="view-details-btn" onclick="event.stopPropagation(); window.tracker.showUpdateModal('${update.id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                </td>
            </tr>
        `;
    }

    getServiceIcon(service) {
        switch (service.toLowerCase()) {
            case 'intune': return 'fa-mobile-alt';
            case 'microsoft intune': return 'fa-mobile-alt';
            case 'entra': return 'fa-key';
            case 'entra id': return 'fa-key';
            case 'microsoft entra id': return 'fa-key';
            case 'defender': return 'fa-shield-virus';
            case 'defender xdr': return 'fa-shield-virus';
            case 'microsoft defender xdr': return 'fa-shield-virus';
            case 'defender for office 365': return 'fa-shield-virus';
            case 'microsoft defender for office 365': return 'fa-shield-virus';
            case 'defender for endpoint': return 'fa-shield-virus';
            case 'microsoft defender for endpoint': return 'fa-shield-virus';
            case 'defender for identity': return 'fa-user-shield';
            case 'microsoft defender for identity': return 'fa-user-shield';
            case 'defender for cloud apps': return 'fa-shield-alt';
            case 'microsoft defender for cloud apps': return 'fa-shield-alt';
            case 'windows 365': return 'fa-desktop';
            case 'teams': return 'fa-users';
            case 'exchange': return 'fa-envelope';
            case 'sharepoint': return 'fa-share-alt';
            case 'onedrive': return 'fa-cloud';
            case 'office': return 'fa-file-alt';
            default: return 'fa-cog';
        }
    }

    getServiceCssClass(service) {
        if (!service) return 'unknown';
        
        switch (service.toLowerCase()) {
            case 'intune': return 'intune';
            case 'microsoft intune': return 'intune';
            case 'entra': return 'entra-id';
            case 'entra id': return 'entra-id';
            case 'microsoft entra id': return 'entra-id';
            case 'defender': return 'defender';
            case 'defender xdr': return 'defender-xdr';
            case 'microsoft defender xdr': return 'defender-xdr';
            case 'defender for office 365': return 'defender-office';
            case 'microsoft defender for office 365': return 'defender-office';
            case 'defender for endpoint': return 'defender-endpoint';
            case 'microsoft defender for endpoint': return 'defender-endpoint';
            case 'defender for identity': return 'defender-identity';
            case 'microsoft defender for identity': return 'defender-identity';
            case 'defender for cloud apps': return 'defender-cloudapps';
            case 'microsoft defender for cloud apps': return 'defender-cloudapps';
            case 'windows 365': return 'windows-365';
            case 'microsoft teams': return 'teams';
            case 'teams': return 'teams';
            case 'exchange': return 'exchange';
            case 'sharepoint': return 'sharepoint';
            case 'onedrive': return 'onedrive';
            case 'office': return 'office';
            default: return 'unknown';
        }
    }

    getServiceDisplayName(service) {
        if (!service) return 'Unknown';
        
        let displayName;
        switch (service.toLowerCase()) {
            case 'intune': displayName = 'Microsoft Intune'; break;
            case 'microsoft intune': displayName = 'Microsoft Intune'; break;
            case 'entra': displayName = 'Microsoft Entra ID'; break;
            case 'entra id': displayName = 'Microsoft Entra ID'; break;
            case 'microsoft entra id': displayName = 'Microsoft Entra ID'; break;
            case 'defender': displayName = 'Microsoft Defender XDR'; break;
            case 'defender xdr': displayName = 'Microsoft Defender XDR'; break;
            case 'microsoft defender xdr': displayName = 'Microsoft Defender XDR'; break;
            case 'defender for office 365': displayName = 'Microsoft Defender for Office 365'; break;
            case 'microsoft defender for office 365': displayName = 'Microsoft Defender for Office 365'; break;
            case 'defender for endpoint': displayName = 'Microsoft Defender for Endpoint'; break;
            case 'microsoft defender for endpoint': displayName = 'Microsoft Defender for Endpoint'; break;
            case 'defender for identity': displayName = 'Microsoft Defender for Identity'; break;
            case 'microsoft defender for identity': displayName = 'Microsoft Defender for Identity'; break;
            case 'defender for cloud apps': displayName = 'Microsoft Defender for Cloud Apps'; break;
            case 'microsoft defender for cloud apps': displayName = 'Microsoft Defender for Cloud Apps'; break;
            case 'windows 365': displayName = 'Windows 365'; break;
            default: displayName = service; break;
        }
        
        // Remove "Microsoft" prefix for table display
        return displayName.replace(/^Microsoft\s+/, '');
    }

    loadMoreUpdates() {
        if (this.currentPage * this.updatesPerPage >= this.filteredUpdates.length) {
            return; // No more updates to load
        }
        
        this.currentPage++;
        this.displayUpdates();
    }

    updateStats() {
        const totalUpdatesElement = document.getElementById('totalUpdates');
        const totalWeeksElement = document.getElementById('totalWeeks');

        if (totalUpdatesElement) {
            totalUpdatesElement.textContent = this.updates.length;
        }
        
        if (totalWeeksElement) {
            // Use monthly groups if available, otherwise fall back to unique weeks
            const uniqueWeeks = new Set(this.updates.map(update => update.week));
            totalWeeksElement.textContent = uniqueWeeks.size;
        }

        // Update the "This Week" stat to show unique weeks
        const thisWeekElement = document.getElementById('thisWeek');
        if (thisWeekElement) {
            const uniqueWeeks = new Set(this.updates.map(update => update.week));
            thisWeekElement.textContent = uniqueWeeks.size;
        }
    }

    updateDeploymentTime() {
        const deploymentDateElement = document.getElementById('deploymentDate');
        const deploymentTimeElement = document.getElementById('deploymentTime');
        
        if (this.indexData && this.indexData.lastGenerated) {
            const deploymentDate = new Date(this.indexData.lastGenerated);
            
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
        const targetSection = document.querySelector(link);
        if (targetSection) {
            targetSection.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    setLoading(isLoading) {
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) {
            loadingSpinner.style.display = isLoading ? 'flex' : 'none';
        }
        
        if (this.updatesContainer && isLoading) {
            this.updatesContainer.innerHTML = '';
        }
    }

    showError(message) {
        const errorModal = document.getElementById('errorModal');
        const errorMessage = document.getElementById('errorMessage');
        
        if (errorModal && errorMessage) {
            errorMessage.textContent = message;
            errorModal.style.display = 'block';
        }
    }

    closeModal() {
        // Remove any existing modals
        const modals = document.querySelectorAll('.modal-overlay');
        modals.forEach(modal => modal.remove());
        
        const errorModal = document.getElementById('errorModal');
        if (errorModal) {
            errorModal.style.display = 'none';
        }
    }

    showUpdateModal(updateId) {
        console.log('showUpdateModal called with ID:', updateId);
        console.log('Available updates:', this.updates.length);
        console.log('First few update IDs:', this.updates.slice(0, 5).map(u => ({ id: u.id, service: u.service, title: u.title })));
        
        // More robust ID matching - try both string and number comparison
        const update = this.updates.find(u => u.id == updateId || u.id === updateId || String(u.id) === String(updateId));
        if (!update) {
            console.error('Update not found for ID:', updateId);
            console.error('Available IDs:', this.updates.slice(0, 10).map(u => u.id));
            
            // Show an error modal instead of failing silently
            this.showErrorModal(`Update not found (ID: ${updateId})`);
            return;
        }

        console.log('Found update:', update.title, '- Service:', update.service);

        try {
            const formattedDate = this.formatDate(update.date);
            const serviceSpecificCategory = this.getServiceSpecificCategory(update);
            const displayCategory = serviceSpecificCategory || update.category || 'General';
            const formattedCategory = this.formatCategoryName(displayCategory);
            
            // Get and format the update type (same logic as createUpdateRow)
            let updateType = update.subtitle || update.type || this.extractTypeFromTitle(update.title) || 'update';
            
            // Clean up subtitle if it contains type information
            if (update.subtitle && this.isTypeIndicator && this.isTypeIndicator(update.subtitle)) {
                updateType = update.subtitle;
            }
            
            // Remove "Type: " prefix if present (common in Defender services)
            if (typeof updateType === 'string' && updateType.toLowerCase().startsWith('type: ')) {
                updateType = updateType.substring(6); // Remove "Type: " (6 characters)
            }
            
            const formattedType = this.cleanTypeText ? this.cleanTypeText(updateType) : updateType;
        
            // Check if this is an extracted feature and we need to show the full original content
            let displayContent = update.content;
            let isExtractedFeature = false;
            
            if (update.originalUpdateId) {
                // This is an extracted feature - find the original update for full context
                const originalUpdate = this.updates.find(u => u.id === update.originalUpdateId);
                if (originalUpdate) {
                    displayContent = originalUpdate.content;
                    isExtractedFeature = true;
                }
            }
            
            // Fix any relative URLs in the content to point to Microsoft Learn
            displayContent = this.fixRelativeUrls(displayContent);
            
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
                                    <strong>Service</strong>
                                    <span class="service-badge service-${this.getServiceCssClass(update.service)}">
                                        <i class="fas ${this.getServiceIcon(update.service)}"></i>
                                        ${this.getServiceDisplayName(update.service)}
                                    </span>
                                </div>
                                <div class="meta-item">
                                    <strong>Date</strong>
                                    <span>${formattedDate}</span>
                                </div>
                                <div class="meta-item">
                                    <strong>Type</strong>
                                    <span class="type-badge type-${updateType}">
                                        ${formattedType}
                                    </span>
                                </div>
                                <div class="meta-item">
                                    <strong>Category</strong>
                                    <span class="category-badge ${this.getCategoryClassName(update)}">
                                        ${formattedCategory}
                                    </span>
                                </div>
                                ${update.topic ? `
                                    <div class="meta-item">
                                        <strong>Topic</strong>
                                        <span>${update.topic}</span>
                                    </div>
                                ` : ''}
                                ${update.serviceRelease ? `
                                    <div class="meta-item">
                                        <strong>Service Release</strong>
                                        <span class="service-release-badge">${update.serviceRelease}</span>
                                    </div>
                                ` : ''}
                            </div>
                            
                            ${update.subtitle ? `<div class="update-subtitle"><strong>Summary:</strong> ${update.subtitle}</div>` : ''}
                            
                            ${isExtractedFeature ? `
                                <div class="feature-notice">
                                    <i class="fas fa-info-circle"></i>
                                    <strong>Feature Highlight:</strong> This is a specific feature from the ${update.topic} topic. The full topic content is shown below.
                                </div>
                            ` : ''}
                            
                            <div class="update-content-full">
                                <h3>Details</h3>
                                <div>${displayContent}</div>
                            </div>
                            
                            ${update.features && update.features.length > 0 ? `
                                <div class="update-features-full">
                                    <h3>Key Features</h3>
                                    <ul>
                                        ${update.features.map(feature => `<li>${feature}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                            
                        </div>
                        <div class="modal-footer">
                            ${update.link ? `
                                <a href="${update.link}" target="_blank" class="learn-more-btn primary">
                                    <i class="fas fa-external-link-alt"></i>
                                    Learn More on Microsoft Learn
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
            
        } catch (error) {
            console.error('Error showing modal for update:', update.title, error);
            this.showErrorModal(`Error displaying update details: ${error.message}`);
        }
    }
    
    showErrorModal(message) {
        const errorModalHtml = `
            <div class="modal-overlay" onclick="window.tracker.closeModal()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>Error</h2>
                        <button class="modal-close" onclick="window.tracker.closeModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="error-message">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>${message}</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button onclick="window.tracker.closeModal()" class="close-btn">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', errorModalHtml);
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    formatCategoryName(category) {
        return category
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    getServiceSpecificCategory(update) {
        // Service-specific category mapping
        const serviceLower = (update.service || '').toLowerCase();
        
        if (update.service === 'Intune' || serviceLower.includes('intune')) {
            // Map specific Intune categories
            if (update.category === 'app-management') return 'App Management';
            if (update.category === 'device-management') return 'Device Management';
            if (update.category === 'device-configuration') return 'Device Configuration';
            if (update.category === 'device-security') return 'Device Security';
            if (update.category === 'monitor-troubleshoot') return 'Monitor and Troubleshoot';
            if (update.category === 'tenant-administration') return 'Tenant Administration';
            if (update.category === 'role-based-access-control') return 'Role-based Access Control';
            if (update.category === 'device-enrollment') return 'Device Enrollment';
            if (update.category === 'device-compliance') return 'Device Compliance';
        }
        
        if (update.service === 'Windows 365') {
            // Map specific Windows 365 categories
            if (update.category === 'provisioning') return 'Provisioning';
            if (update.category === 'device-management') return 'Device Management';
            if (update.category === 'integration') return 'Integration';
            if (update.category === 'app-management') return 'App Management';
            if (update.category === 'device-configuration') return 'Configuration';
            if (update.category === 'device-security') return 'Security';
            if (update.category === 'monitor-troubleshoot') return 'Monitoring';
        }
        
        // Defender for Identity specific categories
        if (serviceLower.includes('defender for identity')) {
            if (update.category === 'identity-management') return 'Identity Protection';
            if (update.category === 'security') return 'Identity Security';
            if (update.category === 'monitoring') return 'Identity Monitoring';
            if (update.category === 'alert-management') return 'Identity Alerts';
            // Default for Defender for Identity
            return 'Identity Protection';
        }
        
        // Defender for Cloud Apps specific categories  
        if (serviceLower.includes('defender for cloud apps')) {
            if (update.category === 'identity-management') return 'Cloud App Security';
            if (update.category === 'security') return 'Cloud Security';
            if (update.category === 'monitoring') return 'Cloud Monitoring';
            if (update.category === 'app-management') return 'Cloud App Management';
            // Default for Defender for Cloud Apps
            return 'Cloud App Security';
        }
        
        return null; // Return null to use default category
    }

    getCategoryClassName(update) {
        const serviceSpecificCategory = this.getServiceSpecificCategory(update);
        const category = serviceSpecificCategory || update.category || 'General';
        return 'category-' + category.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }

    ensureCategoryStyle(className, displayName) {
        // Check if style already exists
        if (document.querySelector(`style[data-category="${className}"]`)) {
            return;
        }
        
        // Generate colors for this category
        const colors = this.generateCategoryColors(displayName);
        
        // Create and inject CSS
        const style = document.createElement('style');
        style.setAttribute('data-category', className);
        style.textContent = `
            .${className} {
                background-color: ${colors.background};
                color: ${colors.text};
                border: 1px solid ${colors.border};
            }
            
            .${className}:hover {
                background-color: ${colors.hover};
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
        `;
        document.head.appendChild(style);
    }

    generateCategoryColors(categoryName) {
        // Generate a hash from the category name for consistent colors
        const hash = this.hashString(categoryName);
        
        // Use the hash to generate HSL values
        const hue = Math.abs(hash) % 360;
        const saturation = 45 + (Math.abs(hash) % 30); // 45-75%
        const lightness = 85 + (Math.abs(hash) % 10);  // 85-95%
        
        // Generate color variations
        const background = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        const border = `hsl(${hue}, ${saturation + 10}%, ${lightness - 15}%)`;
        const text = `hsl(${hue}, ${saturation + 20}%, ${Math.max(25, lightness - 60)}%)`;
        const hover = `hsl(${hue}, ${saturation + 5}%, ${lightness - 5}%)`;
        
        return {
            background,
            border,
            text,
            hover
        };
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }

    reportDetectedCategories() {
        if (this.updates.length === 0) return;
        
        const categoryCounts = {};
        this.updates.forEach(update => {
            const serviceSpecificCategory = this.getServiceSpecificCategory(update);
            const category = serviceSpecificCategory || update.category || 'General';
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        });
        
        console.log('Detected categories and their counts:');
        Object.entries(categoryCounts)
            .sort(([,a], [,b]) => b - a)
            .forEach(([category, count]) => {
                console.log(`- ${category}: ${count} updates`);
            });
    }

    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    extractTypeFromTitle(title) {
        if (!title) return 'update';
        
        // Common type indicators that might appear in titles or content
        const lowerTitle = title.toLowerCase();
        
        // Check for type indicators in titles
        const typeIndicators = [
            { keywords: ['plan for change'], type: 'plan-for-change' },
            { keywords: ['breaking change'], type: 'breaking-change' },
            { keywords: ['general availability', 'generally available'], type: 'general-availability' },
            { keywords: ['public preview'], type: 'public-preview' },
            { keywords: ['private preview'], type: 'private-preview' },
            { keywords: ['deprecated', 'deprecation'], type: 'deprecated' },
            { keywords: ['important notice', 'important'], type: 'important' },
            { keywords: ['notice'], type: 'notice' },
            { keywords: ['monthly updates', 'monthly summary'], type: 'monthly-updates' },
            { keywords: ['announcement'], type: 'announcement' }
        ];
        
        for (const indicator of typeIndicators) {
            if (indicator.keywords.some(keyword => lowerTitle.includes(keyword))) {
                return indicator.type;
            }
        }
        
        // Check if this looks like a topic/category header (generic titles)
        const topicHeaders = [
            'app management', 'device management', 'device configuration', 'device security',
            'monitor and troubleshoot', 'identity management', 'conditional access',
            'monthly updates', 'july 2025 updates', 'june 2025 updates'
        ];
        
        if (topicHeaders.some(header => lowerTitle === header || lowerTitle.includes(header))) {
            return 'monthly-updates'; // These are likely monthly summary items
        }
        
        return 'update'; // default type
    }

    isTypeIndicator(text) {
        if (!text) return false;
        
        const lowerText = text.toLowerCase();
        const typeIndicators = [
            'general availability', 'public preview', 'private preview',
            'deprecated', 'plan for change', 'breaking change', 
            'important', 'notice', 'announcement', 'new feature',
            'changed feature', 'monthly summary', 'monthly updates'
        ];
        
        return typeIndicators.some(indicator => lowerText.includes(indicator));
    }

    cleanTypeText(type) {
        if (!type) return 'Update';
        
        // Map specific types to proper display names
        const typeMap = {
            'update': 'Update',
            'plan-for-change': 'Plan for Change',
            'breaking-change': 'Breaking Change',
            'general-availability': 'General Availability',
            'general availability': 'General Availability',
            'public-preview': 'Public Preview',
            'public preview': 'Public Preview',
            'private-preview': 'Private Preview',
            'private preview': 'Private Preview',
            'deprecated': 'Deprecated',
            'important': 'Important',
            'notice': 'Notice',
            'monthly-updates': 'Monthly Summary',
            'monthly summary': 'Monthly Summary',
            'announcement': 'Announcement',
            'new feature': 'New Feature',
            'changed feature': 'Changed Feature'
        };
        
        // Return mapped value or format the type
        return typeMap[type.toLowerCase()] || type.charAt(0).toUpperCase() + type.slice(1).replace(/[-_]/g, ' ');
    }

    fixRelativeUrls(htmlContent) {
        if (!htmlContent) return htmlContent;
        
        // Fix relative URLs that should point to Microsoft Learn and ensure they open in new tabs
        return htmlContent
            // Fix URLs that start with a forward slash (absolute paths on wrong domain)
            .replace(/href="\/([^"]*?)"/g, 'href="https://learn.microsoft.com/$1" target="_blank"')
            // Fix any localhost URLs that got generated incorrectly
            .replace(/href="https?:\/\/(?:127\.0\.0\.1|localhost):[0-9]+\/([^"]*?)"/g, 'href="https://learn.microsoft.com/$1" target="_blank"')
            // Fix URLs that are missing the protocol and domain entirely (but not already processed)
            .replace(/href="([^h][^t][^t][^p][^s]?[^:][^\/][^\/][^"]*?)"/g, 'href="https://learn.microsoft.com/en-us/$1" target="_blank"')
            // Add target="_blank" to any existing links that don't already have it
            .replace(/<a([^>]*?)href="([^"]*?)"(?![^>]*target=)/g, '<a$1href="$2" target="_blank"');
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
}

// Initialize the tracker when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.tracker = new CloudUpdatesTracker();
});
