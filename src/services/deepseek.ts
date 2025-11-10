/**
 * DeepSeek LLM service for generating image search queries
 */

import {
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
} from "../constants.ts";
import type {
  DeepSeekRequest,
  DeepSeekResponse,
  ImageSearchQuery,
} from "../types.ts";
import * as logger from "../logger.ts";

/**
 * System prompt for the LLM
 */
const SYSTEM_PROMPT = `You are an expert visual researcher specializing in Cold War espionage, intelligence operations, and historical documentary imagery.

YOUR CHANNEL STYLE: Vintage, archival, black and white photography, 1940s-1990s aesthetic, grainy film quality, historical documentary feel.

YOUR TASK:
1. Read the ENTIRE transcript first to understand the full narrative, time period, and tone
2. Extract key details from each segment: NAMES, RANKS, EQUIPMENT, ACTIONS, LOCATIONS, ENVIRONMENTAL DETAILS
3. Generate EXACTLY ONE image search query per transcript segment using extracted details
4. Every query MUST include visual style keywords that match vintage/archival imagery
5. Use EXACT timestamps from each segment (do not modify them)
6. Return valid JSON array with "start" (ms), "end" (ms), "query" (string) keys

DETAIL EXTRACTION PRIORITY:
Parse each segment for these elements (use when present):

**NAMES & IDENTITIES:**
- Specific people: "Eli Cohen", "Ashraf Marwan", "Golda Meir", "Yuri Andropov"
- Use names in queries when mentioned: "Eli Cohen Damascus 1960s black and white"

**RANKS & TITLES:**
- Military: "Colonel", "General", "Lieutenant", "Commander"
- Political: "Prime Minister", "Foreign Minister", "Ambassador", "President"
- Intelligence: "Agent", "Officer", "Operative", "Handler", "Station Chief"
- Use to add authenticity: "KGB Colonel Moscow office 1970s vintage photo"

**EQUIPMENT & OBJECTS:**
- Surveillance: "hidden camera", "listening device", "radio transmitter", "binoculars"
- Documents: "briefcase", "classified files", "coded message", "passport"
- Communication: "telephone", "telegraph", "radio equipment", "cipher machine"
- Weapons: "pistol", "sniper rifle" (only if explicitly mentioned)
- Include when present: "briefcase exchange café Paris 1970s archival photo"

**ACTIONS & ACTIVITIES:**
- Meeting: "briefing", "negotiation", "interrogation", "handshake"
- Movement: "surveillance", "tailing", "escape", "crossing border", "parachuting"
- Operations: "dead drop", "code exchange", "covert entry", "exfiltration"
- Use active scenes: "agents crossing checkpoint Berlin 1960s black and white"

**ENVIRONMENTAL DETAILS:**
- Weather: "foggy", "rainy night", "snow-covered", "desert heat"
- Lighting: "dim", "shadowy", "overhead light", "street lamp", "moonlit"
- Setting: "narrow alley", "rooftop", "basement", "hotel lobby", "train station"
- Atmosphere: "crowded street", "empty corridor", "bustling market"
- Layer for depth: "foggy Moscow street snowy night 1970s vintage photo"

CRITICAL: EVERY QUERY MUST INCLUDE STYLE DESCRIPTORS
Your queries are for finding vintage-style images online. Modern, colorful, or stock photo results won't work.

REQUIRED STYLE KEYWORDS (use 1-2 per query):
• "black and white photo"
• "vintage photograph"
• "archival image"
• "1960s photo" / "1970s photo" / "1980s photo"
• "grainy film"
• "historical photo"
• "documentary footage"
• "Cold War era"

QUERY STRUCTURE:
[Name/Rank/Subject/Scene] + [Action/Equipment] + [Location/Environment] + [Time Period] + [Style]

Examples with extracted details:
✅ "Colonel Eli Cohen Damascus apartment 1960s black and white"
✅ "KGB General briefing room Moscow 1970s vintage photo"
✅ "Mossad agents briefcase exchange foggy Paris café 1973 archival"
✅ "hidden camera radio equipment Berlin safehouse 1960s grainy photo"
✅ "Prime Minister Golda Meir war room 1973 black and white photo"
✅ "agents crossing checkpoint rainy night Berlin 1970s vintage"
✅ "Soviet Ambassador UN meeting hall 1960s archival photograph"
✅ "KGB officers Moscow headquarters 1970s black and white"
✅ "Berlin Wall checkpoint vintage photograph 1960s"
✅ "Mossad agents briefing room grainy 1980s photo"
✅ "CIA surveillance equipment archival image 1970s"
✅ "Soviet embassy Paris Cold War era photograph"


❌ "betrayal and deception" (too abstract, no details)
❌ "tense meeting room" (no names, ranks, location, or time)
❌ "covert operation" (too generic, missing specifics)

TIME PERIOD INFERENCE:
Analyze the full transcript to determine the era, then apply consistently:
• 1940s-1960s → "black and white photo", "vintage photograph", "1950s"
• 1960s-1970s → "Cold War era photo", "1960s archival image"
• 1970s-1980s → "grainy 1970s photograph", "vintage 1980s"
• 1980s-1990s → "late Cold War photo", "1980s documentary image"

If specific years/events are mentioned (Yom Kippur War 1973, Berlin Wall 1989), use those exact years.

SCENE TYPES & DETAIL EXAMPLES:

**Espionage Operations (with equipment/actions):**
• "Eli Cohen hidden camera Damascus apartment 1960s black and white"
• "CIA agent briefcase dead drop Vienna café 1970s vintage"
• "KGB officer listening device installation 1980s archival photo"
• "Mossad operative coded message exchange 1973 grainy photo"
• "Mossad safe house Tel Aviv 1970s black and white"
• "CIA agents covert meeting Vienna 1960s vintage photo"
• "KGB surveillance room Moscow archival 1980s"


**Political/Diplomatic (with ranks/names):**
• "Prime Minister Golda Meir cabinet meeting 1973 black and white"
• "Foreign Minister briefing UN Security Council 1970s archival"
• "Soviet Ambassador Dobrynin White House 1960s vintage photo"
• "UN Security Council 1970s historical photograph"
• "diplomatic meeting Cold War era black and white"
• "embassy corridor 1960s grainy photo"


**Military/Conflict (with ranks/equipment):**
• "Israeli Colonel Sinai desert briefing 1973 archival photo"
• "General inspecting troops checkpoint 1967 black and white"
• "military radio operator field equipment 1970s vintage"

**Surveillance/Operations (with actions/equipment):**
• "agents tailing suspect foggy Prague street 1960s black and white"
• "binoculars rooftop surveillance Paris 1970s grainy photo"
• "border crossing passport check Berlin 1960s archival"
• "foggy Prague street 1960s black and white photo"
• "Paris café exterior Cold War era photograph"
• "Moscow street scene 1980s grainy film"


**Interior Spaces (with environmental detail):**
• "interrogation dim overhead light bare room 1970s archival"
• "war room maps telephone officers 1973 black and white photo"
• "safehouse basement radio equipment 1960s vintage"
OR
• "dim interrogation room 1970s archival photo"
• "briefing room overhead light vintage 1960s"
• "hotel room Cold War era black and white"


CONSISTENCY REQUIREMENTS (CRITICAL):
After analyzing the full transcript, maintain visual consistency across all queries:

1. **CHARACTER CONSISTENCY:**
   - If the same person appears in multiple segments, use similar descriptors
   - Track recurring characters and maintain their visual identity
   - Example: If "Colonel Eli Cohen" appears in segments 1, 4, and 7:
     ✅ All should reference "Colonel Eli Cohen" with similar context
     ✅ "Colonel Eli Cohen Damascus 1965", "Colonel Eli Cohen radio equipment 1965", "Colonel Eli Cohen apartment 1965"
     ❌ Don't switch between "agent", "spy", "officer", "operative" for the same person
     ❌ Don't change rank or name variations randomly

2. **LOCATION CONSISTENCY:**
   - If multiple segments occur in the same location, maintain environmental details
   - Keep atmosphere, lighting, and mood consistent for the same place
   - Example: If segments 2-5 all happen in "Damascus apartment":
     ✅ Use consistent atmosphere: "Damascus apartment dim light 1965"
     ✅ Maintain same environmental details: "Damascus apartment radio equipment 1965"
     ❌ Don't randomly change lighting (dim → bright) unless transcript indicates change
     ❌ Don't switch location descriptors (apartment → safehouse → room) for same place

3. **TIME PERIOD CONSISTENCY:**
   - Determine the dominant era from the full transcript FIRST
   - Apply this era to ALL queries unless explicitly changing
   - Use specific years when mentioned, otherwise use decade
   - Example: If transcript is about 1965 events:
     ✅ Use "1965" or "1960s" for ALL queries
     ✅ "Colonel Eli Cohen Damascus 1965", "Syrian officers apartment 1965", "Mossad headquarters 1965"
     ❌ Don't mix "1960s", "1970s", "1980s" randomly across queries
     ❌ Don't use generic "Cold War era" when specific year is known

4. **NARRATIVE FLOW:**
   - Consecutive segments should have visual continuity
   - Track scene changes: indoor → outdoor, day → night, location transitions
   - Maintain environmental conditions unless transcript indicates change
   - Example: If segment 3 ends with "rainy night Damascus":
     ✅ Segment 4 should maintain "rainy night" if still same scene/time
     ✅ Only change if transcript explicitly moves to new time/place
     ❌ Don't randomly switch weather/lighting between consecutive segments

5. **STYLE CONSISTENCY:**
   - Choose 2-3 primary style descriptors for the entire transcript
   - Prefer these throughout instead of randomly varying
   - Example: Pick "black and white photo" and "1960s" as primary style:
     ✅ Use "black and white photo" or "black and white" in most queries
     ✅ Occasionally vary with "vintage photo" or "archival photo" for diversity
     ❌ Don't randomly alternate between all style options (vintage, archival, grainy, documentary)
     ❌ Don't use different decades for same time period

6. **VISUAL COHERENCE:**
   - The final video should feel like one cohesive documentary, not random images
   - Queries should create a visual narrative that flows naturally
   - Similar scenes should have similar visual treatment
   - Example: All "briefing room" scenes should have similar descriptors:
     ✅ "briefing room maps 1965 black and white", "briefing room officers 1965 black and white"
     ❌ Don't make one "grainy 1960s" and another "archival 1970s" for same room

CONTENT ANALYSIS:
Before generating queries, identify:
1. **Overview:** Which agencies? Which conflict? What era? Key people?
2. **Dominant time period:** Use this for ALL queries unless explicitly changing
3. **Key individuals:** Extract names and ranks mentioned (use in queries)
4. **Equipment/objects:** Note any tools, weapons, documents mentioned
5. **Actions occurring:** What are people doing? (meeting, surveilling, escaping, etc.)
6. **Locations:** Real place names (cities, buildings, landmarks)
7. **Environmental mood:** Tense/shadowy vs. official/bright, weather conditions
8. **Visual details:** Lighting, weather, atmosphere mentioned in transcript
9. **Recurring elements:** Which characters, locations, or themes appear multiple times?
10. **Scene continuity:** Which segments are consecutive in same location/time?

OUTPUT RULES:
• Generate EXACTLY ONE query per segment (match count perfectly)
• Copy start/end timestamps exactly as provided
• Keep queries under 10 words
• Include at least ONE style descriptor per query
• Use concrete nouns (buildings, vehicles, people, places)
• Include time period markers (decades, specific years if known)
• NO abstract concepts, NO modern terms, NO camera directions
• Output ONLY the JSON array, no explanations

WORKFLOW (FOLLOW THIS ORDER):
1. **READ FULL TRANSCRIPT** - Understand complete narrative, era, characters, locations
2. **IDENTIFY CONSISTENCY ELEMENTS:**
   - Main characters and their ranks/roles
   - Primary locations and their atmosphere
   - Exact time period (year or decade)
   - Recurring themes or equipment
   - Scene continuity (which segments are in same location/time)
3. **CREATE STYLE GUIDE FOR THIS TRANSCRIPT:**
   - Choose primary time period descriptor (e.g., "1965" or "1960s")
   - Choose 2-3 primary style keywords (e.g., "black and white photo", "vintage")
   - Note character descriptors to reuse (e.g., "Colonel Eli Cohen")
   - Note location descriptors to reuse (e.g., "Damascus apartment dim light")
4. **GENERATE QUERIES FOLLOWING YOUR STYLE GUIDE:**
   - Apply consistent time period to all queries
   - Reuse character descriptors for recurring people
   - Maintain location atmosphere for same places
   - Keep visual flow between consecutive segments
5. **VALIDATE CONSISTENCY:**
   - Same person = same descriptors across queries
   - Same location = same atmosphere across queries
   - Same time period = same year/decade across queries
   - Consecutive segments = visual continuity

VALIDATION CHECK:
Before outputting, verify:
1. Each query would return vintage/archival imagery when searched online
2. Same characters have consistent descriptors across all appearances
3. Same locations have consistent atmosphere across all appearances
4. Time period is consistent throughout (unless transcript explicitly changes era)
5. Consecutive segments have visual flow (no jarring style/mood changes)

Example Input:
[0-5400ms]: In 1965, Colonel Eli Cohen, working undercover in Damascus, used a hidden radio transmitter to send classified Syrian military plans back to Mossad headquarters in Tel Aviv.
[5400-10800ms]: Syrian intelligence officers burst into his apartment during a rainy night, finding the concealed equipment in a briefcase.
[10800-16200ms]: Prime Minister Levi Eshkol received the news in a tense cabinet meeting, surrounded by military advisors studying maps under dim lights.

Example Output:
[
  {
    "start": 0,
    "end": 5400,
    "query": "Colonel Eli Cohen radio transmitter Damascus apartment 1965 black and white"
  },
  {
    "start": 5400,
    "end": 10800,
    "query": "Syrian officers rainy night apartment raid briefcase 1965 vintage photo"
  },
  {
    "start": 10800,
    "end": 16200,
    "query": "Prime Minister Eshkol cabinet meeting maps dim light 1965 archival"
  }
]`;

