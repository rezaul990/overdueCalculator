# Overdue Calculator - Google Drive Integration

A web application for comparing overdue amounts between master and daily Excel files with Google Drive integration.

## Features

- 🔐 **Google Authentication**: Secure sign-in with Google accounts
- ☁️ **Google Drive Integration**: Store master files in the cloud
- 📊 **Excel Processing**: Support for .xlsx, .xls, and .csv files
- 🔍 **Data Comparison**: Compare overdue amounts between master and daily files
- 📈 **Visual Reports**: Color-coded results showing increases/decreases
- 💾 **Export Results**: Download comparison reports as Excel files
- 🛡️ **Error Handling**: Comprehensive validation and error messages

## How to Use

### 1. Initial Setup
1. Open the application in a modern web browser
2. Sign in with your Google account
3. Grant permission to access Google Drive

### 2. Upload Master File
1. Click "Connect Drive" to authorize Google Drive access
2. Select your master Excel file (contains all overdue data)
3. Click "Upload Master to Drive" to store it in the cloud

### 3. Process Daily Comparison
1. Select your daily Excel file (contains updated overdue data)
2. Click "Process Comparison" to analyze the differences
3. View the results table showing branch-wise comparisons

### 4. Download Results
1. Click "Download Excel" to save the comparison report
2. The report includes both summary and detailed account data

## Required Excel File Format

### Master File Columns:
- **Sale Mst ID**: Unique identifier for each sale
- **Branch**: Branch name or code
- **Overdue**: Overdue amount
- **Account**: Account number (optional)
- **Customer**: Customer name (optional)

### Daily File Columns:
- **Sale Mst ID**: Must match master file IDs
- **Overdue**: Updated overdue amount
- **Account**: Account number (optional)
- **Customer**: Customer name (optional)

## Technical Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection
- Google account
- Excel files with proper column headers

## File Size Limits

- Maximum file size: 10MB
- Supported formats: .xlsx, .xls, .csv

## Troubleshooting

### Common Issues:

1. **"Missing required APIs" error**
   - Refresh the page and wait for all scripts to load
   - Check your internet connection

2. **"Drive auth failed" error**
   - Make sure you're signed in to Google
   - Try refreshing the page and reconnecting

3. **"Invalid file format" error**
   - Ensure your file is .xlsx, .xls, or .csv format
   - Check that the file is not corrupted

4. **"Missing required column" error**
   - Verify your Excel file has a "Sale Mst ID" column
   - Check that column names match exactly (case-sensitive)

5. **"No data to display" error**
   - Ensure your Excel files contain data rows
   - Check that the files are not empty

## Security

- All authentication is handled by Google
- Files are stored securely in your Google Drive
- No data is stored on external servers
- All processing happens in your browser

## Deployment Guide for Hostinger Shared Hosting

### Prerequisites
- A Hostinger shared hosting account
- Access to the Hostinger control panel
- FTP credentials or File Manager access
- Access to the Firebase Console for your project

### Deployment Steps

#### 1. Prepare Your Subdomain
1. Log in to your Hostinger control panel
2. Navigate to "Domains" → "Subdomains"
3. Create a new subdomain (e.g., `app.yourdomain.com`)
4. Note the directory path where the subdomain files will be stored

#### 2. Upload Files

**Option A: Using File Manager**
1. In Hostinger control panel, go to "Files" → "File Manager"
2. Navigate to your subdomain's directory (usually `/public_html/app/` if your subdomain is app.yourdomain.com)
3. Upload all application files, maintaining the same directory structure:
   - Place `index.html`, `script.js`, `style.css`, `.htaccess`, and `robots.txt` in the root directory
   - Create a `libs` folder and upload `xlsx.full.min.js` there
   - Create an `images` folder and upload `developer.png` there

**Option B: Using FTP**
1. Use an FTP client like FileZilla
2. Connect to your Hostinger hosting using the FTP credentials from your hosting panel
3. Navigate to your subdomain's directory
4. Upload all files maintaining the same directory structure as mentioned above

#### 3. Configure Firebase
1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project ("hobby-4494b")
3. Navigate to Authentication → Settings → Authorized domains
4. Add your subdomain (e.g., `app.yourdomain.com`) to the list of authorized domains

#### 4. Test Your Deployment
1. Visit your subdomain in a web browser (e.g., `https://app.yourdomain.com`)
2. Verify that all functionality works correctly:
   - Google Sign-In
   - File uploads and processing
   - Comparison functionality
   - Download and screenshot features

### Troubleshooting

#### CORS Issues
- Ensure your subdomain is added to Firebase authorized domains
- Check browser console for specific error messages

#### 404 Errors
- Verify file paths are correct
- Check file permissions (files should be readable)
- Ensure all files were uploaded correctly

#### Authentication Errors
- Confirm your subdomain is added to Firebase authorized domains
- Check if your Firebase project has Google authentication enabled
- Verify the Firebase configuration in `script.js` is correct

#### Mixed Content Warnings
- Ensure all external resources (scripts, stylesheets) use HTTPS
- Update any HTTP links to HTTPS

## Support

If you encounter any issues:
1. Check the browser console for error messages
2. Verify your Excel file format and data
3. Ensure you have proper internet connectivity
4. Try refreshing the page and starting over