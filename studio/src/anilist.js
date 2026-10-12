const ANILIST_ENDPOINT = "https://graphql.anilist.co";

export async function searchAniListAnime(query, { signal } = {}) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: `query ($search: String!) {
        Page(page: 1, perPage: 8) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
            id
            title { english romaji }
            coverImage { medium }
            startDate { year }
            genres
            format
            siteUrl
          }
        }
      }`,
      variables: { search: trimmed }
    }),
    signal
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("AniList is rate-limiting searches right now. Wait a little or add this title manually.");
    }
    throw new Error(`AniList search failed (${response.status}). You can still add the show manually.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error("AniList could not complete this search. You can still add the show manually.");
  }

  return (payload.data?.Page?.media ?? []).map((media) => ({
    id: `anilist-${media.id}`,
    title: media.title?.english || media.title?.romaji || "",
    image: media.coverImage?.medium ?? "",
    year: media.startDate?.year ?? "",
    genre: media.genres?.join(", ") ?? "",
    mediaType: media.format ?? "",
    externalUrl: media.siteUrl ?? ""
  }));
}
