# YouTube Automation Workflow (v2v)

Automated workflow to convert voice-over audio into videos with AI-generated visual scenes.

## Features

- 🎙️ **Telegram Bot Integration** - Upload audio files via Telegram
- 📝 **AI Transcription** - Powered by AssemblyAI
- 🤖 **Visual Scene Generation** - DeepSeek LLM generates image search queries
- 🖼️ **Automatic Image Search** - DuckDuckGo image search
- 🎬 **Video Generation** - FFmpeg combines images with audio
- ⚡ **Built with Bun** - Fast TypeScript runtime

## Prerequisites

- [Bun](https://bun.sh) v1.3.1 or higher
- [FFmpeg](https://ffmpeg.org/) installed and available in PATH
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- AssemblyAI API Key
- DeepSeek API Key

## Installation

1. **Install dependencies:**

```bash
bun install
```

2. **Configure environment variables:**

Copy the `.env` file and fill in your API keys:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# AssemblyAI Configuration
ASSEMBLYAI_API_KEY=a91397..your_key_here

# DeepSeek LLM Configuration
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

3. **Install FFmpeg (Windows):**

Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH, or use:

```powershell
winget install FFmpeg
```

## Usage

### Production Mode (Telegram Bot)

1. **Start the bot:**

```bash
bun run index.ts
```

2. **Use the Telegram bot:**

- Open your bot in Telegram
- Send `/start` to see instructions
- Send `/upload` and then upload your audio file
- Wait for the bot to process and return your video

### Test Mode (Local Development)

For faster development and testing without Telegram:

1. **Place an audio file in `tmp/audio/` directory:**

```bash
# Example: copy your test audio file
cp my-test-audio.mp3 tmp/audio/
```

2. **Run the test workflow:**

```bash
# Test with a specific audio file
bun test-workflow.ts tmp/audio/my-test-audio.mp3

# Or let it auto-detect the first audio file in tmp/audio/
bun test-workflow.ts
```

3. **Check the output:**

The test workflow will:
- ✅ Transcribe the audio with AssemblyAI
- ✅ Generate image search queries with DeepSeek
- ✅ Download images from DuckDuckGo
- ✅ Generate the final video with FFmpeg
- ✅ Save the video to `tmp/video/`
- ❌ Skip sending to Telegram (test mode only)

**Benefits:**
- 🚀 Faster iteration (no Telegram upload/download)
- 🔍 Easier debugging with detailed logs
- 🧪 Test different audio files quickly
- 💻 Works offline (except API calls)

## Workflow Steps

1. **Receive Audio** - Telegram bot receives voice/audio file
2. **Upload to AssemblyAI** - Audio uploaded for transcription
3. **Transcribe** - AssemblyAI transcribes the audio
4. **Chunk Transcript** - Split into 100-word segments with timestamps
5. **Generate Queries** - DeepSeek LLM creates visual search queries
6. **Download Images** - DuckDuckGo image search and download
7. **Generate Video** - FFmpeg combines images with audio
8. **Send Video** - Telegram bot sends completed video

## Project Structure

```
v2v/
├── src/
│   ├── bot.ts                 # Telegram bot and workflow orchestration
│   ├── constants.ts           # Environment variables and configuration
│   ├── logger.ts              # Centralized logging utility (DEBUG mode support)
│   ├── types.ts               # TypeScript type definitions
│   └── services/
│       ├── assemblyai.ts      # AssemblyAI transcription service
│       ├── transcript.ts      # Transcript processing and chunking
│       ├── deepseek.ts        # DeepSeek LLM service
│       ├── images.ts          # Image search and download (with watermark filtering)
│       ├── video.ts           # FFmpeg video generation (memory-optimized)
│       └── utils/
│           └── dim.ts         # DuckDuckGo image search utility
├── tmp/
│   ├── audio/                 # Temporary audio files
│   ├── images/                # Downloaded images
│   └── video/                 # Generated videos
├── index.ts                   # Main entry point (production bot)
├── test-workflow.ts           # Test script for local development
└── .env                       # Environment variables (not in git but see .env.example)
```

## Development

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

### Debug Mode

Control logging verbosity with the `DEBUG` environment variable in `.env`:

**Lite Mode** (`DEBUG=false` - default):
```
[Bot] 📥 Audio downloaded
[AssemblyAI] ⏳ Uploading audio file
[AssemblyAI] ✓ Audio uploaded successfully
[Transcript] ⏳ Processing 81 words into segments
[Transcript] ✓ Created 2 segments total
[DeepSeek] ⏳ Generating image search queries
[Video] ✓ Video generated successfully
```

**Debug Mode** (`DEBUG=true`):
```
[Bot] 📥 Audio downloaded
[Bot] 🔍 Audio file saved to: C:\Users\...\tmp\audio\voice_123.ogg
[AssemblyAI] ⏳ Uploading audio file
[AssemblyAI] 🔍 Audio file path: C:\Users\...\tmp\audio\voice_123.ogg
[AssemblyAI] ✓ Audio uploaded successfully
[AssemblyAI] 🔍 Upload URL: https://cdn.assemblyai.com/upload/abc123
[Transcript] ⏳ Processing 81 words into segments
[Transcript] 🔍 Segment 1: 50 words, 0ms-15000ms
[Transcript] 🔍 Segment 2: 31 words, 15000ms-27360ms
[DeepSeek] 🔍 Formatted transcript:
[0–15000 ms]: Each wave crashes upon the shore...
[DeepSeek] 📄 Raw response content: [{"start":0,"end":15000,...}]
[Video] 🔍 FFmpeg command: ffmpeg -loop 1 -t 15 -i image1.jpg...
```

Set `DEBUG=true` in `.env` for detailed logs during development, or `DEBUG=false` for clean production logs.

### Performance Optimizations

The codebase follows performance best practices:
- Typed arrays for numeric data where applicable
- Object pooling for frequently allocated objects
- Efficient loops with cached lengths
- Minimal temporary object creation
- Proper memory management

## License

This project is `Licensed under OCL v1.0`.

- ✅ Free for personal, educational, and non-commercial use
- ✅ Modify and distribute freely for non-commercial purposes
- ✅ Commercial use welcome with contribution requirement

For commercial use, please review the [LICENSE](LICENSE) file to learn how to contribute back to the project.
