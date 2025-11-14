# Setup Guide

Get v2v running on your machine in a few minutes.

## Prerequisites

You'll need these installed first:

**Bun** (JavaScript runtime):
```powershell
# Windows
irm bun.sh/install.ps1 | iex
```

**FFmpeg** (video processing):
```powershell
# Windows - pick one:
winget install FFmpeg

# Or download from https://ffmpeg.org/download.html
```

Verify FFmpeg works:
```powershell
ffmpeg -version
```

## Get Your API Keys

### Required Services

**Telegram Bot**
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy your bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

**AssemblyAI** (Audio transcription)
1. Sign up at [assemblyai.com](https://www.assemblyai.com/)
2. Grab your API key from the dashboard
3. Free tier includes 5 hours of transcription

**DeepSeek** (LLM for scene descriptions)
1. Sign up at [platform.deepseek.com](https://platform.deepseek.com/)
2. Create an API key in the API Keys section
3. Very affordable pricing (much cheaper than OpenAI)

### Optional Services

**Cloudflare Workers** (Unlimited AI image generation)

If you want AI-generated images instead of web search, you'll need to set up a Cloudflare Worker.

Watch this tutorial to set it up: **[Unlimited AI Images with Cloudflare Workers](https://www.youtube.com/watch?v=VliEpQl06pE)**

Once set up, add to your `.env`:
```env
USE_AI_IMAGE=true
WORKER_API_URL=https://your-worker.username.workers.dev/
WORKER_API_KEY=your_worker_api_key
```

**MinIO or AWS S3** (Video storage)

If you want to automatically upload finished videos to object storage (useful for downstream processing like YouTube uploads via n8n):

*Option 1: Self-hosted MinIO*
1. Install MinIO on your server: [min.io/download](https://min.io/download)
2. Create a bucket (e.g., `finished-videos`)
3. Generate access and secret keys

*Option 2: AWS S3*
1. Create an S3 bucket in AWS
2. Generate IAM credentials with S3 write permissions
3. Use your S3 endpoint and credentials

Add to your `.env`:
```env
MINIO_ENABLED=true
MINIO_ENDPOINT=https://minio.yourdomain.com  # or S3 endpoint
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key
MINIO_BUCKET=finished-videos
MINIO_REGION=us-east-1  # optional
```

## Configure the Project

You can run v2v either directly with Bun or using Docker. Choose the method that works best for you.

### Option 1: Run with Bun (Local)

**Install dependencies:**
```bash
bun install
```

**Install the caption font:**
```bash
bun font/add.ts
```

**Set up your environment:**

Copy `.env.example` to `.env` and add your keys:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
ASSEMBLYAI_API_KEY=your_assemblyai_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here
```

Check `.env.example` for all available options (captions, pan effects, AI images, etc.).

**Start the bot:**
```bash
bun start
```

You should see:
```
[Main] ==================================================
[Main] v2v - Audio to Video Bot
[Main] ==================================================
[Bot] Starting Telegram bot...
[Bot] Bot is running! Send /start to begin.
```

### Option 2: Run with Docker

**Prerequisites:**
- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed

**Set up your environment:**

Copy `.env.example` to `.env` and add your keys (same as Option 1).

**Build and run:**
```bash
docker-compose up -d
```

**View logs:**
```bash
docker-compose logs -f
```

**Stop the bot:**
```bash
docker-compose down
```

**Rebuild after code changes:**
```bash
docker-compose up -d --build
```

**What's included:**
- FFmpeg and Resolve-Bold font are pre-installed
- Everything starts fresh on each restart
- Perfect for deployment platforms like Coolify

See **[DOCKER.md](DOCKER.md)** for more details and Coolify setup.

## Use the Bot

1. Find your bot on Telegram (search for the username you created)
2. Send `/start` to get started
3. Send `/upload` and upload an audio file
4. Wait a few minutes while it processes
5. Get your video back

## How Long Does It Take?

For a typical 2-minute audio file:
- Transcription: 1-3 minutes
- AI processing: 30-60 seconds
- Image generation/download: 1-2 minutes
- Video rendering: 30-60 seconds
- **Total: 3-7 minutes**

## Troubleshooting

**Bot doesn't respond**
- Double-check your `TELEGRAM_BOT_TOKEN` in `.env`
- Make sure the bot is running
- Look for errors in the console

**FFmpeg errors**
- Run `ffmpeg -version` to verify it's installed
- Make sure it's in your PATH
- Restart your terminal after installing

**Transcription fails**
- Verify your AssemblyAI key is correct
- Check you have credits in your account
- Make sure your audio file is a supported format (mp3, wav, ogg, etc.)

**DeepSeek API errors**
- Check your API key is correct
- Verify you have credits
- Make sure the API endpoint is accessible

## File Locations

The bot creates these directories automatically:
- `tmp/audio/` - Uploaded audio files
- `tmp/images/` - Downloaded or generated images
- `tmp/video/` - Finished videos

These are in `.gitignore` so they won't be committed.

## Optional Features

Once you have the basics working, check out these features in `.env.example`:

- **Captions** (`CAPTIONS_ENABLED`) - Word-by-word highlighted captions
- **Pan Effect** (`PAN_EFFECT`) - Subtle vertical pan on images
- **AI Images** (`USE_AI_IMAGE`) - Generate images with AI instead of web search
- **MinIO Upload** (`MINIO_ENABLED`) - Auto-upload videos to object storage
- **Debug Mode** (`DEBUG`) - Detailed logs for development

## Need Help?

If something's not working:
1. Check the console for error messages
2. Verify all your API keys are correct
3. Make sure FFmpeg and Bun are installed
4. Check that `tmp/` directories exist and are writable

