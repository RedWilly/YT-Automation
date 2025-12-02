import { parseImageQueries } from "../v2v/src/services/llm.ts";
import * as logger from "./src/logger.ts";

interface ImageSearchQuery {
    start: number;
    end: number;
    query: string;
}

const testCases = [
    {
        name: "Extra space in key",
        input: `[{"start": 0, " "end": 5000, "query": "Statesman in alley passing envelope."}]`
    },
    {
        name: "Trailing comma in object",
        input: `[{"start": 5000, "end": 10000, "query": "Simple query",}]`
    },
    {
        name: "Trailing comma in array",
        input: `[{"start": 10000, "end": 15000, "query": "Another query"},]`
    },
    {
        name: "Wrapped in markdown",
        input: "```json\n[{\"start\":15000,\"end\":20000,\"query\":\"Wrapped in markdown\"}]```"
    },
    {
        name: "Missing quotes around keys",
        input: `[{start: 20000, end: 25000, query: "No quotes on keys"}]`
    },
    {
        name: "Missing quotes around values",
        input: `[{"start": 25000, "end": 30000, "query": No quotes on values}]`
    },
    {
        name: "Missing quotes around both keys and values",
        input: `[{start: 30000, end: 35000, query: No quotes anywhere}]`
    },
    {
        name: "Extra spaces and line breaks",
        input: `[{"start"  : 35000, "end" : 40000, "query" : "Spaced out query"}]`
    },
    {
        name: "Partial array in text",
        input: "Here is the output: [ {\"start\":40000, \"end\":45000, \"query\":\"Partial array\" } some text]"
    },
    {
        name: "Broken escape characters",
        input: `[{"start":45000,"end":50000,"query":"Broken \\ escape \\q"}]`
    },
    {
        name: "Multiple arrays mixed with text",
        input: "Intro text [ {\"start\":50000,\"end\":55000,\"query\":\"First array\"} ] middle text [ {\"start\":55000,\"end\":60000,\"query\":\"Second array\"} ]"
    },
    {
        name: "Completely invalid JSON but valid structure inside",
        input: "Some text {start: 60000, end: 65000, query: 'Embedded object'} more text"
    },
    {
        name: "Extra random characters",
        input: "[#@!$%{\"start\":65000,\"end\":70000,\"query\":\"Random chars\"}^^&*]"
    }
];

logger.log("ParserTest", "=".repeat(60));
logger.log("ParserTest", "Parser Test Suite - Sequential Timestamps");
logger.log("ParserTest", "=".repeat(60));

let allPassed = true;
const results: { name: string; status: string; error?: string }[] = [];

testCases.forEach((test, idx) => {
    try {
        const parsed: ImageSearchQuery[] = parseImageQueries(test.input);

        const hasCorrectTimestamps = parsed.every((query) => {
            const expectedStart = idx * 5000;
            const expectedEnd = (idx + 1) * 5000;
            return query.start === expectedStart && query.end === expectedEnd;
        });

        if (hasCorrectTimestamps) {
            results.push({ name: test.name, status: "✓ PASS" });
            logger.success("ParserTest", `[${idx + 1}] ${test.name} - PASS`);
            logger.raw("ParserTest", "Result", parsed);
        } else {
            results.push({ name: test.name, status: "⚠ WARN", error: "Timestamps incorrect" });
            logger.warn("ParserTest", `[${idx + 1}] ${test.name} - WARN: Timestamps incorrect`);
            logger.raw("ParserTest", "Result", parsed);
            allPassed = false;
        }
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({ name: test.name, status: "✗ FAIL", error: errorMsg });
        logger.error("ParserTest", `[${idx + 1}] ${test.name} - FAIL`, err);
        allPassed = false;
    }
});

logger.log("ParserTest", "\n" + "=".repeat(60));
logger.log("ParserTest", "Summary");
logger.log("ParserTest", "=".repeat(60));

const passed = results.filter(r => r.status === "✓ PASS").length;
const failed = results.filter(r => r.status === "✗ FAIL").length;
const warned = results.filter(r => r.status === "⚠ WARN").length;

logger.log("ParserTest", `Total: ${results.length}`);
logger.log("ParserTest", `Passed: ${passed}`);
logger.log("ParserTest", `Failed: ${failed}`);
logger.log("ParserTest", `Warnings: ${warned}`);
logger.log("ParserTest", `Overall: ${allPassed ? "✓ ALL TESTS PASSED" : "✗ SOME TESTS FAILED"}`);

if (failed > 0) {
    logger.log("ParserTest", "\nFailed Tests:");
    results.filter(r => r.status === "✗ FAIL").forEach(r => {
        logger.error("ParserTest", `  - ${r.name}: ${r.error}`);
    });
}

if (warned > 0) {
    logger.log("ParserTest", "\nWarnings:");
    results.filter(r => r.status === "⚠ WARN").forEach(r => {
        logger.warn("ParserTest", `  - ${r.name}: ${r.error}`);
    });
}