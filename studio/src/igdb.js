const searchCache = new Map();
const detailsCache = new Map();
const cacheDurationMs = 5 * 60 * 1000;
const maxCacheEntries = 40;

function cachedValue(cache, key) {
  const item = cache.get(key);
  if (!item || item.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return item.value;
}

function remember(cache, key, value) {
  if (cache.size >= maxCacheEntries) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + cacheDurationMs });
  return value;
}

async function invokeIgdb(client, body) {
  let result;
  try {
    result = await client.functions.invoke("igdb-games", { body });
  } catch {
    throw new Error("IGDB search is unavailable. Check your connection; manual game entry still works.");
  }
  if (result.error) {
    const status = Number(result.error.context?.status);
    if (status === 401) throw new Error("Sign in again to search IGDB.");
    if (status === 403) throw new Error("Only the authorized owner can search IGDB.");
    if (status === 429) throw new Error("IGDB is rate-limiting requests. Wait a little, or add the game manually.");
    if (status === 503) throw new Error("IGDB credentials are not configured yet. Manual game entry still works.");
    if (status === 404) throw new Error("The IGDB Edge Function is not deployed yet. Manual game entry still works.");
    throw new Error("IGDB search failed. Check the Edge Function status; manual game entry still works.");
  }
  if (!result.data || typeof result.data !== "object") {
    throw new Error("IGDB returned an unexpected response. Manual game entry still works.");
  }
  return result.data;
}

export async function searchIgdbGames(client, query) {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  if (normalizedQuery.length < 2 || normalizedQuery.length > 100) {
    throw new Error("Enter between 2 and 100 characters to search IGDB.");
  }
  const cacheKey = normalizedQuery.toLocaleLowerCase();
  const cached = cachedValue(searchCache, cacheKey);
  if (cached) return cached;

  const data = await invokeIgdb(client, { action: "search", query: normalizedQuery });
  if (!Array.isArray(data.results)) throw new Error("IGDB returned no usable search list. Manual entry still works.");
  const results = data.results.filter((game) =>
    game && Number.isSafeInteger(game.id) && typeof game.title === "string"
  ).slice(0, 8);
  return remember(searchCache, cacheKey, results);
}

export async function fetchIgdbGameDetails(client, gameId) {
  if (!Number.isSafeInteger(Number(gameId)) || Number(gameId) < 1) {
    throw new Error("Choose a valid IGDB game result.");
  }
  const id = Number(gameId);
  const cached = cachedValue(detailsCache, String(id));
  if (cached) return cached;

  const data = await invokeIgdb(client, { action: "details", gameId: id });
  if (!data.game || !Number.isSafeInteger(data.game.id) || !Array.isArray(data.screenshots)) {
    throw new Error("IGDB returned incomplete game details. The game can still be added manually.");
  }
  const details = {
    game: data.game,
    screenshots: data.screenshots.filter((screenshot) =>
      screenshot && typeof screenshot.url === "string" && /^https:\/\//i.test(screenshot.url)
    ).slice(0, 12)
  };
  return remember(detailsCache, String(id), details);
}
