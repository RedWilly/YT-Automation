/**
 * DeepSeek LLM service for generating image search queries
 */

import {
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  USE_AI_IMAGE,
  AI_IMAGE_STYLE,
} from "../constants.ts";
import type {
  DeepSeekRequest,
  DeepSeekResponse,
  ImageSearchQuery,
} from "../types.ts";
import * as logger from "../logger.ts";

/**
 * Build system prompt for the LLM with conditional AI style integration
 * @param useAiImage - Whether AI image generation is enabled
 * @param aiImageStyle - The AI image style to use (only if useAiImage is true)
 * @returns System prompt string
 */
function buildSystemPrompt(useAiImage: boolean, aiImageStyle: string): string {
  // Conditional style guidance based on image source
  const styleGuidance = useAiImage
    ? `YOUR IMAGE GENERATION STYLE: ${aiImageStyle}

CRITICAL: Since you're generating queries for AI image generation, EVERY query MUST include the style descriptor.
The AI will generate images based on your queries, so include the style in each query to ensure visual consistency.

REQUIRED STYLE INTEGRATION:
• Append the style descriptor to every query
• Example query format: "[subject and action], ${aiImageStyle}"
• This ensures all AI-generated images match the desired visual aesthetic`
    : `YOUR IMAGE SEARCH CONTEXT: Web-based image search (DuckDuckGo)

CRITICAL: Since you're generating queries for web image search, focus on descriptive, searchable terms.
Avoid overly artistic or abstract style modifiers that might limit search results.

SEARCH OPTIMIZATION:
• Use concrete, descriptive terms that will find relevant images online
• Include time period, setting, and visual context when relevant to the content
• Avoid overly specific artistic styles unless central to the content`;

  return `You are an expert visual researcher specializing in generating image search queries for video content.

${styleGuidance}

YOUR TASK:
1. Read the ENTIRE transcript first to understand the full narrative, context, and tone
2. Extract key details from each segment: PEOPLE, TITLES/ROLES, OBJECTS, ACTIONS, LOCATIONS, ENVIRONMENTAL DETAILS
3. Generate EXACTLY ONE image search query per transcript segment using extracted details
4. Use EXACT timestamps from each segment (do not modify them)
5. Return valid JSON array with "start" (ms), "end" (ms), "query" (string) keys

DETAIL EXTRACTION PRIORITY (CRITICAL - FOLLOW THIS ORDER):

**PRIORITY 1: PEOPLE & ACTIONS (MOST IMPORTANT - NEVER SKIP):**
Every query MUST include people and what they're doing when present in the transcript.

- **People First:** Identify who is in the scene - "man", "woman", "person", "worker", "professional", "speaker", "presenter", "expert", "scientist", "doctor", "teacher", "student", etc.
- **Actions/Verbs:** What are they doing? - "speaking", "walking", "sitting", "writing", "presenting", "demonstrating", "working", "meeting", "discussing", "examining", "teaching", "learning"
- **Combine them:** "person speaking at podium", "scientist examining sample", "teacher explaining concept", "worker operating machinery"

Examples of CORRECT people + action queries:
✅ "person speaking at conference podium"
✅ "scientist examining laboratory equipment"
✅ "teacher explaining diagram to students"
✅ "worker operating industrial machinery"
✅ "doctor consulting with patient"
✅ "presenter demonstrating product"

Examples of WRONG queries (missing people/actions):
❌ "conference podium microphone" (WHERE IS THE PERSON? WHERE IS THE ACTION?)
❌ "laboratory equipment test tubes" (WHO is in the lab? WHAT are they doing?)
❌ "classroom diagram whiteboard" (WHO is teaching? WHAT are they doing?)
❌ "industrial machinery factory floor" (WHO is operating it? WHAT are they doing?)

**PRIORITY 2: NAMES & IDENTITIES:**
- Extract specific names, titles, or roles mentioned in the transcript
- Use names with actions when available
- Examples: "Dr. Smith presenting research", "CEO announcing results", "Professor Johnson teaching class"

**PRIORITY 3: ROLES & TITLES:**
- Professional: "CEO", "Manager", "Director", "Executive", "Consultant"
- Academic: "Professor", "Researcher", "Scientist", "Student", "Scholar"
- Medical: "Doctor", "Nurse", "Surgeon", "Therapist"
- Technical: "Engineer", "Developer", "Technician", "Analyst"
- General: "Expert", "Specialist", "Professional", "Worker"
- Use with actions: "Engineer demonstrating prototype", "Professor lecturing students"

**PRIORITY 4: OBJECTS & EQUIPMENT:**
- Extract relevant objects, tools, or equipment mentioned in the transcript
- Include with people and actions: "scientist using microscope", "presenter holding tablet"
- Examples: "laptop", "documents", "equipment", "tools", "devices", "instruments", "materials"

**PRIORITY 5: ACTIONS & ACTIVITIES (VERBS ARE CRITICAL):**
- Communication: "speaking", "presenting", "explaining", "discussing", "announcing", "teaching"
- Work: "working", "operating", "building", "creating", "developing", "analyzing"
- Interaction: "meeting", "collaborating", "consulting", "demonstrating", "showing"
- Research: "examining", "testing", "studying", "researching", "investigating"
- ALWAYS use verbs: "researcher analyzing data", "team collaborating on project"

**PRIORITY 6: ENVIRONMENTAL DETAILS (SECONDARY - ADD ONLY IF SPACE ALLOWS):**
- Setting: "office", "laboratory", "classroom", "conference room", "factory", "studio", "outdoor", "street"
- Atmosphere: "professional setting", "modern office", "busy workspace", "quiet library"
- Lighting: "natural light", "studio lighting", "indoor", "outdoor"
- Context: "business meeting", "scientific research", "educational setting", "industrial environment"

CRITICAL RULE: PEOPLE + ACTIONS COME FIRST!
If the transcript mentions a person doing something, your query MUST include:
1. The person (name, title, role, or description)
2. The action (verb - what they're doing)
3. The context/location
4. Relevant objects or equipment

DO NOT create empty scene queries. DO NOT skip people. DO NOT skip actions.

QUERY STRUCTURE (MANDATORY FORMAT):
[Person/Name/Title] + [ACTION VERB] + [Object/Equipment] + [Location/Context]
CORRECT Examples:
✅ "person speaking at conference podium"
✅ "scientist examining laboratory equipment"
✅ "teacher explaining diagram to students"
✅ "worker operating industrial machinery"
✅ "doctor consulting with patient in office"
✅ "presenter demonstrating product to audience"

WRONG Examples (MISSING PEOPLE OR ACTIONS):
❌ "conference podium microphone" (NO PERSON! NO ACTION!)
❌ "laboratory equipment test tubes" (WHO is in the lab? WHAT are they doing?)
❌ "classroom diagram whiteboard" (WHO is teaching? WHAT are they doing?)
❌ "industrial machinery factory" (WHO is operating it? WHAT are they doing?)
❌ "office desk computer" (WHO is working? WHAT are they doing?)
❌ "abstract concept" (too abstract, no people, no actions, no details)
❌ "tense atmosphere" (no people, no actions, no concrete details)
❌ "important meeting" (too generic, missing people, actions, specifics)


CONSISTENCY REQUIREMENTS (CRITICAL):
After analyzing the full transcript, maintain visual consistency across all queries:

1. **CHARACTER CONSISTENCY:**
   - If the same person appears in multiple segments, use similar descriptors
   - Track recurring characters and maintain their visual identity
   - Example: If "Dr. Smith" appears in segments 1, 4, and 7:
     ✅ All should reference "Dr. Smith" with similar context
     ✅ "Dr. Smith presenting research", "Dr. Smith examining data", "Dr. Smith in laboratory"
     ❌ Don't switch between "scientist", "researcher", "expert", "doctor" for the same person
     ❌ Don't change titles or name variations randomly

2. **LOCATION CONSISTENCY:**
   - If multiple segments occur in the same location, maintain environmental details
   - Keep atmosphere, lighting, and mood consistent for the same place
   - Example: If segments 2-5 all happen in "modern office":
     ✅ Use consistent atmosphere: "modern office natural light"
     ✅ Maintain same environmental details: "modern office workspace"
     ❌ Don't randomly change lighting (bright → dim) unless transcript indicates change
     ❌ Don't switch location descriptors (office → workspace → room) for same place

3. **CONTEXT CONSISTENCY:**
   - Determine the dominant context/theme from the full transcript FIRST
   - Apply this context consistently unless explicitly changing
   - Example: If transcript is about medical research:
     ✅ Maintain medical/scientific context throughout
     ✅ "researcher examining samples", "scientist analyzing data", "doctor reviewing results"
     ❌ Don't randomly switch contexts without transcript justification

4. **NARRATIVE FLOW:**
   - Consecutive segments should have visual continuity
   - Track scene changes: indoor → outdoor, day → night, location transitions
   - Maintain environmental conditions unless transcript indicates change
   - Example: If segment 3 ends in "busy conference hall":
     ✅ Segment 4 should maintain "conference hall" if still same scene
     ✅ Only change if transcript explicitly moves to new location
     ❌ Don't randomly switch settings between consecutive segments

5. **VISUAL COHERENCE:**
   - The final video should feel like one cohesive narrative, not random images
   - Queries should create a visual story that flows naturally
   - Similar scenes should have similar visual treatment
   - Example: All "laboratory" scenes should have similar descriptors:
     ✅ "scientist in laboratory examining equipment", "researcher in laboratory analyzing samples"
     ❌ Don't make one "modern lab" and another "vintage lab" for same location

CONTENT ANALYSIS:
Before generating queries, identify:
1. **Overview:** What is the main topic? Who are the key people? What is the setting?
2. **Dominant context:** What is the primary theme or subject matter?
3. **Key individuals:** Extract names, titles, and roles mentioned (use in queries)
4. **Objects/equipment:** Note any tools, devices, materials mentioned
5. **Actions occurring:** What are people doing? (presenting, working, discussing, etc.)
6. **Locations:** Real place names or setting types (office, laboratory, classroom, etc.)
7. **Environmental mood:** Professional/formal vs. casual/informal, lighting conditions
8. **Visual details:** Lighting, atmosphere, setting details mentioned in transcript
9. **Recurring elements:** Which characters, locations, or themes appear multiple times?
10. **Scene continuity:** Which segments are consecutive in same location/context?

OUTPUT RULES:
• Generate EXACTLY ONE query per segment (match count perfectly)
• Copy start/end timestamps exactly as provided
• Keep queries under 10 words (unless style descriptor requires more)
• Use concrete nouns (people, objects, places, actions)
• NO abstract concepts, NO camera directions
• Output ONLY the JSON array, no explanations

WORKFLOW (FOLLOW THIS ORDER):
1. **READ FULL TRANSCRIPT** - Understand complete narrative, context, characters, locations
2. **IDENTIFY CONSISTENCY ELEMENTS:**
   - Main characters and their titles/roles
   - Primary locations and their atmosphere
   - Recurring themes or objects
   - Scene continuity (which segments are in same location/context)
3. **CREATE CONSISTENCY GUIDE FOR THIS TRANSCRIPT:**
   - Note character descriptors to reuse (e.g., "Dr. Smith", "CEO Johnson")
   - Note location descriptors to reuse (e.g., "modern office", "research laboratory")
   - Note contextual elements to maintain (e.g., "professional setting", "educational context")
4. **GENERATE QUERIES FOLLOWING YOUR CONSISTENCY GUIDE:**
   - Reuse character descriptors for recurring people
   - Maintain location atmosphere for same places
   - Keep visual flow between consecutive segments
5. **VALIDATE CONSISTENCY:**
   - Same person = same descriptors across queries
   - Same location = same atmosphere across queries
   - Consecutive segments = visual continuity

VALIDATION CHECK:
Before outputting, verify:
1. Each query includes concrete, searchable terms
2. Same characters have consistent descriptors across all appearances
3. Same locations have consistent atmosphere across all appearances
4. Consecutive segments have visual flow (no jarring changes)
5. All queries include PERSON + ACTION when people are present in transcript

EXAMPLE INPUT:
[0-5400ms]: Dr. Sarah Chen, a leading climate scientist, presented her latest research findings at the international conference in Geneva.
[5400-10800ms]: She explained how rising ocean temperatures are affecting marine ecosystems, pointing to data charts on the large screen behind her.
[10800-16200ms]: In her laboratory back in California, her research team examined water samples collected from the Pacific Ocean.
[16200-21600ms]: The team used advanced microscopes to analyze microplastic particles found in the samples.

EXAMPLE OUTPUT (NOTICE: Every query has PERSON + ACTION):
[
  {
    "start": 0,
    "end": 5400,
    "query": "Dr. Sarah Chen presenting research at conference podium Geneva"
  },
  {
    "start": 5400,
    "end": 10800,
    "query": "scientist explaining data charts on screen to audience"
  },
  {
    "start": 10800,
    "end": 16200,
    "query": "research team examining water samples in laboratory California"
  },
  {
    "start": 16200,
    "end": 21600,
    "query": "scientists using microscopes analyzing microplastic particles"
  }
]

WRONG OUTPUT (MISSING PEOPLE/ACTIONS - DO NOT DO THIS):
[
  {
    "start": 0,
    "end": 5400,
    "query": "conference podium Geneva"  ❌ NO PERSON! NO ACTION!
  },
  {
    "start": 5400,
    "end": 10800,
    "query": "data charts screen"  ❌ NO PERSON! NO ACTION!
  },
  {
    "start": 10800,
    "end": 16200,
    "query": "laboratory water samples California"  ❌ NO PERSON! NO ACTION!
  },
  {
    "start": 16200,
    "end": 21600,
    "query": "microscopes microplastic particles"  ❌ NO PERSON! NO ACTION!
  }
]`;
}

