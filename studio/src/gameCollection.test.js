import test from "node:test";
import assert from "node:assert/strict";
import { featuredGameIdFor, moveOtherGameEntries, splitGameEntries } from "./gameCollection.js";

function makeEntries(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `game-${index + 1}`,
    title: `Game ${index + 1}`,
    visible: true
  }));
}

test("splits one featured game from compact collections of 1, 2, 5, and 20 entries", () => {
  for (const count of [1, 2, 5, 20]) {
    const entries = makeEntries(count);
    const section = { entries, featuredGameId: entries[0].id };
    const split = splitGameEntries(section);

    assert.equal(split.featuredEntry, entries[0]);
    assert.equal(split.otherEntries.length, count - 1);
    assert.equal(new Set([split.featuredEntry, ...split.otherEntries]).size, count);
  }
});

test("uses a legacy featured entry until an explicit featured id is saved", () => {
  const entries = [{ id: "one", featured: true }, { id: "two" }];
  assert.equal(featuredGameIdFor({ entries }), "one");
  assert.equal(splitGameEntries({ entries, featuredGameId: "" }).featuredEntry, null);
});

test("excludes hidden games from public split without deleting saved entries", () => {
  const entries = [{ id: "featured" }, { id: "hidden", visible: false }, { id: "other" }];
  const split = splitGameEntries({ entries, featuredGameId: "featured" });
  assert.deepEqual(split.otherEntries.map((entry) => entry.id), ["other"]);
  assert.equal(entries.length, 3);
});

test("reorders Other Games without moving or removing the featured slot", () => {
  const section = {
    featuredGameId: "featured",
    entries: [{ id: "featured" }, { id: "a" }, { id: "b" }, { id: "c" }]
  };

  const reordered = moveOtherGameEntries(section, "c", -1);
  assert.deepEqual(reordered.entries.map((entry) => entry.id), ["featured", "a", "c", "b"]);
  assert.equal(splitGameEntries(reordered).featuredEntry.id, "featured");
  assert.equal(moveOtherGameEntries(section, "a", -1), section);
});
