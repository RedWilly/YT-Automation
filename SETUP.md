# Setup Guide

This guide covers everything you need to get v2v running and how to use all its features.

## What is v2v?

v2v is a Telegram bot that converts audio files into videos. You send it an audio file, and it:

1. Transcribes the audio using AssemblyAI
2. Uses an LLM (DeepSeek or Kimi) to generate image descriptions for each segment
3. Either searches the web for images or generates them with AI
4. Creates a video with captions synced to the audio
5. Optionally uploads the finished video to cloud storage

---

## Prerequisites

### Bun (JavaScript runtime)

```powershell
# Windows
irm bun.sh/install.ps1 | iex
```

```bash
# Linux/macOS
curl -fsSL https://bun.sh/install | bash
```

### FFmpeg (video processing)

```powershell
# Windows
winget install FFmpeg
```

```bash
# Linux
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

Make sure it works:

```bash
ffmpeg -version
```

---

## Get Your API Keys

### Required

**Telegram Bot Token**

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy your bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

**AssemblyAI** (audio transcription)

1. Sign up at [assemblyai.com](https://www.assemblyai.com/)
2. Grab your API key from the dashboard
3. Free tier includes 5 hours of transcription

**LLM Provider** (choose one)

*DeepSeek (recommended):*
1. Sign up at [platform.deepseek.com](https://platform.deepseek.com/)
2. Create an API key
3. Very affordable pricing

*Kimi:*
1. Sign up at [platform.moonshot.cn](https://platform.moonshot.cn/)
2. Create an API key

### Optional

**Cloudflare Workers** (AI image generation)

If you want AI-generated images instead of web search, set up a Cloudflare Worker.

Tutorial: [Unlimited AI Images with Cloudflare Workers](https://www.youtube.com/watch?v=VliEpQl06pE)

**Together AI** (alternative AI image generation)

1. Sign up at [together.ai](https://www.together.ai/)
2. Create an API key
3. Uses FLUX.1-schnell model

**MinIO or S3** (video storage)

For automatic uploads to object storage:

1. Set up MinIO on your server or use AWS S3
2. Create a bucket (e.g., `finished-videos`)
3. Generate access credentials

---

## Installation

### Clone and install

```bash
git clone https://github.com/your-repo/v2v.git
cd v2v
bun install
```

### Install the caption font

```bash
bun font/add.ts
```

This installs the Resolve-Bold font used for video captions. Run it once.

### Configure environment

Copy the example file:

```bash
cp .env.example .env
```

Edit `.env` with your keys:

```env
# Required
TELEGRAM_BOT_TOKEN=your_bot_token_here
ASSEMBLYAI_API_KEY=your_assemblyai_key_here

# LLM Provider (choose one)
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_deepseek_key_here
# KIMI_API_KEY=your_kimi_key_here

# Optional: AI image generation
USE_AI_IMAGE=false
AI_IMAGE_MODEL=cloudflare
WORKER_API_URL=https://your-worker.username.workers.dev/
WORKER_API_KEY=your_worker_api_key
# TOGETHER_API_KEY=your_together_key_here

# Optional: Cloud storage
MINIO_ENABLED=false
MINIO_ENDPOINT=https://minio.yourdomain.com
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key
MINIO_BUCKET=finished-videos

# Optional: Debug mode
DEBUG=false
```

### Start the bot

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

---

## Using the Bot

### Basic Commands

| Command | What it does |
|---------|--------------|
| `/start` | Welcome message and quick start |
| `/upload` | Upload an audio file directly |
| `/url` | Process audio from a URL (for files >20MB) |
| `/styles` | List all available video styles |
| `/queue` | Check the processing queue |
| `/cleanup` | Delete temporary files |
| `/help` | Show all commands and options |

### Uploading Audio

**Method 1: Direct upload**

Just send an audio file (mp3, wav, ogg, m4a, etc.) to the bot. Files under 20MB work best.

**Method 2: URL upload**

For larger files, upload to cloud storage first (Cloudflare R2, S3, etc.) then:

```
/url https://your-storage.com/audio-file.mp3
```

The bot will download and process it.

### File Caching

If you upload the same file twice, the bot skips the download and uses the cached version. This saves time when re-processing.

---

## Video Styles

Styles control how your video looks: image aesthetic, captions, effects, and more.

### Available Styles

| Style | Hashtag | Description |
|-------|---------|-------------|
| History | `#history` | Watercolor painting aesthetic, karaoke captions with purple highlight, pan effect |
| WW2 | `#ww2` | Black-and-white archival photography, bold white captions, no pan |
| Stick Figure | `#stickfigure` | Minimalist black lines on white, expressive poses, zoom to fit |