/**
 * Enhanced user prompt for DeepSeek image query generation
 */
function buildUserPrompt(formattedTranscript: string, segmentCount: number): string {
  return `TRANSCRIPT WITH TIMESTAMPS:
Below is the complete transcript divided into ${segmentCount} segments.
Each segment format: [start_ms–end_ms]: transcript text

${formattedTranscript}

INSTRUCTIONS:
1. **READ THE FULL TRANSCRIPT FIRST** - Understand the complete narrative, context, characters, and locations

2. **IDENTIFY CONSISTENCY ELEMENTS:**
   - Which characters appear multiple times? (use same descriptors for them)
   - Which locations appear multiple times? (maintain same atmosphere)
   - Which segments are consecutive in same scene? (maintain visual continuity)

3. **CREATE YOUR CONSISTENCY GUIDE:**
   - Note recurring character names/titles - reuse exact same descriptors
   - Note recurring locations - maintain same environmental details
   - Note contextual elements to maintain throughout

4. **GENERATE EXACTLY ${segmentCount} IMAGE SEARCH QUERIES** (one per segment):

   **CRITICAL REQUIREMENT - EVERY QUERY MUST HAVE:**
   ✅ **PERSON** (name, title, or description when people are present)
   ✅ **ACTION** (verb: what they're doing)
   ✅ **CONTEXT** (location/equipment/setting)

   **Query Format:** [PERSON] + [ACTION] + [CONTEXT]

   Examples:
   ✅ "person speaking at conference podium"
   ✅ "scientist examining laboratory equipment"
   ✅ "teacher explaining diagram to students"

   ❌ WRONG: "conference podium microphone" (NO PERSON! NO ACTION!)
   ❌ WRONG: "laboratory equipment" (NO PERSON! NO ACTION!)
   ❌ WRONG: "classroom diagram" (NO PERSON! NO ACTION!)

   - Extract specific details from EACH segment: names, titles, objects, actions, locations
   - Apply your consistency guide across all queries
   - Maintain character consistency (same person = same descriptors)
   - Maintain location consistency (same place = same atmosphere)
   - Maintain visual flow between consecutive segments

5. Use the EXACT timestamps provided (do not modify them)

6. Keep each query under 10 words (unless style descriptor requires more)

CRITICAL CONSISTENCY RULES:
- If a specific person appears in multiple segments → use same name/title in all queries
- If multiple segments are in same location → maintain same atmosphere/descriptors
- If segments are consecutive in same scene → maintain visual continuity

OUTPUT FORMAT:
Return ONLY a valid JSON array with ${segmentCount} objects, each containing:
- "start": timestamp in milliseconds (exact copy)
- "end": timestamp in milliseconds (exact copy)
- "query": the image search query string

No explanations, no markdown formatting, no preamble - ONLY the JSON array.`;
}

