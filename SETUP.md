# v2v Setup Guide

Everything you need to get v2v running and understand how it works.

---

## What is v2v?

v2v is a Telegram bot that turns audio files into videos. Send it an audio file and it:

1. Transcribes the audio (AssemblyAI)
2. Generates image descriptions using an LLM (DeepSeek/Kimi)
3. Creates or finds images for each scene
4. Renders a video with synced captions and visual effects
5. Optionally uploads to cloud storage

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-repo/v2v.git
cd v2v
bun install

# Install caption font
bun font/add.ts

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start the bot
bun start
```

---

## Prerequisites

### Required Software

**Bun** (JavaScript runtime)
```powershell
# Windows
irm bun.sh/install.ps1 | iex

# Linux/macOS
curl -fsSL https://bun.sh/install | bash
```

**FFmpeg** (video processing)
```powershell
# Windows
winget install FFmpeg

# Linux
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

Verify with `ffmpeg -version`.

---

## API Keys

### Required

| Service | What it does | Where to get it |
|---------|--------------|-----------------|
| **Telegram Bot** | Receives audio, sends videos | [@BotFather](https://t.me/botfather) |
| **AssemblyAI** | Transcribes audio to text | [assemblyai.com](https://www.assemblyai.com/) |
| **DeepSeek or Kimi** | Generates image descriptions | [DeepSeek](https://platform.deepseek.com/) or [Kimi](https://platform.moonshot.cn/) |

### Optional

| Service | What it does | Where to get it |
|---------|--------------|-----------------|
| **Cloudflare Worker** | AI image generation (SDXL) | See tutorial below |
| **Together AI** | AI image generation (FLUX) | [together.ai](https://www.together.ai/) |
| **ImageFX** | Google IMAGEN 3.5 | Requires Google cookie |
| **MinIO/S3** | Video cloud storage | Self-host or AWS |

---

## Environment Configuration

Copy `.env.example` to `.env` and configure:

### Core Settings

```env
# Telegram bot token from BotFather
TELEGRAM_BOT_TOKEN=your_token_here

# Access control (leave empty to allow everyone)
ALLOWED_USER_IDS=123456789, 987654321
ALLOWED_CHAT_IDS=-1001234567890

# Debug mode: true = verbose logs, false = minimal logs
DEBUG=false
```

### Transcription

```env
# AssemblyAI (required) - 5 free hours/month
ASSEMBLYAI_API_KEY=your_key_here
```

### LLM Provider

Pick one:

```env
# Which provider to use: "deepseek" or "kimi"
AI_PROVIDER=deepseek

# DeepSeek (recommended, affordable)
DEEPSEEK_API_KEY=your_key_here

# Kimi (alternative)
KIMI_API_KEY=your_key_here

# Batch size for long transcripts (reduce to 40 if you see errors)
LLM_SEGMENTS_PER_BATCH=60
```

### Image Generation

```env
# true = AI generates images, false = web search via DuckDuckGo
USE_AI_IMAGE=false

# Which AI model: "cloudflare", "togetherai", or "imagefx"
AI_IMAGE_MODEL=cloudflare

# Cloudflare Worker settings
WORKER_API_URL=https://your-worker.username.workers.dev/
WORKER_API_KEY=your_worker_key

# Together AI settings
TOGETHER_API_KEY=your_key_here

# ImageFX (Google IMAGEN 3.5) - requires cookie from browser
GOOGLE_COOKIE=your_google_cookie
```

### Cloud Storage (Optional)

```env
MINIO_ENABLED=false
MINIO_ENDPOINT=https://minio.yourdomain.com
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key
MINIO_BUCKET=finished-videos
```

---

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/upload` | Upload audio directly |
| `/url` | Process audio from URL (for files >20MB) |
| `/styles` | List available video styles |
| `/queue` | Check processing queue |
| `/cleanup` | Delete temp files |
| `/help` | Show all commands |

### Sending Audio

**Direct upload:** Just send an audio file (mp3, wav, ogg, m4a).

**URL upload:** For larger files:
```
/url https://storage.example.com/audio.mp3
```

---

## Video Styles

Styles control the visual output: image aesthetic, captions, effects.

### Available Styles

| Style | Hashtag | Description |
|-------|---------|-------------|
| History | `#history` | Watercolor paintings, karaoke captions, dynamic effects |
| WW2 | `#ww2` | Black-and-white archival photos, bold white captions |
| Stick Figure | `#stickfigure` | Minimal black lines on white, expressive poses |
| Explainer | `#explainer` | Flat 2D Kurzgesagt-style illustrations |
| Stick | `#stick` | Comic-style stick figures with speech bubbles |

### Using Styles

Add a hashtag when sending audio:
```
#history
```

Or with URL:
```
/url https://example.com/audio.mp3 #ww2
```

### Command-Line Options

Override style defaults:

```
#history --pan          # Enable pan effect
#history --no-pan       # Disable pan effect
#ww2 --karaoke          # Enable karaoke highlighting
#history --no-karaoke   # Disable karaoke highlighting
#history --highlight=yellow   # Change highlight color
#history --box          # Use highlight box
#history --short        # Vertical video (9:16 for shorts)
```

Combine options:
```
#ww2 --karaoke --highlight=yellow --pan
#stickfigure --short --karaoke
```

---

## Style Configuration Reference

Each style has these key settings:

### Video Effects

| Setting | Type | Description |
|---------|------|-------------|
| `panEffect` | boolean | Global pan effect when `naturalEdit` is off |
| `naturalEdit` | boolean | LLM assigns shot types per segment |
| `orientation` | `"horizontal"` or `"vertical"` | Video aspect ratio |

### Natural Editing (Shot Types)

When `naturalEdit: true`, the LLM assigns a shot type to each segment:

| Shot Type | Effect | Image Ratio |
|-----------|--------|-------------|
| `"pan"` | Vertical pan up/down | 4:3 (for headroom) |
| `"zoom"` | Center zoom in (1.0→1.1) or out (1.1→1.0) | 16:9 |
| `"static"` | No movement | 16:9 |

This creates visual variety instead of every shot having the same effect.

**How `panEffect` and `naturalEdit` interact:**

| `naturalEdit` | `panEffect` | What happens |
|---------------|-------------|--------------|
| `true` | (ignored) | LLM decides per segment |
| `false` | `true` | All segments pan |
| `false` | `false` | All segments static |

### Segmentation

Segmentation controls how the transcript is split into scenes (one image per segment).

| Setting | Values | Description |
|---------|--------|-------------|
| `segmentationType` | `"sentence"` | Split at sentence boundaries (natural pauses) |
| `segmentationType` | `"wordCount"` | Split every N words regardless of sentences |
| `wordsPerSegment` | number | Words per segment (only used with "wordCount") |

**When to use each:**

- **`"sentence"`** - Best for narrative content (stories, history, explainers). Creates natural visual pacing that matches speech patterns.

- **`"wordCount"`** - Best for content without clear sentence structure (poetry, lyrics, lists). Ensures consistent segment lengths.

**How `naturalEdit` affects segmentation:**

When `naturalEdit: true`, segments longer than ~5 seconds are automatically split into smaller chunks. This prevents any single image from staying on screen too long, creating more dynamic pacing. The LLM also assigns shot types (pan/zoom/static) to each chunk.

**Example:**
A 12-second sentence might become two 6-second segments, each with its own image and effect.

### Captions

| Setting | Type | Description |
|---------|------|-------------|
| `captionsEnabled` | boolean | Show captions on video |
| `minWordsPerCaption` | number | Minimum words per caption line |
| `maxWordsPerCaption` | number | Maximum words per caption line |
| `captionStyle` | object | Font, colors, position, outline |
| `highlightStyle` | object | Karaoke highlight color and style |

**Caption colors** use ASS format `&HAABBGGRR` (alpha, blue, green, red):
- `&H00FFFFFF` = White
- `&H00000000` = Black  
- `&H000000FF` = Red

---

## Creating Custom Styles

Create a new file in `src/styles/presets/`:

```typescript
// src/styles/presets/mystyle.ts
import type { VideoStyle } from "../types.ts";

export const myStyle: VideoStyle = {
  id: "mystyle",
  name: "My Custom Style",
  description: "A custom style for my videos",

  // Image generation prompt
  imageStyle: "Your artistic style description here...",
  negativePrompt: "watermarks, text, blurry, low quality",

  // How to split transcript
  segmentationType: "sentence",
  wordsPerSegment: 0,

  // Captions
  captionsEnabled: true,
  minWordsPerCaption: 3,
  maxWordsPerCaption: 6,
  captionStyle: {
    fontName: "Resolve-Bold",
    fontSize: 72,
    primaryColor: "&H00FFFFFF",
    outlineColor: "&H00000000",
    backgroundColor: "&H80000000",
    outlineWidth: 3,
    shadowDepth: 0,
    useBox: false,
    alignment: 2,
    marginV: 130,
    marginVVertical: 550,
    marginL: 10,
    marginR: 10,
    scaleX: 100,
    scaleY: 100,
    letterSpacing: 0,
    bold: true,
    italic: false,
    uppercase: true,
  },
  highlightStyle: {
    enabled: true,
    color: "&H00FF008B",
    useBox: true,
    outlineWidth: 2,
  },

  // Video effects
  panEffect: false,
  naturalEdit: true,  // LLM assigns pan/zoom/static per segment

  // Instructions for the LLM
  llmContext: `Generate image prompts in your style. Focus on...`,
};
```

Register in `src/styles/index.ts`:

```typescript
import { myStyle } from "./presets/mystyle.ts";

export const STYLES: Record<string, VideoStyle> = {
  // ... existing styles
  mystyle: myStyle,
};
```

Use with `#mystyle`.

---

## Project Structure

```
src/
├── bot/              # Telegram bot handlers
├── config/           # Environment and defaults
├── core/             # Main workflow orchestration
├── services/
│   ├── captions/     # ASS subtitle generation
│   ├── image/        # Image download and AI generation
│   ├── llm/          # LLM prompts and parsing
│   ├── segmentation/ # Transcript splitting
│   ├── storage/      # MinIO/S3 upload
│   ├── transcription/# AssemblyAI integration
│   └── video/
│       ├── ffmpeg/   # Modular FFmpeg filters
│       │   ├── effects/
│       │   │   ├── pan.ts    # Pan effect
│       │   │   ├── zoom.ts   # Zoom effect
│       │   │   └── static.ts # Static (no effect)
│       │   ├── dimensions.ts
│       │   ├── filters.ts
│       │   └── index.ts
│       └── generator.ts
├── styles/
│   ├── presets/      # Style definitions
│   └── types.ts      # Type definitions
├── types/            # Shared TypeScript types
└── utils/            # Logging, caching
```

---

## File Locations

| Directory | Contents |
|-----------|----------|
| `tmp/audio/` | Downloaded audio files |
| `tmp/images/` | Generated or found images |
| `tmp/video/` | Rendered videos and temp files |
| `tmp/cache.sqlite` | Caching for transcripts and LLM responses |

Use `/cleanup` to clear these folders.

---

## Processing Pipeline

1. **Download** - Audio saved to `tmp/audio/`
2. **Transcription** - AssemblyAI returns word-level timestamps
3. **Segmentation** - Transcript split into scenes
4. **LLM** - Generates image descriptions for each scene
5. **Image Generation** - AI creates or web finds images
6. **Caption Generation** - ASS subtitle file created
7. **FFmpeg Rendering** - Images + audio + captions combined
8. **Upload** (optional) - Video sent to cloud storage

### Caching

v2v uses SQLite caching to avoid redundant API calls. The cache has two layers:

**Audio-level cache** (shared across styles):
- AssemblyAI upload URL
- Transcript (words, timestamps, duration)

**Style-level cache** (per audio + style + orientation + naturalEdit):
- Segmented transcript
- LLM image queries
- Downloaded/generated images

**Cache key:** `audio_hash + style_id + orientation + natural_edit`

This means:
- Same audio with `#history` vs `#ww2` = different cache entries
- Same audio with `--short` (vertical) vs normal (horizontal) = different cache entries
- Same audio with `naturalEdit: true` vs `naturalEdit: false` = different cache entries
- If you change a style's prompts, old cache is still used (delete cache or use `/cleanup`)

**When cache is used:**
1. Send same audio twice → transcription skipped
2. Same audio + same style + same orientation + same naturalEdit mode → LLM and images skipped
3. Video rendering always runs fresh (never cached)

**Clearing cache:**
- `/cleanup` in Telegram deletes temp files
- Delete `tmp/cache.sqlite` to reset all caches

---

## Docker Deployment

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Rebuild after changes
docker-compose up -d --build
```

See [DOCKER.md](DOCKER.md) for Coolify and advanced options.

---

## Troubleshooting

### Bot doesn't respond
- Check `TELEGRAM_BOT_TOKEN` in `.env`
- Make sure `bun start` is running
- Look for errors in console

### FFmpeg errors
- Run `ffmpeg -version` to verify installation
- Restart terminal after installing
- Windows: ensure FFmpeg is in PATH

### Transcription fails
- Verify AssemblyAI key is correct
- Check account has credits
- Confirm audio format is supported

### LLM errors
- Check your API key is correct
- Verify you have API credits
- Try reducing `LLM_SEGMENTS_PER_BATCH` to 40

### Video too long to render
- Enable `naturalEdit` for shot variety
- Chunked rendering kicks in automatically for >8 images
- Check console for memory errors

---

## Debug Mode

Enable verbose logging:

```env
DEBUG=true
```

This shows:
- Full FFmpeg commands
- LLM prompts and responses
- Image generation details
- All API calls

---

## Processing Time Estimates

For a 2-minute audio file:

| Step | Time |
|------|------|
| Transcription | 1-3 min |
| LLM scene descriptions | 30-60 sec |
| Image generation | 1-2 min |
| Video rendering | 30-60 sec |
| **Total** | **3-7 min** |

Longer audio scales proportionally. The bot sends progress updates.

---

## Need Help?

1. Check console for error messages
2. Verify all API keys are correct
3. Make sure FFmpeg and Bun are installed
4. Run with `DEBUG=true` for detailed logs
5. Check that `tmp/` directories exist and are writable
