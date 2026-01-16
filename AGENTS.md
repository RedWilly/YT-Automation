# AGENTS.md

## Commands
- **Run**: `bun run start` (starts Telegram bot)
- **Typecheck**: `bun run typecheck`
- **Single test**: `bun test src/path/to/file.test.ts`
- **All tests**: `bun test`

## Architecture
Audio-to-video Telegram bot using Bun runtime. Converts audio → transcript → AI-generated images → video.
- `src/bot/` - Telegram bot handlers and commands (Telegraf)
- `src/services/` - Core services: transcription (AssemblyAI), LLM, image generation, video (FFmpeg), storage (MinIO)
- `src/config/` - Environment config with typed validation; `environment.ts` exports provider configs
- `src/core/` - Workflow orchestration and job queue
- `src/styles/` - Visual style presets for video generation

## Code Style
- TypeScript with strict mode, ESNext target, Bun bundler
- Use `.ts` extension in imports (e.g., `import { foo } from "./bar.ts"`)
- Named exports preferred; use `export const` for config objects with `as const`
- Centralized logging via `src/utils/logger.ts` (`logger.log()`, `logger.error()`)
- Environment helpers: `envString()`, `envNumber()`, `envBool()` from `src/utils/env.ts`
- Tests use `bun:test` (`describe`, `test`, `expect`), placed in `__tests__/` folders
