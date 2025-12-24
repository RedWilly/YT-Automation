import { describe, expect, test } from "bun:test";
import { createZoomFilter, calculateZoomParams } from "../zoom.ts";

// Mock video dimensions for testing
const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;

describe("Zoom Effect Logic", () => {
    test("calculateZoomParams should return valid parameters", () => {
        const params = calculateZoomParams(5);
        expect(params.enabled).toBe(true);
        expect(params.startZoom).toBeDefined();
        expect(params.endZoom).toBeDefined();
        expect(Math.abs(params.startZoom - params.endZoom)).toBeGreaterThan(0);
    });

    test("calculateZoomParams should disable for short duration", () => {
        const params = calculateZoomParams(1);
        expect(params.enabled).toBe(false);
        expect(params.startZoom).toBe(1.0);
        expect(params.endZoom).toBe(1.0);
    });

    test("createZoomFilter should produce correct supersampled zoompan filter chain", () => {
        // Duration 5s -> 150 frames
        const result = createZoomFilter("0:v", "v0", 5, "horizontal");
        const filter = result.filter;

        // 1. Must select single frame 
        expect(filter).toContain("select='eq(n\\,0)'");

        // 2. Must Upscale to 4x (Supersampling)
        // 1920 * 4 = 7680
        // 1080 * 4 = 4320
        expect(filter).toContain("scale=7680:4320:flags=lanczos");

        // 3. Must use zoompan with high res output size
        expect(filter).toContain("zoompan=");
        expect(filter).toContain(":s=7680x4320");
        expect(filter).toContain(":d=150");

        // 4. Must use proper Easing and Centering
        // cos(PI*...) check
        expect(filter).not.toContain("cos(PI*"); // No longer using cosine easing
        // Centering (using input width/height internal vars)
        expect(filter).toContain("x='iw/2-(iw/zoom/2)'");
        expect(filter).toContain("y='ih/2-(ih/zoom/2)'");

        // 5. Must Downscale back to Original Resolution
        expect(filter).toContain(`scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:flags=lanczos`);

        // 6. Must Finalize format
        expect(filter).toContain("setsar=1");
        expect(filter).toContain("format=yuv420p");
    });

    test("createZoomFilter logic should be Linear (constant speed)", () => {
        const result = createZoomFilter("0:v", "v0", 5, "horizontal");
        // Verify we are NOT using cosine easing anymore
        expect(result.filter).not.toContain("cos(PI*");
        // Verify we are using linear progress
        expect(result.filter).toContain("*on/(150-1)");
    });

    // SIMULATION TEST remains valid as math hasn't changed, only resolution
    test("SIMULATION: Verify Zoom Values Per Frame (Log Output)", () => {
        const scenarios = [
            { name: "ZOOM IN (1.0 -> 1.15)", start: 1.0, end: 1.15 },
            { name: "ZOOM OUT (1.15 -> 1.0)", start: 1.15, end: 1.0 }
        ];

        const frames = 150; // 5s @ 30fps
        const width = 1920;
        const height = 1080;
        const checkFrames = [0, 37, 75, 112, 149];

        scenarios.forEach(scene => {
            console.log(`\n--- ${scene.name} ---`);
            checkFrames.forEach(n => {
                const progress = n / (frames - 1);
                // Linear: progress is exactly n / (frames - 1)
                const eased = progress;

                // Interpolate zoom level
                const currentZoom = scene.start + (scene.end - scene.start) * eased;

                // Viewport size
                const viewportW = width / currentZoom;
                const viewportH = height / currentZoom;

                // Center position
                const x = width / 2 - viewportW / 2;
                const y = height / 2 - viewportH / 2;

                console.log(`Frame ${n.toString().padEnd(3)} | Progress: ${(progress * 100).toFixed(0)}% | Zoom: ${currentZoom.toFixed(3)}x | Offset: x=${x.toFixed(1)}, y=${y.toFixed(1)}`);

                expect(x).toBeGreaterThanOrEqual(0);
                expect(y).toBeGreaterThanOrEqual(0);
            });
        });
        console.log("-------------------------------------------------\n");
    });
});
