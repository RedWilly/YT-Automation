/**
 * Sync Prompts Script
 * Updates segment_cache so current_prompt matches original_prompt.
 * Run with: bun scripts/sync-prompts.ts
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";

const DB_PATH = join(process.cwd(), "tmp", "cache.sqlite");

function syncPrompts() {
    console.log("=".repeat(50));
    console.log("Prompt Sync Utility");
    console.log("=".repeat(50));
    console.log(`Database: ${DB_PATH}`);

    try {
        const db = new Database(DB_PATH);

        // Count rows that need updating (handle NULL values properly)
        const toUpdate = db.prepare(
            "SELECT COUNT(*) as count FROM segment_cache WHERE COALESCE(current_prompt, '') != COALESCE(original_prompt, '')"
        ).get() as { count: number };

        if (toUpdate.count === 0) {
            console.log("✓ All prompts are already in sync. No changes needed.");
            db.close();
            return;
        }

        console.log(`Found ${toUpdate.count} segments to update...`);

        // Perform the update (handle NULL values properly)
        const result = db.prepare(`
      UPDATE segment_cache 
      SET 
        current_prompt = original_prompt,
        updated_at = strftime('%s', 'now')
      WHERE COALESCE(current_prompt, '') != COALESCE(original_prompt, '')
    `).run();

        console.log(`✓ Successfully updated ${result.changes} segments.`);
        console.log("Current prompts are now identical to original prompts.");

        db.close();
    } catch (error) {
        console.error("❌ Error syncing prompts:");
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

syncPrompts();
