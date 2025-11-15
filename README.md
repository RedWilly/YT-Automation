# v2v

Turn audio into videos with AI-generated visuals and word-by-word captions.

Automatically convert audio files into engaging videos with AI-generated visuals 
and karaoke-style word-by-word captions. Perfect for content creators, podcasters, 
and anyone who wants to turn audio content into shareable videos.

Simply send an audio file to a Telegram bot and receive a fully produced video 
with matching images and synchronized captions. The bot uses AssemblyAI for 
accurate transcription, DeepSeek AI for generating scene descriptions, and FFmpeg 
for professional video rendering.

Features unlimited AI image generation via Cloudflare Workers, optional object 
storage integration (MinIO/AWS S3), and customizable caption styling. Built with 
TypeScript and Bun for high performance.

**[Setup Guide](SETUP.md)** • **[Docker Guide](DOCKER.md)** • **[License](LICENSE.md)**

---

## What it does

Send an audio file to a Telegram bot and get back a video with matching visuals and highlighted captions.

1. Upload audio through Telegram
2. AI transcribes it with word-level timestamps
3. AI generates visual descriptions for each scene
4. Images are created or downloaded automatically
5. Video is rendered with word-by-word highlighted captions
6. Finished video is sent back to you

**Processing time:** 3-7 minutes for a typical 2-minute audio file.

## Quick Start

### Run with Docker (Recommended)

**Prerequisites:**
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Telegram bot token ([get one from @BotFather](https://t.me/botfather))
- API keys for AssemblyAI and DeepSeek

**Setup:**
```bash
cp .env.example .env
# Edit .env and add your API keys
```

**Run:**
```bash
docker-compose up -d
```

See **[DOCKER.md](DOCKER.md)** for detailed Docker instructions.

### Run with Bun (Local)

**Prerequisites:**
- [Bun](https://bun.sh) runtime
- [FFmpeg](https://ffmpeg.org/) for video processing
- Telegram bot token and API keys

**Install:**
```bash
bun install
bun font/add.ts  # Install caption font
```

**Configure:**
```bash
cp .env.example .env
# Edit .env and add your API keys
```

**Run:**
```bash
bun start
```

See the **[Setup Guide](SETUP.md)** for detailed instructions, optional features, and API service setup.

## Features

- **Word-by-word captions** - Karaoke-style highlighting synced to audio
- **AI-generated visuals** - Automatic scene descriptions and image generation
- **Flexible image sources** - Use AI generation or web search
- **Pan effects** - Optional subtle motion on images
- **Object storage** - Auto-upload to MinIO or AWS S3
- **File support** - Handles audio files up to 20MB via Telegram Bot API or unlimited size via presigned URLs
- **Debug mode** - Detailed logging for development

## File Size Limits

**Telegram Bot API Limit:** 20MB maximum file size for downloads.

**For larger files**, you have two options:
1. **Compress your audio** to under 20MB before sending
2. **Use a file hosting service** (Google Drive, Dropbox, WeTransfer) and send the download link instead

e.g
```
 /url https://your-presigned-url.com/large-audio.mp3
```

or to type in /url and paste the URL in the next message

## Telegram Commands

- `/start` - Get started
- `/upload` - Upload an audio file to convert
- `/cleanup` - Clear temporary files

## Services Used

- **AssemblyAI** - Audio transcription with word-level timing
- **DeepSeek** - LLM for scene descriptions (affordable alternative to OpenAI)
- **Cloudflare Workers** (optional) - Unlimited AI image generation
- **MinIO/AWS S3** (optional) - Object storage for finished videos
- **Telegram** - Bot interface

## License

Licensed under OCL v1.0. Free for personal and non-commercial use. Commercial use is allowed if you contribute back to the project. See [LICENSE.md](LICENSE.md) for details.
