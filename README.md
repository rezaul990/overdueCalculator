# Plaza-wise Overdue Comparison Tool

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