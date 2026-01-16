# Implementation Plan: Cache Cleanup & Context Prompt Enhancement

## Overview

Two main tasks:
1. **Enhance context extraction prompt** - Make LLM aware of segment bounds upfront (not just post-validation)
2. **Remove ALL legacy/deprecated code** - Clean slate, no backward compatibility wrappers

---

## Part 1: Context Prompt Enhancement

### Problem
The LLM sometimes returns `mentions` arrays with values like `[0-1500]` when there are only 238 segments. We validate and clamp AFTER the response, but the LLM should understand bounds upfront.

### Current State
- `buildExtractionUserPrompt()` says `"${segmentCount} segments"` but doesn't emphasize the bound
- System prompt mentions "segment indices" but doesn't enforce max value
- Post-validation clamps values silently

### Solution
Update prompts in `src/services/llm/context.ts`:

#### 1. Update `buildExtractionSystemPrompt()` (lines ~50-55, ~138-139, ~178-180)

**Current:**
```
- "firstMention" = the segment INDEX where entity first appears (e.g., 5 means segment [5])
- "mentions" = array of segment INDICES using range notation: ["0-5", "10-15"]
```

**New:**
```
- "firstMention" = segment INDEX (0 to N-1 where N = total segments). Example: if 238 segments, valid values are 0-237.
- "mentions" = segment INDICES in range notation. MUST be within [0, N-1]. Example for 50 segments: ["0-10", "20-30", "45-49"]
- VALUES OUTSIDE SEGMENT RANGE WILL BE REJECTED
```

#### 2. Update `buildExtractionUserPrompt()` (lines ~194-206)

**Current:**
```
# TRANSCRIPT (${segmentCount} segments)
${transcript}
```

**New:**
```
# TRANSCRIPT
Total Segments: ${segmentCount}
Valid Segment Index Range: 0 to ${segmentCount - 1}

CRITICAL: All "firstMention" and "mentions" values MUST be within 0-${segmentCount - 1}.
Any value >= ${segmentCount} is INVALID.

${transcript}
```

#### 3. Add explicit validation rule in system prompt critical rules section

**Add to CRITICAL RULES:**
```
3. **BOUNDS CHECK**: If transcript has N segments, all segment indices must be 0 to N-1.
   - 238 segments → valid range: 0-237
   - "mentions": ["0-500"] when N=238 is WRONG (500 > 237)
```

---

## Part 2: Remove Legacy/Deprecated Code

### Files to Modify

#### A. `src/services/storage/cache.ts`

**Remove entire section (lines ~470-560):**
```typescript
// ============================================================
// LEGACY COMPATIBILITY - Thin wrappers for gradual migration
// ============================================================
```

This includes removing:
| Function | Replacement |
|----------|-------------|
| `updateStyleCache()` | `setJobCache(key, data)` |
| `getStyleCache()` | `getJobCache(key)` |
| `getCachedImageQueries()` | `getImageQueries(key)` |
| `getCachedImages()` | `getDownloadedImages(key)` |
| `updateAudioCache()` | `setAudioCache(hash, data)` |
| `getAllSegmentPrompts()` | `getAllSegments(key)` |
| `initDatabase()` | Auto-initialized on first access |
| `getSegmentResumeState()` | `getResumeState(key)` |
| `upsertSegmentPrompt()` | `upsertSegment(key, data)` |
| `markSegmentApproved()` | `updateSegmentStatus(key, 'approved', path, seed)` |
| `markSegmentFailed()` | `updateSegmentStatus(key, 'failed')` |
| Overloaded `getCachedSegments(4 args)` | `getCachedSegments(key)` |
| Overloaded `getCachedStoryContext(4 args)` | `getCachedStoryContext(key)` |

Also remove deprecated type aliases at bottom:
```typescript
export type AudioCacheEntry = AudioCache;
export type StyleCacheEntry = JobCache;
export type SegmentPromptEntry = SegmentCache;
export type SegmentPromptKey = SegmentKey;
```

#### B. `test-workflow.ts`

**Current imports (lines 20-30):**
```typescript
import {
  hashAudioFile,
  updateAudioCache,
  updateStyleCache,
  getCachedTranscript,
  getCachedSegments,
  getCachedImageQueries,
  getCachedStoryContext,
  getCachedImages,
  initDatabase,
} from "./src/services/storage/index.ts";
```

