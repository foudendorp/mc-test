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
            
            this.updateStats();
            this.filterUpdates();
            this.displayNotices();
            this.displayDataFiles();
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
                                        week: fileData.week,
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
            
            // Load notices
            let notices = [];
            try {
                const noticesResponse = await fetch('./data/notices/notices.json');
                if (noticesResponse.ok) {
                    const noticesData = await noticesResponse.json();
                    notices = noticesData.notices || [];
                } else {
                    console.warn('Notices file not found');
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
            <strong>⚠️ Data Loading Issue:</strong> Unable to load JSON data files. 
            Displaying sample data. Please check the browser console for details.
        `;
        
        const container = document.querySelector('.container');
        if (container) {
            container.insertBefore(warningDiv, container.firstChild);
        }
        
        return {
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
                    link: "https://learn.microsoft.com/en-us/mem/intune/fundamentals/whats-new",
                    category: "device-management",
                    topic: "Device management",
                    date: "2025-07-14",
                    week: "Week of July 14, 2025"
                }
            ],
            notices: [
                {
                    id: 1,
                    title: "Data Loading Notice",
                    content: "The system is loading data from JSON files. If this message persists, there may be an issue with data generation.",
                    date: "2025-07-15",
                    type: "info"
                }
            ],
            indexData: {
                dataFiles: [],
                totalUpdates: 1
            }
        };
    }

    filterUpdates() {
        const searchTerm = this.searchInput?.value.toLowerCase() || '';
        const categoryFilter = this.categoryFilter?.value || '';
        const timeFilter = this.timeFilter?.value || '';

        this.filteredUpdates = this.updates.filter(update => {
            // Search filter
            const matchesSearch = !searchTerm || 
                update.title.toLowerCase().includes(searchTerm) ||
                update.subtitle?.toLowerCase().includes(searchTerm) ||
                update.content.toLowerCase().includes(searchTerm) ||
                update.topic.toLowerCase().includes(searchTerm) ||
                (update.features && update.features.some(feature => 
                    feature.toLowerCase().includes(searchTerm)));

            // Category filter
            const matchesCategory = !categoryFilter || categoryFilter === 'all' || update.category === categoryFilter;

            // Time filter
            const matchesTime = this.checkTimeFilter(update.date, timeFilter);

            return matchesSearch && matchesCategory && matchesTime;
        });

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
            this.updatesContainer.innerHTML = `
                <div class="updates-table-container">
                    <table class="updates-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Week</th>
                                <th>Category</th>
                                <th>Title</th>
                                <th>Topic</th>
                                <th>Features</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.displayedUpdates.map(update => this.createUpdateRow(update)).join('')}
                        </tbody>
                    </table>
                </div>
            `;
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
        
        return `
            <tr class="update-row" onclick="window.tracker.showUpdateModal('${update.id}')" style="cursor: pointer;">
                <td data-label="Date">${formattedDate}</td>
                <td data-label="Week">${this.truncateText(update.week, 30)}</td>
                <td data-label="Category">
                    <span class="category-badge category-${update.category}">${categoryName}</span>
                </td>
                <td data-label="Title">${this.truncateText(update.title, 50)}</td>
                <td data-label="Topic">${this.truncateText(update.topic, 25)}</td>
                <td data-label="Features">${featuresCount > 0 ? `${featuresCount} features` : 'N/A'}</td>
                <td data-label="Action">
                    <button class="view-details-btn" onclick="event.stopPropagation(); window.tracker.showUpdateModal('${update.id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                </td>
            </tr>
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

        const noticesHtml = `
            <div class="notices-table-container">
                <table class="notices-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Title</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.notices.map(notice => this.createNoticeRow(notice)).join('')}
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
        
        return `
            <tr class="notice-row" onclick="window.tracker.showNoticeModal('${notice.id}')" style="cursor: pointer;">
                <td data-label="Date">${formattedDate}</td>
                <td data-label="Type">
                    <span class="notice-type-badge notice-type-${typeClass}">
                        <i class="fas ${this.getNoticeIcon(typeClass)}"></i>
                        ${this.formatNoticeType(typeClass)}
                    </span>
                </td>
                <td data-label="Title">${this.truncateText(notice.title, 60)}</td>
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
        
        const modalHtml = `
            <div class="modal-overlay" onclick="window.tracker.closeModal()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>
                            <i class="fas ${this.getNoticeIcon(typeClass)}"></i>
                            ${notice.title}
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
                            ${notice.category ? `
                                <div class="meta-item">
                                    <strong>Category:</strong> ${this.formatStatus(notice.category)}
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
        // Convert basic markdown-like formatting to HTML
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **bold** to <strong>
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // *italic* to <em>
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>') // [text](url) to links
            .replace(/\n/g, '<br>') // newlines to <br>
            .replace(/`(.*?)`/g, '<code>$1</code>'); // `code` to <code>
    }

    displayDataFiles() {
        const dataFilesContainer = document.getElementById('dataFilesContainer');
        if (!dataFilesContainer || !this.indexData) return;

        let filesHtml = '';
        
        // Display monthly groups if available
        if (this.indexData.monthlyGroups && this.indexData.monthlyGroups.length > 0) {
            filesHtml = this.indexData.monthlyGroups.map(monthGroup => `
                <div class="month-group">
                    <div class="month-header">
                        <h3>${monthGroup.month}</h3>
                        <span class="month-meta">${monthGroup.totalUpdates} updates across ${monthGroup.weeks.length} weeks</span>
                        ${monthGroup.serviceReleases.length > 0 ? `
                            <div class="service-releases">
                                ${monthGroup.serviceReleases.map(release => `
                                    <span class="service-release-badge">${release}</span>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                    <div class="weeks-in-month">
                        ${monthGroup.weeks.map(file => `
                            <div class="data-file-item week-item">
                                <div class="file-header">
                                    <h4>${file.filename}</h4>
                                    <span class="file-meta">${file.updates} updates</span>
                                </div>
                                <p><strong>Week:</strong> ${file.week}</p>
                                <p><strong>Date:</strong> ${this.formatDate(file.date)}</p>
                                ${file.serviceRelease ? `<p><strong>Service Release:</strong> ${file.serviceRelease}</p>` : ''}
                                <div class="file-actions">
                                    <a href="./data/${file.path || `updates/${file.filename}`}" target="_blank" class="view-json-btn">
                                        <i class="fas fa-code"></i> View JSON
                                    </a>
                                    <button onclick="window.tracker.downloadFile('${file.path || `updates/${file.filename}`}')" class="download-btn">
                                        <i class="fas fa-download"></i> Download
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        } 
        // Fall back to individual files if no monthly groups
        else if (this.indexData.dataFiles) {
            filesHtml = this.indexData.dataFiles.map(file => `
                <div class="data-file-item">
                    <div class="file-header">
                        <h4>${file.filename}</h4>
                        <span class="file-meta">${file.updates} updates</span>
                    </div>
                    <p><strong>Week:</strong> ${file.week}</p>
                    <p><strong>Date:</strong> ${this.formatDate(file.date)}</p>
                    ${file.serviceRelease ? `<p><strong>Service Release:</strong> ${file.serviceRelease}</p>` : ''}
                    <div class="file-actions">
                        <a href="./data/${file.path || `updates/${file.filename}`}" target="_blank" class="view-json-btn">
                            <i class="fas fa-code"></i> View JSON
                        </a>
                        <button onclick="window.tracker.downloadFile('${file.path || `updates/${file.filename}`}')" class="download-btn">
                            <i class="fas fa-download"></i> Download
                        </button>
                    </div>
                </div>
            `).join('');
        }

        dataFilesContainer.innerHTML = filesHtml;
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
            console.log('Index data for deployment time:', this.indexData);
            
            let deploymentDate;
            if (this.indexData && this.indexData.lastGenerated) {
                deploymentDate = new Date(this.indexData.lastGenerated);
                console.log('Using lastGenerated from indexData:', this.indexData.lastGenerated);
            } else {
                // Fallback to current date if no lastGenerated available
                deploymentDate = new Date();
                console.log('No lastGenerated found, using current date');
            }
            
            console.log('Final deployment date:', deploymentDate);
            
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
        } else {
            console.error('Deployment date/time elements not found:', {
                deploymentDateElement,
                deploymentTimeElement
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
                                <strong>Week:</strong> ${update.week}
                            </div>
                            <div class="meta-item">
                                <strong>Category:</strong> 
                                <span class="category-badge category-${update.category}">${categoryName}</span>
                            </div>
                            <div class="meta-item">
                                <strong>Topic:</strong> ${update.topic}
                            </div>
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
