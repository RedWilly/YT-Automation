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

**[Setup Guide](SETUP.md)** • **[License](LICENSE.md)**

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

**Prerequisites:**
- [Bun](https://bun.sh) runtime
- [FFmpeg](https://ffmpeg.org/) for video processing
- Telegram bot token ([get one from @BotFather](https://t.me/botfather))
- API keys for AssemblyAI and DeepSeek

**Install:**
```bash
bun install
bun font/add.ts  # Install caption font
```

**Configure:**

Copy `.env.example` to `.env` and add your API keys:
```env
TELEGRAM_BOT_TOKEN=your_bot_token
ASSEMBLYAI_API_KEY=your_assemblyai_key
DEEPSEEK_API_KEY=your_deepseek_key
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
- **Debug mode** - Detailed logging for development

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
