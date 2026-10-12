import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://krlzd.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173"
]);
const requestWindowMs = 10 * 60 * 1000;
const maxRequestsPerWindow = 20;
const requestTimes = new Map<string, number[]>();
const maxBodyBytes = 2048;
const maxSearchResults = 8;
const maxScreenshots = 12;
const minimumRequestIntervalMs = 275;
const requestQueues = new Map<string, Promise<void>>();
const lastRequestAt = new Map<string, number>();
const gameFields = [
  "id",
  "name",
  "summary",
  "first_release_date",
  "cover.image_id",
  "genres.name",
  "platforms.name",
  "involved_companies.company.name",
  "involved_companies.developer",
  "involved_companies.publisher",
  "websites.url",
  "url"
].join(",");

let cachedToken: { value: string; expiresAt: number } | null = null;

function corsHeaders(origin: string | null) {
  const originIsAllowed = origin !== null && allowedOrigins.has(origin);
  return {
    "Access-Control-Allow-Origin": originIsAllowed ? origin : "https://krlzd.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(body: unknown, status: number, headers: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeHttpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function igdbImageUrl(imageId: unknown, size: "cover_big" | "screenshot_big") {
  const id = boundedText(imageId, 120);
  return /^[A-Za-z0-9_-]+$/.test(id)
    ? `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`
    : "";
}

function timestampToDate(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "";
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function namesFromRelation(value: unknown, relationName = "name") {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((relation) => {
      if (relationName === "company.name") {
        return isRecord(relation.company) ? boundedText(relation.company.name, 120) : "";
      }
      return boundedText(relation[relationName], 120);
    })
    .filter(Boolean)
    .slice(0, 16);
}

function normalizeGame(game: Record<string, unknown>) {
  const releaseDate = timestampToDate(game.first_release_date);
  const cover = isRecord(game.cover) ? game.cover : {};
  const genres = namesFromRelation(game.genres);
  const platforms = namesFromRelation(game.platforms);
  const companies = Array.isArray(game.involved_companies)
    ? game.involved_companies.filter(isRecord)
    : [];
  const companyNames = (key: "developer" | "publisher") => companies
    .filter((item) => item[key] === true)
    .map((item) => isRecord(item.company) ? boundedText(item.company.name, 120) : "")
    .filter(Boolean)
    .slice(0, 16);
  const websites = Array.isArray(game.websites) ? game.websites.filter(isRecord) : [];

  return {
    id: typeof game.id === "number" && Number.isSafeInteger(game.id) ? game.id : null,
    title: boundedText(game.name, 180),
    description: boundedText(game.summary, 1800),
    releaseDate,
    year: releaseDate.slice(0, 4),
    cover: igdbImageUrl(cover.image_id, "cover_big"),
    genres,
    platforms,
    developers: companyNames("developer"),
    publishers: companyNames("publisher"),
    website: websites.map((item) => safeHttpsUrl(item.url)).find(Boolean) ?? "",
    igdbUrl: safeHttpsUrl(game.url)
  };
}

function normalizeScreenshots(payload: unknown, gameId: number) {
  if (!Array.isArray(payload)) return [];
  return payload.slice(0, maxScreenshots).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const url = igdbImageUrl(item.image_id, "screenshot_big");
    if (!url) return [];
    return [{ id: `igdb-${gameId}-${boundedText(item.image_id, 120) || index}`, url }];
  });
}

function takeRateLimit(userId: string) {
  const now = Date.now();
  const recent = (requestTimes.get(userId) ?? []).filter((time) => now - time < requestWindowMs);
  if (recent.length >= maxRequestsPerWindow) {
    requestTimes.set(userId, recent);
    return false;
  }
  recent.push(now);
  requestTimes.set(userId, recent);
  return true;
}

async function getAppAccessToken(clientId: string, clientSecret: string) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials"
  });
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("TWITCH_TOKEN_FAILURE");
  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload.access_token !== "string" || typeof payload.expires_in !== "number") {
    throw new Error("TWITCH_TOKEN_FAILURE");
  }
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000
  };
  return cachedToken.value;
}

async function throttledIgdbFetch(clientId: string, accessToken: string, endpoint: string, query: string) {
  const previous = requestQueues.get(clientId) ?? Promise.resolve();
  let release: () => void = () => {};
  const queued = new Promise<void>((resolve) => { release = resolve; });
  requestQueues.set(clientId, previous.then(() => queued));
  await previous;
  try {
    const waitMs = minimumRequestIntervalMs - (Date.now() - (lastRequestAt.get(clientId) ?? 0));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestAt.set(clientId, Date.now());
    const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "text/plain"
      },
      body: query,
      signal: AbortSignal.timeout(8000)
    });
    if (response.status === 429) throw new Error("IGDB_RATE_LIMIT");
    if (!response.ok) throw new Error("IGDB_UPSTREAM_FAILURE");
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error("IGDB_UPSTREAM_FAILURE");
    return payload;
  } finally {
    release();
  }
}

function escapeSearchQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function searchBody(query: string) {
  return `search "${escapeSearchQuery(query)}"; fields ${gameFields}; where version_parent = null; limit ${maxSearchResults};`;
}

function detailsBody(gameId: number) {
  return `fields ${gameFields}; where id = ${gameId}; limit 1;`;
}

function screenshotsBody(gameId: number) {
  return `fields id,image_id; where game = ${gameId}; limit ${maxScreenshots};`;
}

export default {
  async fetch(request: Request) {
    const origin = request.headers.get("origin");
    const headers = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response("ok", { headers });
    if (origin && !allowedOrigins.has(origin)) {
      return jsonResponse({ error: "This site is not allowed to use the IGDB proxy." }, 403, headers);
    }
    if (request.method !== "POST") return jsonResponse({ error: "Use POST for this endpoint." }, 405, headers);
    if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      return jsonResponse({ error: "Send a JSON request." }, 415, headers);
    }

    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > maxBodyBytes) {
      return jsonResponse({ error: "Request is too large." }, 413, headers);
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(bodyText);
      if (!isRecord(parsed)) return jsonResponse({ error: "Request JSON must be an object." }, 400, headers);
      body = parsed;
    } catch {
      return jsonResponse({ error: "Request JSON is invalid." }, 400, headers);
    }

    const action = body.action;
    if (action !== "search" && action !== "details") {
      return jsonResponse({ error: "Choose a supported IGDB action." }, 400, headers);
    }
    const query = action === "search" && typeof body.query === "string" ? body.query.trim() : "";
    const gameId = action === "details" && typeof body.gameId === "number" ? body.gameId : 0;
    if (action === "search" && (query.length < 2 || query.length > 100)) {
      return jsonResponse({ error: "Search text must be between 2 and 100 characters." }, 400, headers);
    }
    if (action === "details" && (!Number.isSafeInteger(gameId) || gameId < 1 || gameId > 1_000_000_000_000)) {
      return jsonResponse({ error: "Choose a valid IGDB game result." }, 400, headers);
    }

    const authorization = request.headers.get("authorization") ?? "";
    const accessToken = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
    const publishableKey = request.headers.get("apikey");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const twitchClientId = Deno.env.get("TWITCH_CLIENT_ID");
    const twitchClientSecret = Deno.env.get("TWITCH_CLIENT_SECRET");
    if (!accessToken || !publishableKey || !supabaseUrl) {
      return jsonResponse({ error: "Sign in to the authorized profile owner account first." }, 401, headers);
    }
    if (!twitchClientId || !twitchClientSecret) {
      return jsonResponse({ error: "IGDB credentials are not configured yet. Manual game entry remains available." }, 503, headers);
    }

    const supabase = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) return jsonResponse({ error: "Your sign-in is invalid or expired. Sign in again." }, 401, headers);
    const { data: isOwner, error: ownerError } = await supabase.rpc("is_profile_owner");
    if (ownerError || isOwner !== true) {
      return jsonResponse({ error: "Only the authorized profile owner may use game search." }, 403, headers);
    }
    if (!takeRateLimit(user.id)) {
      return jsonResponse({ error: "Too many IGDB requests. Wait a few minutes and try again." }, 429, {
        ...headers,
        "Retry-After": "600"
      });
    }

    try {
      const token = await getAppAccessToken(twitchClientId, twitchClientSecret);
      if (action === "search") {
        const payload = await throttledIgdbFetch(twitchClientId, token, "games", searchBody(query));
        const results = payload.filter(isRecord)
          .map(normalizeGame)
          .filter((game) => game.id !== null && game.title);
        return jsonResponse({ results }, 200, headers);
      }

      const gamePayload = await throttledIgdbFetch(twitchClientId, token, "games", detailsBody(gameId));
      const rawScreenshots = await throttledIgdbFetch(twitchClientId, token, "screenshots", screenshotsBody(gameId));
      if (!isRecord(gamePayload[0])) {
        return jsonResponse({ error: "IGDB returned incomplete game details. Manual entry remains available." }, 502, headers);
      }
      return jsonResponse({
        game: normalizeGame(gamePayload[0]),
        screenshots: normalizeScreenshots(rawScreenshots, gameId)
      }, 200, headers);
    } catch (error) {
      if (error instanceof Error && error.message === "IGDB_RATE_LIMIT") {
        return jsonResponse({ error: "IGDB is rate-limiting requests. Wait a little and try again." }, 429, headers);
      }
      if (error instanceof Error && error.message === "TWITCH_TOKEN_FAILURE") {
        cachedToken = null;
        return jsonResponse({ error: "Twitch app authentication failed. Check the server-side IGDB credentials." }, 502, headers);
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        return jsonResponse({ error: "IGDB took too long to respond. You can add this game manually." }, 504, headers);
      }
      return jsonResponse({ error: "IGDB could not complete this request. Manual game entry remains available." }, 502, headers);
    }
  }
};
