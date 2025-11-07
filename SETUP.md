# Setup Guide - YouTube Automation Workflow

## Step-by-Step Setup Instructions

### 1. Install Prerequisites

#### Install Bun (if not already installed)
```powershell
# Windows (PowerShell)
irm bun.sh/install.ps1 | iex
```

#### Install FFmpeg
```powershell
# Option 1: Using winget
winget install FFmpeg

# Option 2: Manual installation
# Download from https://ffmpeg.org/download.html
# Extract and add to PATH
```

Verify FFmpeg installation:
```powershell
ffmpeg -version
```

### 2. Get API Keys

#### Telegram Bot Token
1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` command
3. Follow the prompts to create your bot
4. Copy the bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

#### AssemblyAI API Key
1. Sign up at [AssemblyAI](https://www.assemblyai.com/)
2. Go to your dashboard
3. Copy your API key

#### DeepSeek API Key
1. Sign up at [DeepSeek](https://platform.deepseek.com/)
2. Go to API Keys section
3. Create a new API key
4. Copy the key

### 3. Configure Environment Variables

Edit the `.env` file in the project root:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# AssemblyAI Configuration
ASSEMBLYAI_API_KEY=a91397..your_key_here

# DeepSeek LLM Configuration
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

### 4. Install Dependencies

```bash
bun install
```

This will install:
- `telegraf` - Telegram bot framework
- `dotenv` - Environment variable loader
- Other required dependencies

### 5. Test the Setup

Run the bot:
```bash
bun run index.ts
```

You should see:
```
==================================================
YouTube Automation Workflow
==================================================

[Bot] Starting Telegram bot...
[Bot] Bot is running! Send /start to begin.
```

### 6. Use the Bot

1. Open Telegram and find your bot (search for the username you created)
2. Send `/start` to see the welcome message
3. Send `/upload` to begin the workflow
4. Upload an audio or voice file
5. Wait for the bot to process (this may take several minutes)
6. Receive your completed video!

## Workflow Timeline

For a typical 2-minute audio file:
- **Upload & Transcription**: 1-3 minutes
- **AI Processing**: 30-60 seconds
- **Image Download**: 1-2 minutes (depends on number of segments)
- **Video Generation**: 30-60 seconds
- **Total**: ~3-7 minutes

## Troubleshooting

### Bot doesn't respond
- Check that `TELEGRAM_BOT_TOKEN` is correct in `.env`
- Verify the bot is running (`bun run index.ts`)
- Check console for error messages

### FFmpeg errors
- Verify FFmpeg is installed: `ffmpeg -version`
- Ensure FFmpeg is in your PATH
- On Windows, restart your terminal after installing FFmpeg

### Transcription fails
- Verify `ASSEMBLYAI_API_KEY` is correct
- Check your AssemblyAI account has credits
- Ensure audio file is in a supported format (mp3, wav, ogg, etc.)

### Image download fails
- DuckDuckGo may rate-limit requests
- Check your internet connection
- The bot will continue even if some images fail

### DeepSeek API errors
- Verify `DEEPSEEK_API_KEY` is correct
- Check your DeepSeek account has credits
- Ensure the API endpoint is accessible

## File Locations

- **Audio files**: `tmp/audio/`
- **Downloaded images**: `tmp/images/`
- **Generated videos**: `tmp/video/`

These directories are automatically created and are excluded from git (in `.gitignore`).

## Next Steps

Once you've verified the workflow works:

1. **Test with different audio files** to ensure reliability
2. **Monitor the console output** to understand the workflow
3. **Check the generated videos** for quality
4. **Adjust parameters** in `src/constants.ts` if needed:
   - `WORDS_PER_SEGMENT` - Change segment size (default: 100 words)
   - `POLL_INTERVAL_MS` - Change polling frequency (default: 10 seconds)
   - `MAX_POLL_ATTEMPTS` - Change max wait time (default: 60 attempts = 10 minutes)

## Future Enhancements

- **YouTube Upload**: Replace Telegram video send with YouTube API upload
- **Cleanup**: Add automatic cleanup of `tmp/` directories after successful upload
- **Queue System**: Handle multiple requests concurrently
- **Progress Tracking**: More detailed progress updates
- **Error Recovery**: Retry failed steps automatically
- **Custom Styling**: Add text overlays, transitions, effects to videos

## Support

If you encounter issues:
1. Check the console output for detailed error messages
2. Verify all API keys are correct
3. Ensure all prerequisites are installed
4. Check that the `tmp/` directories exist and are writable

