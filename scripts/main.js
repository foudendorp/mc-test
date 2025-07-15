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
        this.refreshBtn = document.getElementById('refreshBtn');
        
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
        
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.refreshUpdates());
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
            
            console.log('🎯 Initialization complete. Updates loaded:', this.updates.length);
            
            this.updateStats();
            this.filterUpdates(); // This will populate filteredUpdates and call displayUpdates()
            this.displayNotices();
            this.displayDataFiles();
            this.updateLastRefreshTime();
        } catch (error) {
            console.error('Error initializing tracker:', error);
            this.showError('Failed to load updates. Please try again later.');
        } finally {
            this.setLoading(false);
        }
    }

    async fetchIntuneUpdates() {
        try {
            console.log('Starting to fetch Intune updates...');
            console.log('Current URL:', window.location.href);
            
            // Load the index file to get available data files
            console.log('Fetching index.json...');
            const indexUrl = './data/index.json';
            console.log('Index URL:', indexUrl);
            const indexResponse = await fetch(indexUrl);
            
            console.log('Index response status:', indexResponse.status);
            console.log('Index response ok:', indexResponse.ok);
            
            if (!indexResponse.ok) {
                console.error('Index file not found or failed to load. Status:', indexResponse.status, 'URL:', indexUrl);
                return this.getFallbackData();
            }
            
            const indexData = await indexResponse.json();
            console.log('Index data loaded successfully:', indexData);
            console.log('Number of data files in index:', indexData.dataFiles?.length || 0);
            
            // Load all update files
            const updates = [];
            console.log(`Loading ${indexData.dataFiles?.length || 0} data files...`);
            
            if (!indexData.dataFiles || indexData.dataFiles.length === 0) {
                console.error('No data files found in index.json');
                return this.getFallbackData();
            }
            
            for (const fileInfo of indexData.dataFiles) {
                try {
                    const filePath = fileInfo.path || `updates/${fileInfo.filename}`;
                    const fullUrl = `./data/${filePath}`;
                    console.log(`Fetching file: ${fullUrl}`);
                    const fileResponse = await fetch(fullUrl);
                    
                    console.log(`Response for ${filePath}: status=${fileResponse.status}, ok=${fileResponse.ok}`);
                    
                    if (!fileResponse.ok) {
                        console.warn(`Failed to load ${filePath}, status: ${fileResponse.status}`);
                        continue;
                    }
                    
                    const fileData = await fileResponse.json();
                    console.log(`Successfully loaded ${filePath}:`, {
                        topics: fileData.topics?.length || 0,
                        date: fileData.date,
                        week: fileData.week
                    });
                    
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
                console.log('Fetching notices/notices.json...');
                const noticesResponse = await fetch('./data/notices/notices.json');
                if (noticesResponse.ok) {
                    const noticesData = await noticesResponse.json();
                    notices = noticesData.notices || [];
                    console.log(`Loaded ${notices.length} notices`);
                } else {
                    console.warn('Notices file not found');
                }
            } catch (noticesError) {
                console.error('Error loading notices:', noticesError);
            }
            
            console.log(`FINAL RESULT: Total updates loaded: ${updates.length}`);
            console.log('Sample update:', updates[0]);
            
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
            console.log('Using fallback data due to error');
            return this.getFallbackData();
        }
    }

    getFallbackData() {
        console.log('🚨 USING FALLBACK DATA - JSON files not accessible');
        
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

        console.log('🔍 Filtering updates:', {
            totalUpdates: this.updates.length,
            searchTerm,
            categoryFilter,
            timeFilter
        });

        // Let's examine a sample update to see its structure
        if (this.updates.length > 0) {
            console.log('📄 Sample update structure:', {
                firstUpdate: this.updates[0],
                hasTitle: !!this.updates[0]?.title,
                hasContent: !!this.updates[0]?.content,
                hasTopic: !!this.updates[0]?.topic,
                hasCategory: !!this.updates[0]?.category,
                hasDate: !!this.updates[0]?.date
            });
        }

        this.filteredUpdates = this.updates.filter((update, index) => {
            // Ensure required fields exist
            if (!update || !update.title || !update.content || !update.topic) {
                console.warn(`❌ Skipping incomplete update at index ${index}:`, update);
                return false;
            }
            
            // Debug first few updates
            if (index < 3) {
                console.log(`🔍 Checking update ${index}:`, {
                    title: update.title,
                    category: update.category,
                    date: update.date,
                    topic: update.topic
                });
            }
            
            // Search filter
            const matchesSearch = !searchTerm || 
                update.title.toLowerCase().includes(searchTerm) ||
                (update.subtitle && update.subtitle.toLowerCase().includes(searchTerm)) ||
                update.content.toLowerCase().includes(searchTerm) ||
                update.topic.toLowerCase().includes(searchTerm) ||
                (update.features && update.features.some(feature => 
                    feature.toLowerCase().includes(searchTerm)));

            // Category filter
            const matchesCategory = !categoryFilter || categoryFilter === 'all' || update.category === categoryFilter;

            // Time filter
            const matchesTime = this.checkTimeFilter(update.date, timeFilter);

            // Debug first few results
            if (index < 3) {
                console.log(`✅ Update ${index} filter results:`, {
                    matchesSearch,
                    matchesCategory,
                    matchesTime,
                    finalResult: matchesSearch && matchesCategory && matchesTime
                });
            }

            return matchesSearch && matchesCategory && matchesTime;
        });

        console.log('✅ Filtering complete:', {
            filteredCount: this.filteredUpdates.length,
            sampleUpdate: this.filteredUpdates[0]
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
        if (!this.updatesContainer) {
            console.error('❌ Updates container not found');
            return;
        }

        console.log('📺 Displaying updates:', {
            filteredUpdates: this.filteredUpdates.length,
            currentPage: this.currentPage,
            updatesPerPage: this.updatesPerPage
        });

        const startIndex = 0;
        const endIndex = this.currentPage * this.updatesPerPage;
        this.displayedUpdates = this.filteredUpdates.slice(startIndex, endIndex);

        console.log('📋 Updates to display:', {
            startIndex,
            endIndex,
            displayedCount: this.displayedUpdates.length
        });

        if (this.displayedUpdates.length === 0) {
            this.updatesContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <h3>No updates found</h3>
                    <p>Try adjusting your search criteria or filters.</p>
                </div>
            `;
        } else {
            this.updatesContainer.innerHTML = this.displayedUpdates
                .map(update => this.createUpdateCard(update))
                .join('');
        }

        // Show/hide load more button
        if (this.loadMoreBtn) {
            const hasMoreUpdates = this.filteredUpdates.length > this.displayedUpdates.length;
            this.loadMoreBtn.style.display = hasMoreUpdates ? 'block' : 'none';
        }
    }

    createUpdateCard(update) {
        const formattedDate = this.formatDate(update.date);
        const categoryName = this.formatCategoryName(update.category);
        
        const featuresHtml = update.features ? 
            update.features.map(feature => `<li>${feature}</li>`).join('') : '';

        return `
            <article class="update-card" data-category="${update.category}">
                <header class="update-header">
                    <div class="update-badge">${update.week}</div>
                    <div class="update-meta">
                        <span class="update-category">${categoryName}</span>
                        <span class="update-date">${formattedDate}</span>
                    </div>
                </header>
                
                <div class="update-body">
                    <h3 class="update-title">${update.title}</h3>
                    <p class="update-subtitle">${update.subtitle || ''}</p>
                    <p class="update-topic"><strong>Topic:</strong> ${update.topic}</p>
                    <div class="update-content">
                        ${this.truncateText(update.content, 200)}
                    </div>
                    
                    ${featuresHtml ? `
                        <div class="update-features">
                            <h4>Key Features:</h4>
                            <ul>${featuresHtml}</ul>
                        </div>
                    ` : ''}
                </div>
                
                <footer class="update-footer">
                    <a href="${update.link}" target="_blank" class="learn-more-btn">
                        <i class="fas fa-external-link-alt"></i>
                        Learn More
                    </a>
                </footer>
            </article>
        `;
    }

    displayNotices() {
        if (!this.noticesContainer || !this.notices.length) return;

        const noticesHtml = this.notices.map(notice => `
            <div class="notice-item ${notice.type}">
                <div class="notice-header">
                    <h4>${notice.title}</h4>
                    <span class="notice-date">${this.formatDate(notice.date)}</span>
                </div>
                <p>${notice.content}</p>
                ${notice.link ? `<a href="${notice.link}" target="_blank">Learn more <i class="fas fa-external-link-alt"></i></a>` : ''}
            </div>
        `).join('');

        this.noticesContainer.innerHTML = noticesHtml;
    }

    displayDataFiles() {
        const dataFilesContainer = document.getElementById('dataFilesContainer');
        if (!dataFilesContainer || !this.indexData.dataFiles) return;

        const filesHtml = this.indexData.dataFiles.map(file => `
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

    async refreshUpdates() {
        this.setLoading(true);
        try {
            const data = await this.fetchIntuneUpdates();
            this.updates = data.updates;
            this.notices = data.notices;
            this.indexData = data.indexData;
            
            this.updateStats();
            this.filterUpdates();
            this.displayNotices();
            this.displayDataFiles();
            this.updateLastRefreshTime();
            
            // Show success message
            const successMsg = document.createElement('div');
            successMsg.className = 'toast success';
            successMsg.innerHTML = '<i class="fas fa-check"></i> Updates refreshed successfully!';
            document.body.appendChild(successMsg);
            
            setTimeout(() => {
                successMsg.remove();
            }, 3000);
            
        } catch (error) {
            console.error('Error refreshing updates:', error);
            this.showError('Failed to refresh updates. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    updateStats() {
        const totalUpdatesElement = document.getElementById('totalUpdates');
        const totalWeeksElement = document.getElementById('totalWeeks');
        const totalNoticesElement = document.getElementById('totalNotices');

        if (totalUpdatesElement) {
            totalUpdatesElement.textContent = this.updates.length;
        }
        
        if (totalWeeksElement) {
            const uniqueWeeks = new Set(this.updates.map(update => update.week));
            totalWeeksElement.textContent = uniqueWeeks.size;
        }
        
        if (totalNoticesElement) {
            totalNoticesElement.textContent = this.notices.length;
        }

        // Update the "This Week" stat to show "Total Weeks" instead
        const thisWeekElement = document.getElementById('thisWeek');
        if (thisWeekElement) {
            const uniqueWeeks = new Set(this.updates.map(update => update.week));
            thisWeekElement.textContent = uniqueWeeks.size;
        }
    }

    updateLastRefreshTime() {
        const lastRefreshElement = document.getElementById('lastRefresh');
        if (lastRefreshElement) {
            const now = new Date();
            lastRefreshElement.textContent = now.toLocaleString();
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

        if (this.refreshBtn) {
            this.refreshBtn.disabled = isLoading;
            this.refreshBtn.innerHTML = isLoading ? 
                '<i class="fas fa-spinner fa-spin"></i> Refreshing...' : 
                '<i class="fas fa-sync-alt"></i> Refresh';
        }
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
