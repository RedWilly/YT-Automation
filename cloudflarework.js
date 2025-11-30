//this the code i used for my cloudflare image gen()
// https://developers.cloudflare.com/workers-ai/models/?tasks=Text-to-Image (pick your image gen model)
// Supports style-specific negative prompts via request body
export default {
    async fetch(request, env) {
      const API_KEY = env.API_KEY;
      const url = new URL(request.url);
      const auth = request.headers.get("Authorization");

      // 🔐 Simple API key check
      if (auth !== `Bearer ${API_KEY}`) {
        return json({ error: "Unauthorized" }, 401);
      }

      // 🚫 Only allow POST requests to /
      if (request.method !== "POST" || url.pathname !== "/") {
        return json({ error: "Not allowed" }, 405);
      }

      try {
        const {
          prompt,
          negative_prompt: requestNegativePrompt,  // Accept from request body
          height = 1104,
          width = 1472,
          num_steps = 20,
          guidance = 17.5,
          seed,
          strength = 1
        } = await request.json();

        if (!prompt) return json({ error: "Prompt is required" }, 400);

        // Default negative prompt (fallback if not provided in request)
        const defaultNegativePrompt = `
        deformed, distorted, extra limbs, missing limbs,
        extra fingers, duplicated features, mutated, broken anatomy,
        merged objects, unclear composition, low quality, artifacts,
        unintended reflection, overlay figure, reflection, mirror image, duplicated silhouette,
        color spilling, overlapping colors
        `;

        // Use request negative prompt if provided, otherwise use default
        const negativePrompt = requestNegativePrompt || defaultNegativePrompt;

        // Choose model from the following list:
        // "@cf/blackforestlabs/ux-1-schnell"
        // "@cf/bytedance/stable-diffusion-xl-lightning"
        // "@cf/lykon/dreamshaper-8-lcm"
        // "@cf/runwayml/stable-diffusion-v1-5-img2img"
        // "@cf/runwayml/stable-diffusion-v1-5-inpainting"
        // "@cf/stabilityai/stable-diffusion-xl-base-1.0" (is free and 100k requests per day)

        const result = await env.AI.run(
          "@cf/stabilityai/stable-diffusion-xl-base-1.0",
          {
            prompt,
            negative_prompt: negativePrompt,
            height,
            width,
            num_steps,
            guidance,
            seed,
            strength
          }
        );

        return new Response(result, {
          headers: { "Content-Type": "image/jpeg" },
        });
      } catch (err) {
        return json({ error: "Failed to generate image", details: err.message }, 500);
      }
    },
  };
  
  // 📦 Helper function to return JSON responses
  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
  