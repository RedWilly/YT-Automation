/**
 * LLM Prompt templates and generation logic
 */

/**
 * Build system prompt for the LLM with conditional AI style integration
 * @param useAiImage - Whether AI image generation is enabled
 * @param aiImageStyle - The AI image style to use (only if useAiImage is true)
 * @returns System prompt string
 */
export function buildSystemPrompt(useAiImage: boolean, aiImageStyle: string): string {
   // Conditional style guidance based on image source
   const styleGuidance = useAiImage
      ? `YOUR IMAGE GENERATION STYLE: ${aiImageStyle}

CRITICAL: Since you're generating queries for AI image generation, EVERY query MUST include the style descriptor.
The AI will generate images based on your queries, so include the style in each query to ensure visual consistency.

REQUIRED STYLE INTEGRATION:
• Append the style descriptor to every query
• Example query format: "[subject and action] only"
DO NOT INCLUDE IMAGE GENERATION STYLE but only the query
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
1. Read all provided transcript segments first to understand the narrative, context, and tone
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

OUTPUT RULES (HARD CONSTRAINTS):
• Generate EXACTLY ONE query per segment (match count perfectly)
• Copy start/end timestamps exactly as provided
• Each query MUST be more than 10 words but less than 17 words (unless style descriptor requires more)
• Use concrete nouns (people, objects, places, actions)
• NO abstract concepts, NO camera directions
• Output MUST be a single valid JSON array only (no text before or after)

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
{"start":0,"end":5400,"query":"Dr. Sarah Chen presenting research at conference podium Geneva"},
{"start":5400,"end":10800,"query":"scientist explaining data charts on screen to audience"},
{"start":10800,"end":16200,"query":"research team examining water samples in laboratory California"},
{"start":16200,"end":21600,"query":"scientists using microscopes analyzing microplastic particles"},
]

WRONG OUTPUT (MISSING PEOPLE/ACTIONS - DO NOT DO THIS):
[
{"start":0,"end":5400,"query":"speaker presenting at conference podium Geneva"},
{"start":5400,"end":10800,"query":"scientist explaining data charts on screen"},
{"start":10800,"end":16200,"query":"research team examining water samples in laboratory California"},
{"start":16200,"end":21600,"query":"scientists using microscopes analyzing microplastic particles"}
]
❌ NO PERSON! NO ACTION!`;
}

/**
 * Enhanced user prompt for AI image query generation
 * Focused on subject/action extraction while master prompt handles style & logic
 */
export function buildUserPrompt(
   formattedTranscript: string,
   segmentCount: number,
   useAiImage: boolean
): string {
   const wordCountInstruction = useAiImage
      ? "7. EACH QUERY MUST BE MORE THAN 10 WORDS BUT LESS THAN 40 WORDS (detailed descriptions for AI generation)"
      : "7. EACH QUERY MUST BE MORE THAN 5 WORDS BUT LESS THAN 10 WORDS (concise keywords for web search)";

   return `TRANSCRIPT WITH TIMESTAMPS:
Below are ${segmentCount} consecutive segments from the transcript.
Each segment format: [start_ms–end_ms]: transcript text

${formattedTranscript}

INSTRUCTIONS:
1. READ ALL SEGMENTS FIRST - Understand the full narrative, context, characters, and locations.

2. IDENTIFY CONSISTENCY ELEMENTS:
   - Which characters appear multiple times? Use same descriptors for them.
   - Which locations appear multiple times? Maintain same environmental details.
   - Which segments are consecutive in same scene? Maintain visual continuity.

3. EXTRACT KEY ELEMENTS FROM EACH SEGMENT:
   - People/characters: names, titles, roles (e.g., "Dr. Smith", "pilot", "scientist")
   - Actions: verbs describing what they are doing (e.g., "examining samples", "operating machinery")
   - Objects/equipment: relevant tools or items in the scene
   - Location/context: where the action takes place

4. GENERATE EXACTLY ${segmentCount} IMAGE QUERIES (one per segment):

   **CRITICAL REQUIREMENT - EVERY QUERY MUST INCLUDE:**
   ✅ PERSON (name, title, or description when people are present)
   ✅ ACTION (verb describing what they are doing)
   ✅ RELEVANT OBJECTS/CONTEXT

   **Query Format:** [PERSON/CHARACTER] + [ACTION VERB] + [OBJECTS/LOCATION/CONTEXT]

   **IMPORTANT:** Do NOT include master style/logic instructions here; those are appended automatically by the system.

5. USE CONSISTENCY ACROSS SEGMENTS:
   - Same person = same descriptor
   - Same location = same descriptors/atmosphere
   - Consecutive segments = maintain scene continuity

6. USE EXACT TIMESTAMPS PROVIDED (do not modify)

${wordCountInstruction}

EXAMPLES:

**Before → After Style Logic (subject/action clarity)**

- Before (raw): "Japanese pilot on aircraft carrier deck looking at incoming P-38 fighters"  
- After (enhanced query): "Japanese pilot standing on aircraft carrier deck, observing incoming P-38 fighters, pilots on deck"

- Before (raw): "Pacific island coastline with 3 P-38 Lightning fighters, Japanese ships in the water"  
- After (enhanced query): "Pacific island coastline with 3 P-38 fighters flying overhead, Japanese ships floating below"

**Correct query examples:**
✅ "Dr. Sarah Chen presenting research at conference podium Geneva"  
✅ "Scientist explaining data charts on large screen to audience"  
✅ "Research team examining water samples in laboratory California"  
✅ "Scientists using microscopes analyzing microplastic particles"

**Wrong query examples (missing people/actions):**
❌ "Conference podium microphone"  
❌ "Laboratory equipment test tubes"  
❌ "Classroom diagram whiteboard"  
❌ "Industrial machinery factory floor"

OUTPUT FORMAT:
- EXACTLY ${segmentCount} JSON objects in a single array
- Each object must have "start" (ms), "end" (ms), "query" (string)
- NO explanations, notes, or extra text
- NO markdown, no text before the array, no text after the array
- Output must be valid JSON only`;
}
