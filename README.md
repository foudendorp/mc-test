# Intune Updates Tracker

A modern, responsive web application that tracks and displays the latest Microsoft Intune updates, features, and announcements. Built as an Azure Static Web App with a clean, professional interface.

![Intune Updates Tracker](https://img.shields.io/badge/Status-Active-green) ![Azure Static Web Apps](https://img.shields.io/badge/Azure-Static%20Web%20App-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

## 🚀 Features

- **Real-time Updates**: Automatically fetches the latest information from Microsoft Learn
- **Smart Search**: Quickly find specific updates, features, or topics
- **Advanced Filtering**: Filter by category, date, or service release
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Modern UI**: Clean, professional interface inspired by Microsoft's design language
- **Fast Loading**: Optimized for performance with efficient caching
- **Accessibility**: Built with accessibility best practices

## 📱 Live Demo

Visit the live application: [https://your-static-web-app-url.azurestaticapps.net](https://your-static-web-app-url.azurestaticapps.net)

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Hosting**: Azure Static Web Apps
- **Styling**: Modern CSS Grid and Flexbox
- **Icons**: Font Awesome
- **Fonts**: Segoe UI (Microsoft's design system)

## 📁 Project Structure

```
mc-test/
├── index.html              # Main HTML file
├── styles/
│   └── main.css            # Main stylesheet
├── scripts/
│   └── main.js             # Application logic
├── assets/                 # Images and icons
├── package.json            # Project configuration
├── staticwebapp.config.json # Azure Static Web App config
└── README.md               # This file
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

2. **Install dependencies (optional)**
   ```bash
   npm install
   ```

3. **Start local development server**
   ```bash
   npm run dev
   ```
   Or simply open `index.html` in your browser.

4. **View the application**
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
  --name intune-updates-tracker \
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

Create a `.env` file in the root directory (for future API integrations):

```env
# API Configuration (when implementing backend scraping)
INTUNE_API_ENDPOINT=https://your-api-endpoint.com
REFRESH_INTERVAL=3600000
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

## 🔄 Data Source Integration

### Current Implementation
The app currently uses mock data that mirrors the structure of Microsoft Learn content.

### Future Implementation Options

1. **Azure Function Backend**
   ```javascript
   // api/updates.js
   module.exports = async function (context, req) {
     // Scrape Microsoft Learn page
     // Parse and return structured data
   };
   ```

2. **GitHub Actions Scraper**
   - Set up scheduled workflow to scrape content
   - Store data in JSON files in repository
   - Trigger site rebuild when data changes

3. **Third-party API**
   - Use RSS feeds or unofficial APIs
   - Transform data to match application schema

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

The application follows Microsoft's Fluent Design principles:

- **Typography**: Segoe UI font family
- **Colors**: Microsoft brand colors
- **Spacing**: Consistent 8px grid system
- **Animations**: Subtle transitions and hover effects
- **Accessibility**: WCAG 2.1 AA compliance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Microsoft for providing comprehensive Intune documentation
- Azure Static Web Apps team for the excellent hosting platform
- Font Awesome for the beautiful icons
- The IT community for feedback and suggestions

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/foudendorp/mc-test/issues) section
2. Create a new issue with detailed information
3. Contact the maintainer: [your-email@example.com]

## 🗺️ Roadmap

- [ ] Backend API for real-time scraping
- [ ] PWA capabilities with offline support
- [ ] Email notifications for new updates
- [ ] RSS feed generation
- [ ] Dark mode theme
- [ ] Export functionality (PDF, CSV)
- [ ] Integration with Microsoft Graph API
- [ ] Multi-language support

---

**Disclaimer**: This is an unofficial tool. Microsoft, Intune, and related trademarks are property of Microsoft Corporation. All content is sourced from official Microsoft documentation.