**New imports:**
```typescript
import {
  hashAudioFile,
  setAudioCache,
  setJobCache,
  getCachedTranscript,
  getCachedSegments,
  getCachedStoryContext,
  getImageQueries,
  getDownloadedImages,
  type JobKey,
} from "./src/services/storage/index.ts";
```

**Update all usages:**

| Line | Current | New |
|------|---------|-----|
| 98 | `initDatabase();` | Remove (auto-init) |
| 112-114 | `updateAudioCache(audioHash, {...})` | `setAudioCache(audioHash, {...})` |
| 143-147 | `updateAudioCache(audioHash, {...})` | `setAudioCache(audioHash, {...})` |
| 163 | `getCachedSegments(audioHash, style.id, "horizontal", useShotTypes)` | `getCachedSegments(jobKey)` |
| 177-180 | `updateStyleCache(audioHash, style.id, "horizontal", useShotTypes, {...})` | `setJobCache(jobKey, {...})` |
| 193 | `getCachedImageQueries(...)` | `getImageQueries(jobKey)` |
| 194 | `getCachedStoryContext(...)` | `getCachedStoryContext(jobKey)` |
| 209-211 | `updateStyleCache(..., { story_context: ... })` | `setJobCache(jobKey, { story_context: ... })` |
| 220-222 | `updateStyleCache(..., { image_queries: ... })` | Remove (derived from segments now) |
| 246 | `getCachedImages(...)` | `getDownloadedImages(jobKey)` |
| 264-266 | `updateStyleCache(..., { downloaded_images: ... })` | Remove (derived from segments now) |
| 271-274 | `updateStyleCache(..., { downloaded_images: ... })` | Remove (derived from segments now) |

**Add JobKey construction:**
```typescript
const jobKey: JobKey = {
  audioHash,
  styleId: style.id,
  orientation: style.orientation,
  naturalEdit: useShotTypes,
};
```

---

## Execution Order

1. **Update context.ts prompts** (Part 1)
   - Modify `buildExtractionSystemPrompt()`
   - Modify `buildExtractionUserPrompt()`

2. **Update test-workflow.ts** (Part 2B)
   - Update imports
   - Add JobKey construction
   - Update all function calls
   - Remove redundant cache updates (image_queries, downloaded_images)

3. **Clean cache.ts** (Part 2A)
   - Remove entire legacy section
   - Remove deprecated type aliases
   - Keep only the clean API

4. **Typecheck & Test**
   - Run `bun run typecheck`
   - Verify no references to removed functions

---

## Final API Surface (cache.ts)

After cleanup, the public API will be:

```typescript
// Types
export interface AudioCache { ... }
export interface JobCache { ... }
export interface SegmentCache { ... }
export interface JobKey { ... }
export interface SegmentKey extends JobKey { ... }

// Audio
export function hashAudioFile(filePath: string): Promise<string>
export function getAudioCache(audioHash: string): AudioCache | null
export function setAudioCache(audioHash: string, data: Partial<...>): void
export function getCachedTranscript(audioHash: string): {...} | null
export function getCachedUploadUrl(audioHash: string): string | null

// Job
export function getJobCache(key: JobKey): JobCache | null
export function setJobCache(key: JobKey, data: Partial<...>): void
export function getCachedSegments(key: JobKey): {...} | null
export function getCachedStoryContext(key: JobKey): unknown | null

// Segment
export function getSegment(key: SegmentKey): SegmentCache | null
export function getAllSegments(key: JobKey): SegmentCache[]
export function upsertSegment(key: SegmentKey, data: {...}): void
export function updateSegmentStatus(key: SegmentKey, status: string, ...): void
export function updateSegmentRewrite(key: SegmentKey, newPrompt: string, count: number): void

// Derived (reconstructed from segments)
export function getImageQueries(key: JobKey): ImageSearchQuery[] | null
export function getDownloadedImages(key: JobKey): DownloadedImage[] | null
export function getResumeState(key: JobKey): {...}

// Management
export function clearJobSegments(key: JobKey): number
export function clearAllCache(): {...}
export function closeDatabase(): void
```

---

## Questions Before Implementation

1. Should `test-workflow.ts` be updated or can it be left as a legacy test file that's excluded from the main codebase?
2. Any other files in/outside `src/` that might reference the deprecated functions?
