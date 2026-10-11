const TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

export function parseSpotifyTrackUrl(value) {
  const input = value.trim();
  const match = input.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (match) {
    return {
      trackId: match[1],
      canonicalUrl: `https://open.spotify.com/track/${match[1]}`
    };
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
  const pathMatch = url.pathname.match(/^\/(?:intl-[a-z]{2}(?:-[A-Z]{2})?\/)?track\/([A-Za-z0-9]{22})\/?$/);
  if (!pathMatch || !TRACK_ID_PATTERN.test(pathMatch[1])) return null;

  return {
    trackId: pathMatch[1],
    canonicalUrl: `https://open.spotify.com/track/${pathMatch[1]}`
  };
}

export async function fetchSpotifyTrackMetadata(track, { signal } = {}) {
  const response = await fetch(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(track.canonicalUrl)}`,
    { signal, headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    throw new Error(response.status === 404 ? "Spotify could not find that track." : "Spotify track details are unavailable right now.");
  }

  const metadata = await response.json();
  if (typeof metadata.title !== "string" || !metadata.title.trim()) {
    throw new Error("Spotify did not provide track details for that link.");
  }

  const artworkUrl = safeSpotifyArtworkUrl(metadata.thumbnail_url);
  return {
    trackId: track.trackId,
    title: metadata.title.trim(),
    artist: typeof metadata.author_name === "string" && metadata.author_name.trim()
      ? metadata.author_name.trim()
      : null,
    artworkUrl
  };
}

function safeSpotifyArtworkUrl(value) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "i.scdn.co" || url.hostname.endsWith(".spotifycdn.com"))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