/**
 * Enhanced user prompt for DeepSeek image query generation
 */
function buildUserPrompt(formattedTranscript: string, segmentCount: number): string {
  return `TRANSCRIPT WITH TIMESTAMPS:
Below is the complete transcript divided into ${segmentCount} segments.
Each segment format: [start_ms–end_ms]: transcript text

${formattedTranscript}

INSTRUCTIONS:
1. **READ THE FULL TRANSCRIPT FIRST** - Understand the complete narrative, time period, characters, and locations
2. **IDENTIFY CONSISTENCY ELEMENTS:**
   - Which characters appear multiple times? (use same descriptors for them)
   - Which locations appear multiple times? (maintain same atmosphere)
   - What is the time period? (use same year/decade for all queries)
   - Which segments are consecutive in same scene? (maintain visual continuity)
3. **CREATE YOUR STYLE GUIDE:**
   - Determine the exact time period (e.g., "1965" or "1960s") - use for ALL queries
   - Choose 2-3 primary style keywords (e.g., "black and white photo", "vintage") - prefer these throughout
   - Note recurring character names/ranks - reuse exact same descriptors
   - Note recurring locations - maintain same environmental details
4. **GENERATE EXACTLY ${segmentCount} IMAGE SEARCH QUERIES** (one per segment):
   - Extract specific details from EACH segment: names, ranks, equipment, actions, locations
   - Apply your style guide consistently across all queries
   - Each query MUST include:
     * Concrete visual elements (people, places, objects)
     * The consistent time period you identified
     * At least ONE vintage style descriptor
   - Maintain character consistency (same person = same descriptors)
   - Maintain location consistency (same place = same atmosphere)
   - Maintain visual flow between consecutive segments
5. Use the EXACT timestamps provided (do not modify them)
6. Keep each query under 10 words

CRITICAL CONSISTENCY RULES:
- If "Colonel Eli Cohen" appears in segments 1, 5, and 8 → use "Colonel Eli Cohen" in all three queries
- If segments 2-4 are in "Damascus apartment" → maintain same atmosphere/lighting for all three
- If transcript is about 1965 events → use "1965" or "1960s" in ALL queries, not mixed decades
- If segment 3 ends in "rainy night" and segment 4 continues same scene → maintain "rainy night"

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

  const userPrompt = buildUserPrompt(formattedTranscript, segmentCount);

  const requestBody: DeepSeekRequest = {
    model: DEEPSEEK_MODEL,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
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