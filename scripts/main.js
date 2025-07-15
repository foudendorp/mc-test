// Main application class
class IntuneUpdatesTracker {
    constructor() {
        this.updates = [];
        this.notices = [];
        this.filteredUpdates = [];
        this.currentPage = 1;
        this.itemsPerPage = 9;
        this.isLoading = false;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.updateLastRefreshTime();
        await this.loadUpdates();
        this.setupSmoothScrolling();
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', this.debounce(() => this.filterUpdates(), 300));

        // Filter functionality
        const categoryFilter = document.getElementById('categoryFilter');
        const timeFilter = document.getElementById('timeFilter');
        
        categoryFilter.addEventListener('change', () => this.filterUpdates());
        timeFilter.addEventListener('change', () => this.filterUpdates());

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        refreshBtn.addEventListener('click', () => this.refreshUpdates());

        // Load more button
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        loadMoreBtn.addEventListener('click', () => this.loadMoreUpdates());

        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleNavigation(link);
            });
        });

        // Modal close
        const modal = document.getElementById('errorModal');
        const closeBtn = modal.querySelector('.close');
        closeBtn.addEventListener('click', () => this.closeModal());
        
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
    }

    setupSmoothScrolling() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    async loadUpdates() {
        this.setLoading(true);
        
        try {
            // Simulate API call - In a real implementation, this would fetch from your backend API
            // that scrapes the Microsoft Learn page
            const data = await this.fetchIntuneUpdates();
            
            this.updates = data.updates || [];
            this.notices = data.notices || [];
            
            this.filterUpdates();
            this.displayNotices();
            this.updateStats();
            
        } catch (error) {
            console.error('Error loading updates:', error);
            this.showError('Failed to load updates. Please try again later.');
        } finally {
            this.setLoading(false);
        }
    }

    async fetchIntuneUpdates() {
        // Mock data based on the real content from Microsoft Learn
        // In production, this would call your Azure Function or API endpoint
        const mockData = {
            updates: [
                {
                    id: 1,
                    title: "Experience Microsoft Copilot in Intune",
                    date: "2025-07-14",
                    category: "device-management",
                    content: "You can now use Microsoft Copilot in Intune to explore your Intune data using natural language, take action on the results, manage policies and settings, understand your security posture, troubleshoot device issues, and view insights about enrolled Surface devices.",
                    link: "https://learn.microsoft.com/en-us/intune/intune-service/copilot/copilot-intune-explorer",
                    week: "Week of July 14, 2025"
                },
                {
                    id: 2,
                    title: "Microsoft Intune support for Apple AI features",
                    date: "2025-06-23",
                    category: "app-management",
                    content: "Intune app protection policies have new standalone settings for Apple AI features (Genmojis, Writing tools, and screen capture). Note that these standalone settings are supported by apps that have updated to version 19.7.12 or later for Xcode 15, and 20.4.0 or later for Xcode 16.",
                    link: "https://learn.microsoft.com/en-us/intune/intune-service/apps/app-protection-policy-settings-ios",
                    week: "Week of June 23, 2025 (Service release 2506)"
                },
                {
                    id: 3,
                    title: "ARM64 support for Win32 apps",
                    date: "2025-06-09",
                    category: "app-management",
                    content: "When adding a Win32 app to Intune, you can select an option to check and install the app on Windows devices running ARM64 operating systems. This capability is available from the Microsoft Intune admin center.",
                    link: "https://learn.microsoft.com/en-us/intune/intune-service/apps/apps-win32-app-management",
                    week: "Week of June 9, 2025"
                },
                {
                    id: 4,
                    title: "Endpoint Privilege Management rules explicitly deny elevation",
                    date: "2025-05-26",
                    category: "device-security",
                    content: "Endpoint Privilege Management (EPM) elevation rules now include a new file elevation type of Deny. An EPM elevation rule set to Deny blocks the specified file from running in an elevated context.",
                    link: "https://learn.microsoft.com/en-us/intune/intune-service/protect/epm-policies",
                    week: "Week of May 26, 2025 (Service release 2505)"
                },
                {
                    id: 5,
                    title: "Cross Platform Device Inventory",
                    date: "2025-05-26",
                    category: "device-management",
                    content: "Android, iOS, and Mac devices are added to device inventory. Intune now collects a default set of inventory data including 74 Apple properties and 32 Android properties.",
                    link: "https://learn.microsoft.com/en-us/intune/intune-service/remote-actions/device-inventory",
                    week: "Week of May 26, 2025 (Service release 2505)"
                },
                {
                    id: 6,
                    title: "Hotpatch updates for Windows 11 Enterprise",
                    date: "2025-04-14",
                    category: "device-configuration",
                    content: "Hotpatch updates for Windows 11 Enterprise, version 24H2 for x64 (AMD/Intel) CPU devices are now available. With hotpatch updates, you can deploy and apply security updates faster to help protect your organization from cyberattacks.",
                    link: "https://learn.microsoft.com/en-us/intune/intune-service/protect/windows-update-reports",
                    week: "Week of April 14, 2025"
                }
            ],
            notices: [
                {
                    id: 1,
                    title: "Plan for Change: Intune is moving to support iOS/iPadOS 17 and later",
                    content: "Later in calendar year 2025, we expect iOS 26 and iPadOS 26 to be released by Apple. Microsoft Intune, including the Intune Company Portal and Intune app protection policies (APP, also known as MAM), requires iOS 17/iPadOS 17 and higher shortly after the iOS/iPadOS 26 release.",
                    type: "warning"
                },
                {
                    id: 2,
                    title: "Update to the latest Intune App SDK and Intune App Wrapping Tool for iOS",
                    content: "To support the upcoming release of iOS/iPadOS 26 and ensure continued app protection policy enforcement, update to the latest versions of the Intune App SDK and the Intune App Wrapping Tool to ensure applications stay secure and run smoothly.",
                    type: "info"
                }
            ]
        };

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return mockData;
    }

    filterUpdates() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const categoryFilter = document.getElementById('categoryFilter').value;
        const timeFilter = document.getElementById('timeFilter').value;

        this.filteredUpdates = this.updates.filter(update => {
            // Search filter
            const matchesSearch = searchTerm === '' || 
                update.title.toLowerCase().includes(searchTerm) ||
                update.content.toLowerCase().includes(searchTerm) ||
                update.category.toLowerCase().includes(searchTerm);

            // Category filter
            const matchesCategory = categoryFilter === 'all' || update.category === categoryFilter;

            // Time filter
            const matchesTime = this.checkTimeFilter(update.date, timeFilter);

            return matchesSearch && matchesCategory && matchesTime;
        });

        this.currentPage = 1;
        this.displayUpdates();
    }

    checkTimeFilter(dateString, filter) {
        if (filter === 'all') return true;

        const updateDate = new Date(dateString);
        const now = new Date();
        const diffTime = now - updateDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        switch (filter) {
            case '7days':
                return diffDays <= 7;
            case '30days':
                return diffDays <= 30;
            case '90days':
                return diffDays <= 90;
            default:
                return true;
        }
    }

    displayUpdates() {
        const container = document.getElementById('updatesContainer');
        const startIndex = 0;
        const endIndex = this.currentPage * this.itemsPerPage;
        const updatesToShow = this.filteredUpdates.slice(startIndex, endIndex);

        if (updatesToShow.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
                    <h3>No updates found</h3>
                    <p>Try adjusting your search terms or filters.</p>
                </div>
            `;
            document.getElementById('loadMoreBtn').style.display = 'none';
            return;
        }

        container.innerHTML = updatesToShow.map(update => this.createUpdateCard(update)).join('');

        // Show/hide load more button
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (endIndex < this.filteredUpdates.length) {
            loadMoreBtn.style.display = 'block';
        } else {
            loadMoreBtn.style.display = 'none';
        }

        // Add fade-in animation
        container.querySelectorAll('.update-card').forEach((card, index) => {
            setTimeout(() => {
                card.classList.add('fade-in');
            }, index * 100);
        });
    }

    createUpdateCard(update) {
        const formattedDate = this.formatDate(update.date);
        const categoryName = this.formatCategoryName(update.category);

        return `
            <div class="update-card">
                <div class="update-header">
                    <div>
                        <h3 class="update-title">${update.title}</h3>
                        <div class="update-date">${formattedDate}</div>
                    </div>
                </div>
                <div class="update-category">${categoryName}</div>
                <div class="update-content">
                    ${this.truncateText(update.content, 200)}
                </div>
                <a href="${update.link}" class="update-link" target="_blank" rel="noopener noreferrer">
                    Read More <i class="fas fa-external-link-alt"></i>
                </a>
            </div>
        `;
    }

    displayNotices() {
        const container = document.getElementById('noticesContainer');
        
        if (this.notices.length === 0) {
            container.innerHTML = '<p>No notices available at this time.</p>';
            return;
        }

        container.innerHTML = this.notices.map(notice => `
            <div class="notice-card">
                <h3 class="notice-title">
                    <i class="fas fa-exclamation-triangle"></i>
                    ${notice.title}
                </h3>
                <div class="notice-content">${notice.content}</div>
            </div>
        `).join('');
    }

    loadMoreUpdates() {
        this.currentPage++;
        this.displayUpdates();
    }

    async refreshUpdates() {
        const refreshBtn = document.getElementById('refreshBtn');
        const icon = refreshBtn.querySelector('i');
        
        // Add spinning animation
        icon.style.animation = 'spin 1s linear infinite';
        refreshBtn.disabled = true;

        try {
            await this.loadUpdates();
            this.updateLastRefreshTime();
        } finally {
            // Remove spinning animation
            icon.style.animation = '';
            refreshBtn.disabled = false;
        }
    }

    updateStats() {
        document.getElementById('totalUpdates').textContent = this.updates.length;
        
        // Calculate this week's updates
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        const thisWeekCount = this.updates.filter(update => 
            new Date(update.date) >= oneWeekAgo
        ).length;
        
        document.getElementById('thisWeek').textContent = thisWeekCount;
    }

    updateLastRefreshTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        document.getElementById('lastRefresh').textContent = timeString;
    }

    handleNavigation(link) {
        // Remove active class from all links
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        
        // Add active class to clicked link
        link.classList.add('active');

        // Get target section
        const href = link.getAttribute('href');
        const target = document.querySelector(href);
        
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    }

    setLoading(isLoading) {
        this.isLoading = isLoading;
        const loadingSpinner = document.getElementById('loadingSpinner');
        const updatesContainer = document.getElementById('updatesContainer');

        if (isLoading) {
            loadingSpinner.style.display = 'block';
            updatesContainer.style.display = 'none';
        } else {
            loadingSpinner.style.display = 'none';
            updatesContainer.style.display = 'grid';
        }
    }

    showError(message) {
        const modal = document.getElementById('errorModal');
        const errorMessage = document.getElementById('errorMessage');
        
        errorMessage.textContent = message;
        modal.style.display = 'block';
    }

    closeModal() {
        document.getElementById('errorModal').style.display = 'none';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatCategoryName(category) {
        return category
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substr(0, maxLength) + '...';
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

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new IntuneUpdatesTracker();
});

// Service Worker registration for PWA capabilities (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
