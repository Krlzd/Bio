import { useEffect, useRef, useState } from "react";
import { fetchSpotifyTrackMetadata, parseSpotifyTrackUrl } from "./spotify.js";

export function SpotifyMusicCard({
  section,
  isDark = false,
  onMetadataChange,
  showEmbedLauncher = false,
  embedRequested = false,
  onEmbedRequest
}) {
  const parsedTrack = parseSpotifyTrackUrl(section.spotifyUrl ?? "");
  const [localMetadata, setLocalMetadata] = useState(section.spotifyMetadata ?? null);
  const [localEmbedRequested, setLocalEmbedRequested] = useState(false);
  const previousTrackId = useRef(parsedTrack?.trackId);
  const [error, setError] = useState("");
  const metadata = section.spotifyMetadata?.trackId === parsedTrack?.trackId
    ? section.spotifyMetadata
    : localMetadata?.trackId === parsedTrack?.trackId ? localMetadata : null;
  const shouldShowEmbed = embedRequested || localEmbedRequested;

  useEffect(() => {
    const track = parseSpotifyTrackUrl(section.spotifyUrl ?? "");
    if (previousTrackId.current !== track?.trackId) {
      setLocalEmbedRequested(false);
      previousTrackId.current = track?.trackId;
    }
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

  return (
    <div className="spotify-card" aria-live="polite">
      <div className="spotify-card-content">
        <div className="spotify-cover">
          {metadata?.artworkUrl ? (
            <img src={metadata.artworkUrl} alt="" loading="lazy" />
          ) : (
            <span aria-hidden="true">♫</span>
          )}
          <span className="spotify-cover-index">SIDE B</span>
        </div>
        <div className="spotify-track-copy">
          <h3>{metadata?.title ?? (parsedTrack ? "FETCHING TRACK NOTES…" : "PASTE A SPOTIFY TRACK")}</h3>
          {metadata?.artist ? (
            <p className="spotify-artist">{metadata.artist}</p>
          ) : metadata ? (
            <p className="spotify-artist">Artist details are not provided by Spotify’s public link preview.</p>
          ) : parsedTrack ? (
            <p className="spotify-artist">Loading Spotify’s public track details…</p>
          ) : (
            <p className="spotify-artist">Track details appear here after you add a link.</p>
          )}
          {section.body && <p className="spotify-description">{section.body}</p>}
          <div className="spotify-card-actions">
            {showEmbedLauncher && parsedTrack && (
              <button
                className="spotify-listen-button"
                type="button"
                onClick={() => onEmbedRequest ? onEmbedRequest() : setLocalEmbedRequested(true)}
              >
                {shouldShowEmbed ? "PLAYER OPENED" : "SHOW SPOTIFY PLAYER"}
                <span aria-hidden="true">↗</span>
              </button>
            )}
            {parsedTrack && (
              <a className="spotify-open-link" href={parsedTrack.canonicalUrl} target="_blank" rel="noreferrer">
                OPEN TRACK <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
          {showEmbedLauncher && shouldShowEmbed && parsedTrack && (
            <iframe
              className="spotify-embed"
              title={`Spotify player: ${metadata?.title ?? "selected track"}`}
              src={`https://open.spotify.com/embed/track/${parsedTrack.trackId}?utm_source=generator&theme=${isDark ? 0 : 1}`}
              width="100%"
              height="152"
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            />
          )}
        </div>
      </div>
      {error && <p className="spotify-card-error" role="status">{error}</p>}
      <p className="spotify-disclaimer">PLAYBACK IS PROVIDED BY SPOTIFY. NO LOCAL PLAYER OR PLAYBACK PROGRESS IS SIMULATED.</p>
    </div>
  );
}
