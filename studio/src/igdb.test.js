import test from "node:test";
import assert from "node:assert/strict";
import { fetchIgdbGameDetails, searchIgdbGames } from "./igdb.js";

function createClient(invoke) {
  return {
    functions: {
      invoke
    }
  };
}

test("search normalizes queries, caps results, and reuses the in-memory cache", async () => {
  const calls = [];
  const client = createClient(async (name, options) => {
    calls.push({ name, options });
    return {
      data: {
        results: [
          ...Array.from({ length: 9 }, (_, index) => ({ id: index + 1, title: `Game ${index + 1}` })),
          { id: 10, title: "" },
          { id: "11", title: "Invalid id" }
        ]
      }
    };
  });
  const query = `  igdb-cache-${Date.now()}   game `;

  const first = await searchIgdbGames(client, query);
  const second = await searchIgdbGames(client, query.toUpperCase().replace(/\s+/g, " ").trim());

  assert.equal(first.length, 8);
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "igdb-games");
  assert.deepEqual(calls[0].options.body, { action: "search", query: query.trim().replace(/\s+/g, " ") });
});

test("details validates and filters screenshot URLs before caching", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return {
      data: {
        game: { id: 987654321, title: "Example" },
        screenshots: [
          { id: "safe", url: "https://images.igdb.com/safe.jpg" },
          { id: "unsafe", url: "http://images.igdb.com/unsafe.jpg" },
          { id: "missing" }
        ]
      }
    };
  });

  const first = await fetchIgdbGameDetails(client, 987654321);
  const second = await fetchIgdbGameDetails(client, "987654321");

  assert.deepEqual(first.screenshots.map(({ id }) => id), ["safe"]);
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test("IGDB rate-limit errors retain the manual-entry fallback", async () => {
  const client = createClient(async () => ({
    data: null,
    error: { context: { status: 429 } }
  }));

  await assert.rejects(
    () => searchIgdbGames(client, `igdb-limit-${Date.now()}`),
    /rate-limiting requests.*add the game manually/i
  );
});

test("proxy errors show the sanitized function response and HTTP status", async () => {
  const client = createClient(async () => ({
    data: null,
    error: {
      context: new Response(JSON.stringify({
        error: "Twitch app authentication failed. Check the server-side IGDB credentials."
      }), { status: 502, headers: { "Content-Type": "application/json" } })
    }
  }));

  await assert.rejects(
    () => searchIgdbGames(client, `igdb-proxy-error-${Date.now()}`),
    /IGDB proxy error \(HTTP 502\): Twitch app authentication failed.*manual game entry still works/i
  );
});

test("search rejects too-short and too-long queries before calling the proxy", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return { data: { results: [] } };
  });

  await assert.rejects(() => searchIgdbGames(client, "x"), /between 2 and 100 characters/i);
  await assert.rejects(() => searchIgdbGames(client, "x".repeat(101)), /between 2 and 100 characters/i);
  assert.equal(calls, 0);
});
