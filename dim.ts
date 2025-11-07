const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function duckDuckGoImageSearch(
  query: string,
  maxResults: number = 10
): Promise<{ image: string }[]> {
  // Step 1: Fetch HTML and extract vqd
  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(
    query
  )}&iax=images&ia=images`;

  const res = await fetch(searchUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    },
  });

  if (!res.ok) throw new Error(`Failed to fetch search page: ${res.status}`);

  const html = await res.text();
  const vqdMatch = html.match(/vqd=([\d-]+)/);
  if (!vqdMatch) throw new Error("Failed to extract VQD token");

  const vqd = vqdMatch[1];

  // Step 2: Fetch image results
  const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(
    query
  )}&vqd=${vqd}&f=,,,&p=1`;

  const apiRes = await fetch(apiUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      Referer: searchUrl,
    },
  });

  if (!apiRes.ok)
    throw new Error(`DuckDuckGo image API failed: ${apiRes.status}`);

  // Explicitly type JSON
  const data = (await apiRes.json()) as {
    results?: { image?: string }[];
  };

  if (!data.results) return [];

  // Step 3: Return image-only array
  return data.results
    .slice(0, maxResults)
    .filter((r) => !!r.image)
    .map((r) => ({ image: r.image! }));
}

// const images = await duckDuckGoImageSearch("1970s germany", 1);
// console.log(images);
