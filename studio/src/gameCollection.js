export function featuredGameIdFor(section) {
  return section.featuredGameId
    ?? section.entries?.find((entry) => entry.featured === true)?.id
    ?? "";
}

export function splitGameEntries(section) {
  const visibleEntries = (section.entries ?? []).filter((entry) => entry.visible !== false);
  const featuredGameId = featuredGameIdFor(section);
  const featuredEntry = visibleEntries.find((entry) => entry.id === featuredGameId) ?? null;

  return {
    featuredGameId,
    featuredEntry,
    otherEntries: visibleEntries.filter((entry) => entry.id !== featuredEntry?.id)
  };
}

export function moveOtherGameEntries(section, entryId, offset) {
  const featuredGameId = featuredGameIdFor(section);
  const entries = section.entries ?? [];
  const otherEntries = entries.filter((entry) => entry.id !== featuredGameId);
  const index = otherEntries.findIndex((entry) => entry.id === entryId);
  const targetIndex = index + offset;
  if (index < 0 || targetIndex < 0 || targetIndex >= otherEntries.length) return section;

  [otherEntries[index], otherEntries[targetIndex]] = [otherEntries[targetIndex], otherEntries[index]];
  let otherIndex = 0;
  return {
    ...section,
    entries: entries.map((entry) => entry.id === featuredGameId ? entry : otherEntries[otherIndex++])
  };
}
