import { parseImageQueries } from "../v2v/src/services/llm.ts";
import * as logger from "./src/logger.ts";

interface ImageSearchQuery {
    start: number;
    end: number;
    query: string;
}

const testCases = [
    // ---------- Original Test Cases ----------
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
    },
    {
        name: "Real malformed keys + missing value quotes",
        input: `[{
        " "start": 0,
        " "end": 5000,
        " "query": Mysterious figure walks down alley
    }]`
    },

    // ---------- Additional AI-Malformed JSON Test Cases ----------
    {
        name: "Single quotes instead of double quotes",
        input: "[{'start':70000, 'end':75000, 'query':'Single quotes query'}]"
    },
    {
        name: "Missing commas between keys",
        input: `[{"start":75000 "end":80000 "query":"Missing commas between keys"}]`
    },
    {
        name: "Nested arrays inside query string",
        input: `[{"start":80000, "end":85000, "query":"This is a query with [nested, array] inside"}]`
    },
    {
        name: "Query contains braces without quotes",
        input: `[{"start":85000, "end":90000, "query":"Unquoted {braces} inside string"}]`
    },
    {
        name: "Extra colons inside query string",
        input: `[{"start":90000, "end":95000, "query":"Time: 12:30 PM, Location: Unknown"}]`
    },
    {
        name: "Incomplete array with missing closing bracket",
        input: `[{"start":95000, "end":100000, "query":"Missing closing bracket"}`
    },
    {
        name: "Objects with mixed numeric and string values",
        input: `[{"start":100000, "end":105000, "query": 12345}]`
    },
    {
        name: "Array with null and undefined entries",
        input: `[{"start":105000, "end":110000, "query":"Valid"}, null, undefined]`
    },
    {
        name: "Comments inside JSON (invalid but AI may include)",
        input: `[{"start":110000, "end":115000, "query":"Query with // comment inside"}]`
    },
    {
        name: "Extra trailing text after array",
        input: `[{"start":115000,"end":120000,"query":"Valid query"}] Extra text at end`
    },
    {
        name: "Keys with non-ASCII characters",
        input: `[{"stärt":120000,"énd":125000,"quëry":"Non-ASCII keys"}]`
    },
    {
        name: "Query contains emoji or special characters",
        input: `[{"start":125000,"end":130000,"query":"Query with emoji 😊 and symbols ©®"}]`
    },
    {
        name: "Completely minified JSON with no spaces",
        input: `[{"start":130000,"end":135000,"query":"MinifiedJSON"}]`
    },
    {
        name: "AI adds extra brackets inside query string",
        input: `[{"start":135000,"end":140000,"query":"Query with extra [brackets] inside [string]"}]`
    },
    {
        name: "Escaped quotes inside query string",
        input: `[{"start":140000,"end":145000,"query":"He said: \"Hello world!\""}]`
    }
];

// ---------- Test Runner ----------
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
