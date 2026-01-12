/**
 * Workflow stage types and interfaces
 * Defines the shared state passed between stages
 */

import type { ProgressTracker } from "../../progress.ts";
import type { ResolvedStyle } from "../../../styles/types.ts";
import type {
    AssemblyAIWord,
    TranscriptSegment,
    ImageSearchQuery,
    DownloadedImage,
    WorkflowResult,
} from "../../../types/index.ts";
import type { StoryContext } from "../../../services/llm/index.ts";

/**
 * Shared state passed through all workflow stages
 * Each stage reads what it needs and adds its outputs
 */
export interface WorkflowState {
    // Inputs (set at start)
    audioFilePath: string;
    progress: ProgressTracker;
    style: ResolvedStyle;

    // Stage 0: Cache Init
    audioHash?: string;
    filename?: string;

    // Stage 1-2: Transcription
    transcriptWords?: AssemblyAIWord[];
    audioDuration?: number | null;

    // Stage 3: Segmentation
    segments?: TranscriptSegment[];
    formattedTranscript?: string;

    // Stage 4: Image Queries
    imageQueries?: ImageSearchQuery[];
    storyContext?: StoryContext | null;

    // Stage 5: Image Download
    downloadedImages?: DownloadedImage[];

    // Stage 6-7: Video + Upload
    result?: WorkflowResult;
}

/**
 * A workflow stage function
 * Takes current state, performs work, returns updated state
 */
export type WorkflowStage = (state: WorkflowState) => Promise<WorkflowState>;

/**
 * Stage metadata for logging and debugging
 */
export interface StageInfo {
    name: string;
    description: string;
}