### Using Styles

Add a hashtag when you send audio:

```
#history
```

Or with the URL command:

```
/url https://example.com/audio.mp3 #ww2
```

### Style Options

You can override style defaults with command-line flags:

**Pan effect** (subtle vertical camera movement)

```
#history --pan          # Enable pan effect
#history --no-pan       # Disable pan effect
```

**Karaoke highlighting** (word-by-word color change)

```
#ww2 --karaoke          # Enable karaoke
#history --no-karaoke   # Disable karaoke
```

**Highlight color** (for karaoke mode)

```
#history --highlight=yellow
#history --highlight=red
#history --highlight=cyan
#history --highlight=green
#history --highlight=orange
#history --highlight=pink
```

**Highlight box** (background behind highlighted word)

```
#history --box          # Show colored box behind word
#history --no-box       # Just change text color
```

### Combining Options

You can use multiple options together:

```
#ww2 --karaoke --highlight=yellow --pan
```

```
/url https://example.com/audio.mp3 #history --no-pan --highlight=red
```

---

## Style Configuration Details

Each style has specific settings that affect the output:

### History Style

- **Image style**: Watercolor painting with soft colors
- **Segmentation**: Sentence-based (natural breaks)
- **Captions**: Karaoke with purple highlight box
- **Pan effect**: Enabled (subtle vertical motion)
- **Zoom to fit**: Not needed (pan handles scaling)

### WW2 Style

- **Image style**: Black-and-white archival photography
- **Segmentation**: Word-count based (100 words per segment)
- **Captions**: Bold white text with thick shadow
- **Pan effect**: Disabled
- **Zoom to fit**: Disabled (letterbox/pillarbox with padding)

### Stick Figure Style

- **Image style**: Simple stick figures, black lines on white
- **Segmentation**: Sentence-based
- **Captions**: Black text with white outline, red highlight
- **Pan effect**: Disabled
- **Zoom to fit**: Enabled (scales to fill 1920x1080, crops edges)

---

## How the Zoom to Fit Setting Works

This controls how images are scaled to 1920x1080:

| Setting | panEffect | zoomToFit | Result |
|---------|-----------|-----------|--------|
| Pan enabled | `true` | ignored | Image scales to width, pans vertically |
| Zoom to fit | `false` | `true` | Image scales to fill, edges cropped |
| Letterbox | `false` | `false` | Image scales to fit, black bars added |

The stick figure style uses `zoomToFit: true` so images fill the entire frame without black borders.

---

## Image Generation

### Web Search (default)

By default, the bot searches DuckDuckGo for images matching each scene description. This is free but quality varies.

### AI Generation

Set `USE_AI_IMAGE=true` in your `.env` to generate images with AI.

**Cloudflare Workers** (`AI_IMAGE_MODEL=cloudflare`)

- Free tier available
- Requires setting up a worker (see tutorial link above)
- Uses Stable Diffusion XL

**Together AI** (`AI_IMAGE_MODEL=togetherai`)

- Pay-per-image pricing
- Uses FLUX.1-schnell
- Fast generation

The bot tries your primary provider first. If it fails, it falls back to the other one.

---

## Long Transcripts

For very long audio files, the LLM might struggle to generate all image queries at once. The bot automatically batches the transcript.

Control batch size in `.env`:

```env
LLM_SEGMENTS_PER_BATCH=60
```

Tips:

- Start with 60 segments per batch
- If you see errors or partial outputs, try 40
- Larger batches are faster but risk token limits

---

## Access Control

Limit who can use your bot by allowlisting specific users or groups.

```env
# Single user
ALLOWED_USER_IDS=123456789

# Multiple users
ALLOWED_USER_IDS=123456789, 987654321

# Allow a group chat
ALLOWED_CHAT_IDS=-1001234567890

# Combine users and groups
ALLOWED_USER_IDS=123456789
ALLOWED_CHAT_IDS=-1001234567890
```

