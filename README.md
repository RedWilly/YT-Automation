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

1. **Start the bot:**

```bash
bun run index.ts
```

2. **Use the Telegram bot:**

- Open your bot in Telegram
- Send `/start` to see instructions
- Send `/upload` and then upload your audio file
- Wait for the bot to process and return your video

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
│   ├── types.ts              
│   └── services/
│       ├── assemblyai.ts      # AssemblyAI transcription service
│       ├── transcript.ts      # Transcript processing and chunking
│       ├── deepseek.ts        # DeepSeek LLM service
│       ├── images.ts          # Image search and download
│       └── video.ts           # FFmpeg video generation
├── tmp/
│   ├── audio/                 # Temporary audio files
│   ├── images/                # Downloaded images
│   └── video/                 # Generated videos
├── dim.ts                     # DuckDuckGo image search utility
├── index.ts                   # Main entry point
└── .env                       # Environment variables (not in git but see .env.example)
```

## Development

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

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
