# Production Deployment Guide

This guide covers deploying Sygen Admin Panel in a production environment.

## Reverse Proxy (Nginx)

Place Sygen Admin behind Nginx for SSL termination, caching, and WebSocket proxying.

### Nginx Configuration

```nginx
upstream sygen_admin {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name admin.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name admin.example.com;

    ssl_certificate     /etc/letsencrypt/live/admin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.example.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Proxy to Sygen Admin
    location / {
        proxy_pass http://sygen_admin;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /ws/ {
        proxy_pass http://sygen_admin;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Static assets caching
    location /_next/static/ {
        proxy_pass http://sygen_admin;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
}
```

### Proxying Sygen Core API

If the admin panel and Sygen Core are on the same server, you can also proxy the API:

```nginx
upstream sygen_core {
    server 127.0.0.1:8799;
}

server {
    # ... SSL config from above ...

    location /api/ {
        proxy_pass http://sygen_core;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/admin {
        proxy_pass http://sygen_core;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

In this setup, set `NEXT_PUBLIC_SYGEN_API_URL` to `https://admin.example.com` (same origin) to avoid CORS issues.

## SSL/TLS

### Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d admin.example.com

# Auto-renewal is configured automatically
# Verify with:
sudo certbot renew --dry-run
```

### Self-Signed (Development/Internal)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/sygen-admin.key \
  -out /etc/ssl/certs/sygen-admin.crt \
  -subj "/CN=admin.internal"
```

## Resource Requirements

### Minimum

| Resource | Value |
|----------|-------|
| CPU | 1 vCPU |
| RAM | 512 MB |
| Disk | 500 MB |
| Network | Outbound access to Sygen Core API |

### Recommended

| Resource | Value |
|----------|-------|
| CPU | 2 vCPU |
| RAM | 1 GB |
| Disk | 1 GB |
| Network | Low-latency connection to Sygen Core |

> The admin panel is a lightweight Next.js standalone server. The Node.js runtime uses ~80-150 MB at idle. Resource usage scales with concurrent users.

## Docker Production Setup

### docker-compose.prod.yml

```yaml
services:
  sygen-admin:
    image: ghcr.io/alexeymorozua/sygen-admin:latest
    # Or build locally:
    # build: .
    ports:
      - "127.0.0.1:3000:3000"  # Bind to localhost only (Nginx fronts it)
    environment:
      - NEXT_PUBLIC_SYGEN_API_URL=http://your-sygen-server:8799
      - NEXT_PUBLIC_SYGEN_API_TOKEN=${SYGEN_API_TOKEN}
      - NEXT_PUBLIC_USE_MOCK=false
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
```

```bash
docker compose -f docker-compose.prod.yml up -d
```

## Monitoring

### Health Check

The admin panel serves a standard Next.js page at `/`. For API-level health checks, monitor the Sygen Core endpoint:

```bash
# Check admin panel is up
curl -f http://localhost:3000/ > /dev/null 2>&1 && echo "OK" || echo "DOWN"

# Check Sygen Core API health
curl -f http://your-sygen-server:8799/health
```

### Container Health

```bash
# Docker health status
docker inspect --format='{{.State.Health.Status}}' sygen-admin

# Container logs
docker logs sygen-admin --tail 100 -f

# Resource usage
docker stats sygen-admin
```

### Log Aggregation

For centralized logging, add a logging driver to your Docker config:

```yaml
services:
  sygen-admin:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## Updating

### Docker

```bash
# Pull latest image
docker pull ghcr.io/alexeymorozua/sygen-admin:latest

# Recreate container
docker compose -f docker-compose.prod.yml up -d

# Or with zero downtime (if using multiple replicas):
docker compose -f docker-compose.prod.yml up -d --no-deps sygen-admin
```

### Manual Build

```bash
cd sygen-admin
git pull origin main
npm install
npm run build
# Restart the process (systemd, pm2, etc.)
pm2 restart sygen-admin
```

### Version Pinning

For stability, pin to a specific version tag instead of `latest`:

```yaml
image: ghcr.io/alexeymorozua/sygen-admin:v1.2.0
```

## Running with PM2 (without Docker)

```bash
# Install PM2
npm install -g pm2

# Start the app
pm2 start npm --name "sygen-admin" -- start

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

## Running with systemd (without Docker)

Create `/etc/systemd/system/sygen-admin.service`:

```ini
[Unit]
Description=Sygen Admin Panel
After=network.target

[Service]
Type=simple
User=sygen
WorkingDirectory=/opt/sygen-admin
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable sygen-admin
sudo systemctl start sygen-admin
```

## Troubleshooting

### Cannot connect to Sygen Core

**Symptoms:** Dashboard shows "Offline", API calls fail with network errors.

**Solutions:**
1. Verify Sygen Core is running and API is enabled:
   ```bash
   curl http://your-sygen-server:8799/health
   ```
2. Check `NEXT_PUBLIC_SYGEN_API_URL` is correct and reachable from the admin panel's network
3. If using Docker, ensure the admin container can reach the Sygen Core host:
   ```bash
   docker exec sygen-admin wget -qO- http://your-sygen-server:8799/health
   ```
4. If both services are on the same Docker host, use `host.docker.internal` or a Docker network:
   ```yaml
   services:
     sygen-admin:
       extra_hosts:
         - "host.docker.internal:host-gateway"
       environment:
         - NEXT_PUBLIC_SYGEN_API_URL=http://host.docker.internal:8799
   ```

### WebSocket connection failed

**Symptoms:** Chat page shows "Disconnected", real-time updates don't work.

**Solutions:**
1. Ensure your reverse proxy supports WebSocket upgrades (see Nginx config above)
2. Check that `proxy_read_timeout` is set high enough (at least `86400` for long-lived connections)
3. If behind a load balancer, enable sticky sessions or WebSocket support
4. Verify the WebSocket URL matches the API URL scheme (`wss://` for HTTPS, `ws://` for HTTP)

### JWT token expired

**Symptoms:** Sudden redirect to login page, 401 errors in console.

**Solutions:**
1. The admin panel auto-refreshes tokens. If refresh also fails, the Sygen Core JWT secret may have changed
2. Clear browser local storage and re-login:
   - Open DevTools > Application > Local Storage
   - Delete `sygen_access_token` and `sygen_refresh_token`
3. Verify `jwt_secret` in Sygen Core config hasn't been rotated without a re-login

### CORS issues

**Symptoms:** Browser console shows `Access-Control-Allow-Origin` errors.

**Solutions:**
1. **Best fix:** Put both admin panel and API behind the same domain using Nginx (see "Proxying Sygen Core API" above)
2. If they must be on separate domains, configure CORS in Sygen Core's `config.json`:
   ```json
   {
     "api": {
       "cors_origins": ["https://admin.example.com"]
     }
   }
   ```
3. Do not use `"*"` for `cors_origins` in production

### Mock mode is active in production

**Symptoms:** Data looks fake, changes don't persist.

**Solutions:**
1. Ensure `NEXT_PUBLIC_USE_MOCK=false` is set
2. Since `NEXT_PUBLIC_` variables are embedded at build time, you must **rebuild** the Docker image after changing them:
   ```bash
   docker compose build --no-cache
   docker compose up -d
   ```

### High memory usage

**Symptoms:** Container restarts, OOM errors.

**Solutions:**
1. The standalone Next.js server typically uses 80-150 MB. If usage is higher:
   ```bash
   docker stats sygen-admin
   ```
2. Set memory limits in Docker Compose to prevent runaway usage
3. Check for memory leaks in browser DevTools if the issue is client-side