Notes:

- If both lists are empty, the bot is open to everyone
- Supergroup IDs start with `-100`

**Find your IDs:**

- User ID: Message `@userinfobot` on Telegram
- Group ID: Add `@getidsbot` to a group and send a message

---

## Docker Deployment

### Build and run

```bash
docker-compose up -d
```

### View logs

```bash
docker-compose logs -f
```

### Stop

```bash
docker-compose down
```

### Rebuild after changes

```bash
docker-compose up -d --build
```

The Docker image includes FFmpeg and fonts pre-installed.

See [DOCKER.md](DOCKER.md) for Coolify and advanced deployment options.

---

## File Locations

The bot creates these directories automatically:

| Directory | Contents |
|-----------|----------|
| `tmp/audio/` | Uploaded/downloaded audio files |
| `tmp/images/` | Downloaded or generated images |
| `tmp/video/` | Finished videos and temp files |

Use `/cleanup` in Telegram to clear these folders.

---

## Processing Time

For a typical 2-minute audio file:

| Step | Time |
|------|------|
| Transcription | 1-3 minutes |
| LLM scene descriptions | 30-60 seconds |
| Image generation/download | 1-2 minutes |
| Video rendering | 30-60 seconds |
| **Total** | **3-7 minutes** |

Longer audio takes proportionally longer. The bot updates you with progress.

---

## Troubleshooting

### Bot doesn't respond

- Check your `TELEGRAM_BOT_TOKEN` in `.env`
- Make sure `bun start` is running
- Look for errors in the console

### FFmpeg errors

- Run `ffmpeg -version` to verify installation
- Restart your terminal after installing
- On Windows, make sure FFmpeg is in your PATH

### Transcription fails

- Verify your AssemblyAI key is correct
- Check you have credits in your account
- Make sure audio format is supported (mp3, wav, ogg, m4a)

### LLM errors

- Check your DeepSeek or Kimi key is correct
- Verify you have API credits
- Try reducing `LLM_SEGMENTS_PER_BATCH`

### Video renders but looks wrong

- Check image generation logs for failures
- Try a different style
- Verify FFmpeg is working correctly

### Images have black bars

- The style has `zoomToFit: false`
- Create a custom style with `zoomToFit: true` if you want images to fill the frame

---

## Creating Custom Styles

To add your own style, create a new file in `src/styles/`:

```typescript
// src/styles/mystyle.ts
import type { VideoStyle } from "./types.ts";

export const myStyle: VideoStyle = {
  id: "mystyle",
  name: "My Custom Style",
  description: "Description for /styles command",

  // Image generation
  imageStyle: "your image style prompt here",
  negativePrompt: "things to avoid in images",

  // Segmentation
  segmentationType: "sentence",  // or "wordCount"
  wordsPerSegment: 0,            // only used if wordCount

  // Captions
  captionsEnabled: true,
  minWordsPerCaption: 3,
  maxWordsPerCaption: 6,
  captionStyle: {
    fontName: "Resolve-Bold",
    fontSize: 72,
    primaryColor: "&H00FFFFFF",  // White (BGR format)
    outlineColor: "&H00000000",  // Black
    backgroundColor: "&H80000000",
    outlineWidth: 2,
    shadowDepth: 2,
    useBox: false,
  },
  highlightStyle: {
    enabled: true,
    color: "&H00FF008B",  // Purple
    useBox: true,
  },

  // Video effects
  panEffect: true,
  zoomToFit: false,  // Only used when panEffect is false

  // LLM context
  llmContext: `Instructions for the LLM on how to generate image prompts for this style...`,
};
```

Then register it in `src/styles/index.ts`:

```typescript
import { myStyle } from "./mystyle.ts";

export const STYLES: Record<string, VideoStyle> = {
  history: historyStyle,
  ww2: ww2Style,
  stickfigure: stickfigureStyle,
  mystyle: myStyle,  // Add your style here
};
```

Restart the bot and use `#mystyle` to try it.

---

## Need Help?

1. Check the console for error messages
2. Verify all API keys are correct
3. Make sure FFmpeg and Bun are installed
4. Run with `DEBUG=true` for detailed logs
5. Check that `tmp/` directories exist and are writable
