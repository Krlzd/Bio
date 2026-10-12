import { useEffect, useState } from "react";
import { fetchSpotifyTrackMetadata, parseSpotifyTrackUrl } from "./spotify.js";

export function SpotifyMusicCard({
  section,
  isDark = false,
  onMetadataChange,
  disclaimer = "",
  embedHeight = 152
}) {
  const parsedTrack = parseSpotifyTrackUrl(section.spotifyUrl ?? "");
  const [localMetadata, setLocalMetadata] = useState(section.spotifyMetadata ?? null);
  const [error, setError] = useState("");
  const metadata = section.spotifyMetadata?.trackId === parsedTrack?.trackId
    ? section.spotifyMetadata
    : localMetadata?.trackId === parsedTrack?.trackId ? localMetadata : null;

  useEffect(() => {
    const track = parseSpotifyTrackUrl(section.spotifyUrl ?? "");
    if (!track) {
      setError(section.spotifyUrl ? "Paste a full Spotify track link to preview it." : "");
      setLocalMetadata(null);
      return undefined;
    }
    if (metadata?.trackId === track.trackId) {
      setError("");
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setError("");
      try {
        const trackMetadata = await fetchSpotifyTrackMetadata(track, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setLocalMetadata(trackMetadata);
        onMetadataChange?.(trackMetadata);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof TypeError
          ? "Spotify could not be reached. Check your connection and try the track link again."
          : cause instanceof Error ? cause.message : "Spotify track details are unavailable right now.");
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [section.spotifyUrl, metadata?.trackId, onMetadataChange]);

  if (!section.spotifyUrl?.trim()) return null;

  return (
    <div className="spotify-card" aria-live="polite">
      {parsedTrack && (
        <iframe
          className="spotify-embed"
          title={`Spotify player: ${metadata?.title ?? "selected track"}`}
          src={`https://open.spotify.com/embed/track/${parsedTrack.trackId}?utm_source=generator&theme=${isDark ? 0 : 1}`}
          width="100%"
          height={Math.min(352, Math.max(80, Number(embedHeight) || 152))}
          style={{ height: `${Math.min(352, Math.max(80, Number(embedHeight) || 152))}px` }}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
      )}
      {error && <p className="spotify-card-error" role="status">{error}</p>}
      {disclaimer && <p className="spotify-disclaimer">{disclaimer}</p>}
    </div>
  );
}
