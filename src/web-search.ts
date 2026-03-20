/**
 * Web search implementation.
 * Tries Brave Search API first (if BRAVE_SEARCH_API_KEY is set),
 * falls back to scraping DuckDuckGo HTML results.
 */

import { config } from "./config";

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Search the web and return top results.
 */
export async function webSearch(
  query: string,
  language: string = "he"
): Promise<SearchResult[]> {
  if (config.braveSearchApiKey) {
    try {
      return await braveSearch(query, language);
    } catch (err: any) {
      console.error("[web-search] Brave Search failed, falling back to DuckDuckGo:", err.message);
    }
  }
  return duckDuckGoSearch(query, language);
}

/**
 * Brave Search API (free tier: 2000 queries/month)
 */
async function braveSearch(
  query: string,
  language: string
): Promise<SearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("search_lang", language);
  url.searchParams.set("count", "5");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": config.braveSearchApiKey,
    },
  });

  if (!res.ok) {
    throw new Error(`Brave API ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const results: SearchResult[] = (data.web?.results || [])
    .slice(0, 5)
    .map((r: any) => ({
      title: r.title || "",
      snippet: r.description || "",
      url: r.url || "",
    }));

  return results;
}

/**
 * DuckDuckGo HTML fallback — fetches the HTML search page and parses results.
 */
async function duckDuckGoSearch(
  query: string,
  language: string
): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${language === "he" ? "il-he" : "us-en"}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo ${res.status}: ${res.statusText}`);
  }

  const html = await res.text();
  return parseDuckDuckGoHTML(html);
}

/**
 * Parse DuckDuckGo HTML results page.
 * Extracts results from the <div class="result"> blocks.
 */
function parseDuckDuckGoHTML(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Match result blocks: each has a link and snippet
  const resultBlockRegex =
    /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  let match: RegExpExecArray | null;
  while ((match = resultBlockRegex.exec(html)) !== null && results.length < 5) {
    const rawUrl = match[1];
    const title = stripHtml(match[2]).trim();
    const snippet = stripHtml(match[3]).trim();

    // DuckDuckGo wraps URLs in a redirect — extract the real URL
    const realUrl = extractDDGUrl(rawUrl);

    if (title && realUrl) {
      results.push({ title, snippet, url: realUrl });
    }
  }

  // Fallback: try a simpler pattern if the above didn't match
  if (results.length === 0) {
    const simpleLinkRegex =
      /<a[^>]+class="result__url"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRegex =
      /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const links: { url: string; title: string }[] = [];
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = simpleLinkRegex.exec(html)) !== null && links.length < 5) {
      links.push({
        url: extractDDGUrl(linkMatch[1]),
        title: stripHtml(linkMatch[2]).trim(),
      });
    }

    const snippets: string[] = [];
    let snippetMatch: RegExpExecArray | null;
    while ((snippetMatch = snippetRegex.exec(html)) !== null && snippets.length < 5) {
      snippets.push(stripHtml(snippetMatch[1]).trim());
    }

    for (let i = 0; i < links.length; i++) {
      results.push({
        title: links[i].title || `תוצאה ${i + 1}`,
        snippet: snippets[i] || "",
        url: links[i].url,
      });
    }
  }

  return results;
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ");
}

/** Extract the real URL from DuckDuckGo's redirect wrapper */
function extractDDGUrl(rawUrl: string): string {
  // DDG sometimes uses //duckduckgo.com/l/?uddg=ENCODED_URL&...
  if (rawUrl.includes("uddg=")) {
    try {
      const parsed = new URL(rawUrl, "https://duckduckgo.com");
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    } catch {
      // fall through
    }
  }
  // Sometimes it's a direct URL
  if (rawUrl.startsWith("http")) return rawUrl;
  if (rawUrl.startsWith("//")) return "https:" + rawUrl;
  return rawUrl;
}
