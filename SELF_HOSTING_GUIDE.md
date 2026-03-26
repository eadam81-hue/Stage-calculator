# Self-Hosting Guide for Stage Calculator

This guide explains how to deploy the Stage Calculator application on your own infrastructure.

## Architecture Overview

- **Frontend**: React (static files) - Port 80/443 (via web server)
- **Backend**: FastAPI (Python) - Port 8001
- **Database**: MongoDB - Port 27017

---

## Prerequisites

- Web server (Nginx or Apache)
- Python 3.8+ installed
- MongoDB installed (or MongoDB Atlas account)
- Node.js 16+ (for building, if needed)
- Domain name pointing to your server

---

## Part 1: Prepare Files for Transfer

### 1.1 Frontend Build (Already Complete)
The production build is located at: `/app/frontend/build/`

**Files to upload to your web server:**
- Copy entire `/app/frontend/build/` folder to your web server document root

### 1.2 Backend Files
**Files needed from `/app/backend/`:**
- `server.py` - Main FastAPI application
- `requirements.txt` - Python dependencies
- `.env.example` - Template for environment variables

### 1.3 Create Environment Configuration
You'll need to create `.env` files on your server.

---

## Part 2: Server Setup

### 2.1 MongoDB Setup

**Option A: Local MongoDB**
```bash
# Install MongoDB (Ubuntu/Debian)
sudo apt update
sudo apt install mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

**Option B: MongoDB Atlas (Cloud)**
1. Sign up at https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Get your connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net/`)

### 2.2 Backend Setup

**On your server:**

```bash
# Create project directory
mkdir -p /var/www/stage-calculator
cd /var/www/stage-calculator

# Upload backend files here
# - server.py
# - requirements.txt

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
nano .env
```

**Backend `.env` file:**
```env
# MongoDB Configuration
MONGO_URL=mongodb://localhost:27017
DB_NAME=stage_calculator

# CORS Configuration (your domain)
CORS_ORIGINS=https://yourwebsite.com,http://yourwebsite.com

# Optional: Add any API keys if needed
```

**Start Backend Server:**
```bash
# Run with uvicorn
uvicorn server:app --host 0.0.0.0 --port 8001

# For production, use systemd service (see section 2.4)
```

### 2.3 Frontend Setup

**Upload built files to web server:**

```bash
# If using Nginx:
sudo cp -r /path/to/build/* /var/www/html/calculator/

# Set permissions
sudo chown -R www-data:www-data /var/www/html/calculator
```

**Frontend `.env` configuration:**

Before building, you set this in `/app/frontend/.env`:
```env
REACT_APP_BACKEND_URL=https://yourwebsite.com/api
```

**Important:** If you didn't set the backend URL before building, you'll need to:
1. Update `/app/frontend/.env` with your backend URL
2. Rebuild: `cd /app/frontend && yarn build`
3. Re-upload the build files

### 2.4 Nginx Configuration

**Create Nginx config file:**

```bash
sudo nano /etc/nginx/sites-available/stage-calculator
```

```nginx
server {
    listen 80;
    server_name yourwebsite.com;

    # Frontend - Static React files
    location / {
        root /var/www/html/calculator;
        try_files $uri $uri/ /index.html;
    }

    # Backend API - Proxy to FastAPI
    location /api/ {
        proxy_pass http://localhost:8001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/stage-calculator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 2.5 Create Systemd Service for Backend

**Create service file:**
```bash
sudo nano /etc/systemd/system/stage-calculator-backend.service
```

```ini
[Unit]
Description=Stage Calculator FastAPI Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/stage-calculator
Environment="PATH=/var/www/stage-calculator/venv/bin"
ExecStart=/var/www/stage-calculator/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always

[Install]
WantedBy=multi-user.target
```

**Start service:**
```bash
sudo systemctl daemon-reload
sudo systemctl start stage-calculator-backend
sudo systemctl enable stage-calculator-backend
sudo systemctl status stage-calculator-backend
```

---

## Part 3: SSL Certificate (HTTPS)

**Using Let's Encrypt (Free):**

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourwebsite.com

# Auto-renewal is configured automatically
```

---

## Part 4: Upload Initial Component Data

Once deployed, you can:
1. Access your calculator at `https://yourwebsite.com`
2. Navigate to "Component Manager"
3. Upload your Excel file with components (Aludeck, Litedeck, legs, handrails, etc.)

---

## Part 5: Testing

1. **Test Frontend**: Visit `https://yourwebsite.com`
2. **Test Backend API**: `curl https://yourwebsite.com/api/components`
3. **Test Calculation**: Use the calculator UI to create a stage

---

## Troubleshooting

### Backend Not Starting
```bash
# Check logs
sudo journalctl -u stage-calculator-backend -f

# Check if port 8001 is in use
sudo lsof -i :8001
```

### Frontend Shows Blank Page
- Check browser console for errors
- Verify `REACT_APP_BACKEND_URL` in build
- Check Nginx error logs: `sudo tail -f /var/log/nginx/error.log`

### Database Connection Failed
- Verify MongoDB is running: `sudo systemctl status mongod`
- Check MONGO_URL in backend `.env` file
- Test connection: `mongosh "mongodb://localhost:27017"`

### CORS Errors
- Update `CORS_ORIGINS` in backend `.env` to include your domain
- Restart backend service

---

## Maintenance

### Updating the Application

**Backend:**
```bash
cd /var/www/stage-calculator
source venv/bin/activate
git pull  # if using git
sudo systemctl restart stage-calculator-backend
```

**Frontend:**
```bash
# Rebuild on development machine
cd /app/frontend
yarn build

# Upload new build files
scp -r build/* user@yourserver:/var/www/html/calculator/
```

### Database Backups
```bash
# Backup MongoDB
mongodump --db=stage_calculator --out=/backups/$(date +%Y%m%d)

# Restore
mongorestore --db=stage_calculator /backups/20240101/stage_calculator
```

---

## Security Checklist

- [ ] HTTPS enabled with valid SSL certificate
- [ ] MongoDB authentication configured
- [ ] Firewall rules in place (allow 80, 443; block 8001, 27017 externally)
- [ ] Regular backups scheduled
- [ ] Environment variables secured (not in git)
- [ ] Server updates automated

---

## Cost Estimate (Self-Hosting)

- **VPS/Server**: $5-20/month (DigitalOcean, Linode, AWS)
- **Domain**: $10-15/year
- **SSL Certificate**: Free (Let's Encrypt)
- **MongoDB**: Free (local) or $0-$9/month (Atlas)

**Total**: ~$5-30/month depending on traffic

---

## Need Help?

Common issues:
1. **Port conflicts**: Change backend port in both systemd service and Nginx config
2. **Permission denied**: Ensure www-data user has access to files
3. **Module not found**: Reinstall requirements.txt in venv

For MongoDB Atlas users: Remember to whitelist your server's IP address in Atlas dashboard.
