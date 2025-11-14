# Docker Deployment Guide

Run v2v in a Docker container with FFmpeg and Resolve-Bold font pre-installed.

## Quick Start

**1. Set up environment:**
```bash
cp .env.example .env
# Edit .env and add your API keys
```

**2. Build and run:**
```bash
docker-compose up -d
```

**3. Check logs:**
```bash
docker-compose logs -f
```

That's it! The bot is now running in a container.

## What's Included

The Docker image automatically includes:
- **Bun runtime** (v1.3.1)
- **FFmpeg** (latest from Alpine repos)
- **Resolve-Bold font** (pre-installed and cached)
- **Font utilities** (fontconfig, fc-cache)
- **All dependencies** (from package.json)

Everything starts fresh on each restart - no persistent data.

## Common Commands

**Start the bot:**
```bash
docker-compose up -d
```

**Stop the bot:**
```bash
docker-compose down
```

**Restart the bot:**
```bash
docker-compose restart
```

**View logs:**
```bash
# Follow logs in real-time
docker-compose logs -f

# View last 100 lines
docker-compose logs --tail=100
```

**Rebuild after code changes:**
```bash
docker-compose up -d --build
```

**Access container shell:**
```bash
docker-compose exec v2v-bot sh
```

**Verify font is installed:**
```bash
docker-compose exec v2v-bot fc-list | grep -i resolve
```

**Check FFmpeg:**
```bash
docker-compose exec v2v-bot ffmpeg -version
```

## Using with Coolify

Coolify makes deployment even easier:

1. **Connect your Git repository** to Coolify
2. **Set environment variables** in Coolify's UI (copy from `.env.example`)
3. **Deploy** - Coolify will automatically detect the Dockerfile and build

Coolify handles:
- Automatic builds on git push
- Environment variable management
- Log viewing
- Container restarts
- SSL certificates (if needed)

## Troubleshooting

**Container won't start:**
```bash
# Check logs for errors
docker-compose logs

# Rebuild from scratch
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**Font not found:**
```bash
# Verify font is installed
docker-compose exec v2v-bot fc-list | grep -i resolve

# Rebuild if font is missing
docker-compose up -d --build
```

**FFmpeg errors:**
```bash
# Check FFmpeg version
docker-compose exec v2v-bot ffmpeg -version
```

**Clean up old images:**
```bash
# Remove old images and containers
docker system prune -a
```

