# v2v

Turn audio into videos with AI-generated visuals and word-by-word captions.

Send an audio file to a Telegram bot and get back a video with matching images and synced captions. Uses AssemblyAI for transcription, your choice of LLM (DeepSeek or Kimi) for scene descriptions, and FFmpeg for video rendering.

Built with TypeScript and Bun. Supports multiple video styles, AI image generation via Cloudflare Workers or Together AI, and optional MinIO/S3 upload.

**[Setup Guide](SETUP.md)** • **[Docker Guide](DOCKER.md)** • **[License](LICENSE.md)**

---

## How it works

1. Upload audio through Telegram (or send a URL)
2. AI transcribes it with word-level timestamps
3. AI generates image descriptions for each segment
4. Images are generated (AI) or searched (DuckDuckGo)
5. Video is rendered with word-by-word captions
6. You get the finished video back

**Processing time:** 3-7 minutes for a typical 2-minute audio.

## Quick Start

### Run with Docker (Recommended)

**Prerequisites:**
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Telegram bot token ([get one from @BotFather](https://t.me/botfather))
- API keys for AssemblyAI and your chosen AI provider (DeepSeek or Kimi)

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

## Video Styles

The bot supports different video styles. Add a hashtag when sending audio to pick a style:

| Style | Hashtag | Look |
|-------|---------|------|
| History | `#history` (default) | Oil painting aesthetic, karaoke captions, pan effect |
| WW2 | `#ww2` | Black-and-white archival photos, simple white captions |

You can also override specific settings with options:

```
#history --pan              # Enable pan effect
#ww2 --karaoke              # Enable karaoke highlighting
#history --highlight=yellow # Change highlight color
#ww2 --no-pan               # Disable pan effect
```

Send `/styles` in Telegram to see all available styles and options.

## Commands

| Command | What it does |
|---------|--------------|
| `/start` | Get started |
| `/upload` | Upload an audio file |
| `/url` | Process audio from a URL |
| `/queue` | Check pending jobs |
| `/styles` | List available styles |
| `/help` | Show usage instructions |
| `/cleanup` | Clear temp files |

## Large Files

Telegram limits downloads to 20MB. For bigger files:
- Compress your audio first, or
- Upload to a file host and use `/url <link>`

```
/url https://example.com/large-audio.mp3 #history
```

## Services

- **AssemblyAI** - Transcription with word-level timing
- **DeepSeek / Kimi** - LLM for scene descriptions
- **Cloudflare Workers** - AI image generation (SDXL 1.0)
- **Together AI** - AI image generation (FLUX.1-schnell)
- **MinIO / AWS S3** - Optional video storage

## License

OCL v1.0. Free for personal use. Commercial use requires contributing back. See [LICENSE.md](LICENSE.md).