/**
 * Generate image search queries from formatted transcript
 * @param formattedTranscript - Formatted transcript with timestamps
 * @returns Array of image search queries with timestamps
 */
export async function generateImageQueries(
  formattedTranscript: string
): Promise<ImageSearchQuery[]> {
  // Count segments in the formatted transcript
  const segmentCount = (formattedTranscript.match(/\[/g) || []).length;
  logger.step("DeepSeek", `Generating image search queries`, `${segmentCount} segments`);
  logger.debug("DeepSeek", `Formatted transcript:\n${formattedTranscript}`);

  // Build system prompt with conditional AI style integration
  const systemPrompt = buildSystemPrompt(USE_AI_IMAGE, AI_IMAGE_STYLE);
  const userPrompt = buildUserPrompt(formattedTranscript, segmentCount);

  // Log whether AI style is being used
  if (USE_AI_IMAGE) {
    logger.log("DeepSeek", `🎨 AI image generation enabled - including style in queries: "${AI_IMAGE_STYLE.substring(0, 50)}..."`);
  } else {
    logger.log("DeepSeek", `🔍 Web image search enabled - optimizing queries for search results`);
  }

  const requestBody: DeepSeekRequest = {
    model: DEEPSEEK_MODEL,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature: 0.4,
    max_tokens: 4000,
  };

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to generate image queries: ${response.status} - ${errorText}`
    );
  }

  const data = (await response.json()) as DeepSeekResponse;

  // Extract the content from the response
  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No content in DeepSeek response");
  }

  logger.raw("DeepSeek", "Raw response content", content);

  // Parse the JSON response
  const queries = parseImageQueries(content);

  logger.success("DeepSeek", `Generated ${queries.length} image search queries`);

  return queries;
}

/**
 * Parse image queries from LLM response
 * @param content - Raw content from LLM response
 * @returns Array of parsed image search queries
 */
function parseImageQueries(content: string): ImageSearchQuery[] {
  // Try to extract JSON from the content
  // Sometimes LLMs wrap JSON in markdown code blocks
  let jsonContent = content.trim();

  // Remove markdown code blocks if present
  if (jsonContent.startsWith("```json")) {
    jsonContent = jsonContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (jsonContent.startsWith("```")) {
    jsonContent = jsonContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  try {
    const parsed = JSON.parse(jsonContent) as ImageSearchQuery[];

    // Validate the structure
    if (!Array.isArray(parsed)) {
      throw new Error("Response is not an array");
    }

    // Validate each query
    for (const query of parsed) {
      if (
        typeof query.start !== "number" ||
        typeof query.end !== "number" ||
        typeof query.query !== "string"
      ) {
        throw new Error("Invalid query structure");
      }
    }

    return parsed;
  } catch (error) {
    logger.error("DeepSeek", "Failed to parse JSON response", error);
    logger.debug("DeepSeek", `Content was: ${jsonContent}`);
    throw new Error(
      `Failed to parse image queries from LLM response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validate image queries
 * @param queries - Array of image search queries to validate
 * @returns True if valid, throws error otherwise
 */
export function validateImageQueries(queries: ImageSearchQuery[]): boolean {
  if (!Array.isArray(queries)) {
    throw new Error("Queries must be an array");
  }

  if (queries.length === 0) {
    throw new Error("Queries array is empty");
  }

  const queriesLength = queries.length;
  for (let i = 0; i < queriesLength; i++) {
    const query = queries[i];
    if (!query) continue;

    if (
      typeof query.start !== "number" ||
      typeof query.end !== "number" ||
      typeof query.query !== "string"
    ) {
      throw new Error(`Invalid query at index ${i}`);
    }

    if (query.query.length === 0) {
      throw new Error(`Empty query string at index ${i}`);
    }

    // Warn if query exceeds 10 words
    const wordCount = query.query.split(/\s+/).length;
    if (wordCount > 10) {
      logger.warn(
        "DeepSeek",
        `Query at index ${i} exceeds 10 words (${wordCount} words): "${query.query}"`
      );
    }
  }

  logger.success("DeepSeek", `Validation passed for ${queries.length} queries`);
  return true;
}