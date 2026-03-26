#!/bin/bash

# Stage Calculator - Self-Hosting Deployment Package Creator
# This script creates a deployment package with all necessary files

echo "Creating deployment package for self-hosting..."

# Create deployment directory
DEPLOY_DIR="/tmp/stage-calculator-deployment"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR/{frontend,backend,docs}

echo "✓ Created deployment directory"

# Copy frontend build
echo "Copying frontend build files..."
cp -r /app/frontend/build $DEPLOY_DIR/frontend/
echo "✓ Frontend build copied"

# Copy backend files
echo "Copying backend files..."
cp /app/backend/server.py $DEPLOY_DIR/backend/
cp /app/backend/requirements.txt $DEPLOY_DIR/backend/
echo "✓ Backend files copied"

# Create environment templates
echo "Creating environment templates..."

# Backend .env template
cat > $DEPLOY_DIR/backend/.env.example << 'EOF'
# MongoDB Configuration
# For local MongoDB: mongodb://localhost:27017
# For MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/
MONGO_URL=mongodb://localhost:27017
DB_NAME=stage_calculator

# CORS Configuration
# Add your domain(s) separated by commas
CORS_ORIGINS=https://yourwebsite.com,http://yourwebsite.com

# Optional: Add any API keys here if needed
EOF

# Frontend env note
cat > $DEPLOY_DIR/frontend/.env.example << 'EOF'
# IMPORTANT: Set this BEFORE building the React app
# This should point to your backend API endpoint

# If backend is on same domain with /api prefix:
REACT_APP_BACKEND_URL=https://yourwebsite.com/api

# If backend is on separate domain:
# REACT_APP_BACKEND_URL=https://api.yourwebsite.com/api

# Note: After changing this, rebuild with: yarn build
EOF

echo "✓ Environment templates created"

# Copy documentation
echo "Copying documentation..."
cp /app/SELF_HOSTING_GUIDE.md $DEPLOY_DIR/docs/
echo "✓ Documentation copied"

# Create Nginx config template
cat > $DEPLOY_DIR/docs/nginx.conf.example << 'EOF'
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
EOF

# Create systemd service template
cat > $DEPLOY_DIR/docs/stage-calculator-backend.service << 'EOF'
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
EOF

echo "✓ Configuration templates created"

# Create quick start guide
cat > $DEPLOY_DIR/QUICK_START.txt << 'EOF'
STAGE CALCULATOR - SELF-HOSTING QUICK START
============================================

This package contains everything you need to self-host the Stage Calculator.

PACKAGE CONTENTS:
├── frontend/
│   └── build/          # Built React app (ready to deploy)
├── backend/
│   ├── server.py       # FastAPI application
│   ├── requirements.txt # Python dependencies
│   └── .env.example    # Environment variable template
└── docs/
    ├── SELF_HOSTING_GUIDE.md  # Complete deployment guide
    ├── nginx.conf.example      # Nginx configuration
    └── stage-calculator-backend.service  # Systemd service

QUICK DEPLOYMENT STEPS:
=======================

1. SETUP MONGODB
   - Install MongoDB locally OR use MongoDB Atlas (cloud)
   - Note your connection string

2. DEPLOY BACKEND
   - Upload backend/ folder to your server
   - Create virtual environment: python3 -m venv venv
   - Install dependencies: venv/bin/pip install -r requirements.txt
   - Create .env file from .env.example (add your MongoDB URL)
   - Start: venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001

3. DEPLOY FRONTEND
   - Upload frontend/build/ contents to your web server
   - Configure Nginx to serve static files and proxy /api/ to backend

4. CONFIGURE SSL
   - Use Let's Encrypt for free SSL: sudo certbot --nginx -d yourdomain.com

IMPORTANT:
- Set REACT_APP_BACKEND_URL in frontend/.env.example BEFORE rebuilding if needed
- Update CORS_ORIGINS in backend/.env to include your domain
- See docs/SELF_HOSTING_GUIDE.md for detailed instructions

SUPPORT:
- Full documentation in docs/SELF_HOSTING_GUIDE.md
- Nginx config example in docs/nginx.conf.example
- Systemd service template in docs/stage-calculator-backend.service
EOF

echo "✓ Quick start guide created"

# Create README
cat > $DEPLOY_DIR/README.md << 'EOF'
# Stage Calculator - Self-Hosting Package

This deployment package contains everything needed to run the Stage Calculator on your own infrastructure.

## What's Included

- **Production-ready React build** (frontend/build/)
- **FastAPI backend** (backend/server.py)
- **Configuration templates** (environment variables, Nginx, systemd)
- **Complete documentation** (docs/SELF_HOSTING_GUIDE.md)

## Quick Start

1. Read `QUICK_START.txt` for overview
2. Follow detailed instructions in `docs/SELF_HOSTING_GUIDE.md`
3. Use templates in `docs/` folder for configuration

## Requirements

- Linux server (Ubuntu/Debian recommended)
- Python 3.8+
- MongoDB (local or Atlas)
- Nginx or Apache
- Domain name with DNS configured

## First Steps

1. Set up MongoDB
2. Deploy backend with Python virtual environment
3. Upload frontend static files to web server
4. Configure Nginx reverse proxy
5. Enable SSL with Let's Encrypt

## Documentation

See `docs/SELF_HOSTING_GUIDE.md` for complete step-by-step instructions.

## File Structure

```
stage-calculator-deployment/
├── frontend/
│   └── build/              # Static React files (upload to web server)
├── backend/
│   ├── server.py           # Main FastAPI app
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Environment template
├── docs/
│   ├── SELF_HOSTING_GUIDE.md           # Full documentation
│   ├── nginx.conf.example               # Web server config
│   └── stage-calculator-backend.service # Systemd service
├── QUICK_START.txt         # Quick reference
└── README.md              # This file
```

## Support

All configuration examples and troubleshooting steps are in the documentation.
EOF

# Create archive
echo "Creating compressed archive..."
cd /tmp
tar -czf stage-calculator-deployment.tar.gz stage-calculator-deployment/

echo ""
echo "================================================"
echo "✓ Deployment package created successfully!"
echo "================================================"
echo ""
echo "Location: /tmp/stage-calculator-deployment.tar.gz"
echo "Size: $(du -h /tmp/stage-calculator-deployment.tar.gz | cut -f1)"
echo ""
echo "Contents:"
echo "  - Frontend build (production-ready)"
echo "  - Backend Python files"
echo "  - Configuration templates"
echo "  - Complete documentation"
echo ""
echo "Next steps:"
echo "  1. Download the archive"
echo "  2. Read QUICK_START.txt"
echo "  3. Follow SELF_HOSTING_GUIDE.md"
echo ""
