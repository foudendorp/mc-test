# Microsoft Services Updates Tracker

A modern, responsive web application that tracks and displays the latest updates from Microsoft Intune and Entra ID. Built as an Azure Static Web App with automated data generation and a clean, professional interface.

![Microsoft Updates Tracker](https://img.shields.io/badge/Status-Active-green) ![Azure Static Web Apps](https://img.shields.io/badge/Azure-Static%20Web%20App-blue) ![License](https://img.shields.io/badge/License-MIT-yellow) ![Services](https://img.shields.io/badge/Services-Intune%20%2B%20Entra%20ID-blue)

## 🚀 Features

### Multi-Service Support
- **Microsoft Intune**: Device management and mobile application management updates
- **Microsoft Entra ID**: Identity and access management updates
- **Service Separation**: Clean organization with service-specific data directories
- **Service Badges**: Visual indicators to distinguish between services

### Advanced Functionality
- **Automated Data Generation**: Node.js script fetches and processes updates from Microsoft Learn
- **Smart Change Detection**: Only updates files when content actually changes
- **Service-Specific Notices**: Important announcements organized by service
- **Real-time Updates**: Automatically deployed via GitHub Actions
- **Smart Search**: Find updates across all services with advanced filtering
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Modern UI**: Clean interface with service-specific color coding
- **Performance Optimized**: Efficient caching and smart file updates

## 📱 Live Demo

Visit the live application: [https://your-static-web-app-url.azurestaticapps.net](https://your-static-web-app-url.azurestaticapps.net)

## 🛠️ Technology Stack

### Frontend
- **HTML5**: Semantic markup with accessibility features
- **CSS3**: Modern styling with CSS Grid, Flexbox, and custom properties
- **Vanilla JavaScript**: ES6+ features for optimal performance
- **Font Awesome**: Professional icon library

### Backend Data Generation
- **Node.js**: Server-side data processing
- **JSDOM**: HTML parsing for Microsoft Learn pages
- **Crypto**: Content hashing for change detection
- **Automated Workflows**: GitHub Actions for deployment

### Hosting & Infrastructure
- **Azure Static Web Apps**: Global CDN and automatic HTTPS
- **GitHub Actions**: CI/CD pipeline with automated data generation
- **Service-Separated Storage**: Organized JSON data structure

## 📁 Project Structure

```
mc-test/
├── index.html                    # Main HTML file
├── styles/
│   ├── main.css                 # Main stylesheet
│   └── table.css                # Table and service badge styles
├── scripts/
│   ├── main.js                  # Frontend application logic
│   └── generate-data.js         # Node.js data generation script
├── data/                        # Generated JSON data
│   ├── index.json              # Main index with all services
│   ├── updates/
│   │   ├── intune/             # Microsoft Intune updates
│   │   └── entra/              # Microsoft Entra ID updates
│   └── notices/
│       ├── intune/             # Intune-specific notices
│       └── entra/              # Entra ID-specific notices
├── .github/
│   └── workflows/
│       └── azure-static-web-apps-*.yml  # Deployment workflow
├── package.json                 # Node.js dependencies
├── staticwebapp.config.json     # Azure Static Web App config
└── README.md                    # This file
```

## 🔧 Data Generation Process

### Automated Workflow
1. **GitHub Actions Trigger**: On push to main branch or scheduled runs
2. **Multi-Service Fetching**: Script fetches from both service URLs:
   - Microsoft Intune: `https://learn.microsoft.com/en-us/mem/intune/fundamentals/whats-new`
   - Microsoft Entra ID: `https://learn.microsoft.com/en-us/entra/fundamentals/whats-new`
3. **Content Processing**: Parses HTML, extracts updates and notices
4. **Service Separation**: Organizes data into service-specific directories
5. **Change Detection**: Only updates files when content actually changes
6. **Deployment**: Azure Static Web Apps automatically deploys the updated site

### Service Configuration
```javascript
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
```

## 🚀 Getting Started

### Prerequisites

- Git
- A modern web browser
- Azure account (for deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/foudendorp/mc-test.git
   cd mc-test
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Generate sample data (optional)**
   ```bash
   node scripts/generate-data.js
   ```

4. **Start local development server**
   ```bash
   npm run dev
   ```
   Or simply open `index.html` in your browser.

5. **View the application**
   Open your browser and navigate to `http://localhost:8080` (or the URL shown in your terminal).

## ☁️ Azure Deployment

### Method 1: Azure Portal

1. **Create an Azure Static Web App**
   - Go to the Azure Portal
   - Create a new "Static Web App" resource
   - Connect your GitHub repository
   - Set build details:
     - App location: `/`
     - Output location: `/`

2. **Configure GitHub Actions**
   Azure will automatically create a GitHub Actions workflow for deployment.

### Method 2: Azure CLI

```bash
# Login to Azure
az login

# Create resource group
az group create --name rg-intune-tracker --location "East US"

# Create static web app
az staticwebapp create \
  --name microsoft-services-tracker \
  --resource-group rg-intune-tracker \
  --source https://github.com/foudendorp/mc-test \
  --location "East US" \
  --branch main \
  --app-location "/" \
  --output-location "/"
```

### Method 3: VS Code Extension

1. Install the "Azure Static Web Apps" extension in VS Code
2. Sign in to your Azure account
3. Right-click on your project folder
4. Select "Create Static Web App..."
5. Follow the prompts to configure and deploy

## 🔧 Configuration

### Environment Variables

For future API integrations, create a `.env` file in the root directory:

```env
# Microsoft Learn URLs (currently hardcoded in generate-data.js)
INTUNE_LEARN_URL=https://learn.microsoft.com/en-us/mem/intune/fundamentals/whats-new
ENTRA_LEARN_URL=https://learn.microsoft.com/en-us/entra/fundamentals/whats-new

# Data generation settings
REFRESH_INTERVAL=3600000
ENABLE_CHANGE_DETECTION=true
```

### Service Configuration

To add new Microsoft services, update the `SERVICES` object in `scripts/generate-data.js`:

```javascript
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
    // Add new services here
    defender: {
        name: 'Defender',
        url: 'https://learn.microsoft.com/en-us/defender/whats-new',
        tag: 'Defender'
    }
};
```

### Adding Service Badges

Add corresponding CSS classes in `styles/table.css`:

```css
.service-defender {
    background-color: #e8f5e8;
    color: #2e7d32;
}
```

### Customization

#### Styling
- Modify `styles/main.css` to customize colors, fonts, and layout
- The CSS uses CSS custom properties for easy theming:

```css
:root {
  --primary-color: #0078d4;
  --secondary-color: #106ebe;
  --accent-color: #ff6b6b;
}
```

#### Content
- Update `scripts/main.js` to modify the mock data or API endpoints
- Customize categories and filters in the JavaScript configuration

## 🔄 Data Architecture

### Service-Separated Structure
The application uses a sophisticated data architecture that separates content by service:

```json
{
  "lastGenerated": "2025-07-15T10:30:00.000Z",
  "totalUpdates": 156,
  "totalFiles": 48,
  "totalNotices": 12,
  "services": ["Intune", "Entra"],
  "monthlyGroups": [...],
  "dataFiles": [
    {
      "filename": "2025-07-15.json",
      "path": "updates/intune/2025-07-15.json",
      "service": "Intune",
      "updates": 8
    }
  ]
}
```

### Content Processing
- **HTML Parsing**: Extracts structured data from Microsoft Learn pages
- **Content Identification**: Automatically detects service tags and categories
- **Change Detection**: Uses SHA-256 hashing to detect content changes
- **Fallback Data**: Provides sample data when live fetching fails

### Smart Updates
- **Deterministic IDs**: Content-based IDs prevent duplicate entries
- **Timestamp Management**: Separates content hashes from deployment timestamps
- **Service Tagging**: Every update includes service attribution

## 📊 Analytics & Monitoring

### Application Insights (Recommended)
Add Application Insights for monitoring:

```html
<script>
  // Application Insights snippet
  !function(T,l,y){/* ... */}
</script>
```

### Google Analytics
Add tracking code to `index.html`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_TRACKING_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_TRACKING_ID');
</script>
```

## 🔒 Security

- Content Security Policy (CSP) headers configured
- HTTPS enforced on Azure Static Web Apps
- No sensitive data stored in frontend
- External links open in new tabs with `rel="noopener noreferrer"`

## 🎨 Design System

The application follows Microsoft's Fluent Design principles with service-specific enhancements:

### Service Color Coding
- **Intune**: Blue theme (`#0277bd`) for device management
- **Entra ID**: Purple theme (`#6a1b9a`) for identity management  
- **System**: Gray theme (`#424242`) for system notices

### Design Elements
- **Typography**: Segoe UI font family
- **Spacing**: Consistent 8px grid system
- **Service Badges**: Color-coded indicators for easy service identification
- **Animations**: Subtle transitions and hover effects
- **Accessibility**: WCAG 2.1 AA compliance

### UI Components
- **Service Filters**: Multi-service filtering capabilities
- **Responsive Tables**: Mobile-optimized data display
- **Modal Popups**: Detailed view with service attribution
- **Loading States**: Professional loading indicators

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Microsoft for providing comprehensive documentation on Intune and Entra ID
- Azure Static Web Apps team for the excellent hosting platform
- Node.js community for powerful server-side JavaScript tools
- Font Awesome for the beautiful icons
- The IT community for feedback and suggestions on multi-service support

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/foudendorp/mc-test/issues) section
2. Create a new issue with detailed information
3. Contact the maintainer: [your-email@example.com]

## 🗺️ Roadmap

### Current Features ✅
- [x] Multi-service support (Intune + Entra ID)
- [x] Automated data generation with Node.js
- [x] Service-separated data architecture
- [x] Smart change detection
- [x] Service-specific badges and filtering
- [x] Responsive design with mobile optimization

### Planned Enhancements 🚧
- [ ] Additional Microsoft services (Defender, Purview, etc.)
- [ ] PWA capabilities with offline support
- [ ] Email notifications for new updates
- [ ] RSS feed generation
- [ ] Dark mode theme
- [ ] Export functionality (PDF, CSV)
- [ ] Integration with Microsoft Graph API
- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] Service-specific notification preferences

---

**Disclaimer**: This is an unofficial tool. Microsoft, Intune, Entra ID, and related trademarks are property of Microsoft Corporation. All content is sourced from official Microsoft Learn documentation.
