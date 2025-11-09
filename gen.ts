// gen.ts
// Run with: bun run gen.ts

const prompt = `"a convoy of jeeps crossing a mountain pass, digital painting style that imitates vintage oil illustrations mid-19/20th century illustration, with painterly texture, warm muted colors, dramatic lighting, and a vintage illustration aesthetic"`;

const model = "flux";           // model choice: flux, kontext, turbo, gptimage
const width = 1920;             // 1080p width
const height = 1080;            // 1080p height
const nologo = true;            // remove watermark/logo
const apiKey = "UV2eMhw0KRR_W7j-"; // your API key (ensure it's ASCII!)

async function main() {
  try {
    const base = "https://image.pollinations.ai/prompt/";
    const url =
      base +
      encodeURIComponent(prompt) +
      `?model=${model}&width=${width}&height=${height}&nologo=${nologo}`;

    console.log("Requesting image for prompt:");
    console.log(prompt);
    console.log("URL:", url);

    const startTime = Date.now();

    const res = await fetch(url, {
      headers: {
        "x-pollinations-token": apiKey
      }
    });

    const endTime = Date.now();
    console.log(`Image generation request took ${(endTime - startTime) / 1000} seconds.`);

    if (!res.ok) {
      const text = await res.text();
      console.error("Image request failed:", res.status, res.statusText);
      console.error("Response body:", text);
      process.exit(1);
    }

    const buffer = await res.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    const outPath = "./output.png";
    // @ts-ignore - Bun.write is available in Bun runtime
    const bytes = Bun.write(outPath, uint8);
    console.log(`Saved image to ${outPath} (${bytes} bytes)`);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
