import { useState } from "react";
import { SpotifyMusicCard } from "./SpotifyMusicCard.jsx";

export function ProfilePreview({ profile, sectionActions, isDark, enableSpotifyPlayback = false, onSpotifyMetadataChange }) {
  const visibleSections = profile.sections.filter((section) => section.visible);
  const previewStyle = {
    "--preview-paper": isDark ? "#171c1e" : profile.theme.paper,
    "--preview-card": isDark ? "#242b2d" : "#fffefa",
    "--preview-ink": isDark ? "#f1f1eb" : profile.theme.ink,
    "--preview-soft": isDark ? "#b8c2c3" : "#596269",
    "--preview-rule": isDark ? "#6f7a7c" : profile.theme.ink,
    "--preview-teal": isDark ? "#82b8bd" : profile.theme.teal,
    "--preview-blue": isDark ? "#9bbbd1" : profile.theme.blue,
    "--preview-blue-panel": isDark ? "#29495b" : profile.theme.blue
  };

  return (
    <article
      className={`bio-preview preset-${profile.layoutPreset}`}
      style={previewStyle}
      aria-label={`Live preview for ${profile.profile.displayName}`}
    >
      <header className="bio-preview-header">
        <span className="preview-mark" aria-hidden="true">冴</span>
        <span className="preview-wordmark">MARGIN NOTES <b>/</b> {profile.profile.username}</span>
        <span className="preview-page-number">№ 10</span>
      </header>

      <section className="bio-hero">
        <div className="bio-hero-copy">
          <p className="preview-kicker">CHARACTER FILE / 010</p>
          <h1>{profile.profile.displayName}<br /><em>IN THE MARGINS.</em></h1>
          <p className="bio-status"><span aria-hidden="true">●</span> {profile.profile.status}</p>
          <p className="bio-introduction">{profile.profile.introduction}</p>
        </div>
        <figure className="bio-hero-art">
          <span className="hero-annotation" aria-hidden="true">10</span>
          {profile.media.hero && <img src={profile.media.hero} alt="Transparent black-and-white manga cutout of Sae Itoshi" />}
          <figcaption>THE PRODIGY / JAPAN U-20</figcaption>
        </figure>
      </section>

      <div className="preview-section-rubric">
        <span>SELECTED PAGES</span>
        <span>{String(visibleSections.length).padStart(2, "0")} PANELS <i>/</i> 解析</span>
      </div>

      <div className="preview-sections">
        {visibleSections.map((section, index) => (
          <PreviewSection
            key={section.id}
            section={section}
            index={index}
            layoutPreset={profile.layoutPreset}
            enableSpotifyPlayback={enableSpotifyPlayback}
            isDark={isDark}
            onSpotifyMetadataChange={onSpotifyMetadataChange}
          />
        ))}
        {!visibleSections.length && (
          <p className="preview-empty">THE PAGE IS WAITING FOR ITS NEXT PANEL.</p>
        )}
      </div>

      <footer className="bio-preview-footer">
        <span>UNOFFICIAL CHARACTER SCRAPBOOK</span>
        <span>TURN THE PAGE <b>↘</b></span>
      </footer>
      {sectionActions}
    </article>
  );
}

function PreviewSection({ section, index, layoutPreset, enableSpotifyPlayback, isDark, onSpotifyMetadataChange }) {
  const sectionNumber = String(index + 1).padStart(2, "0");

  if (section.kind === "music") {
    const trackLabel = section.caption || "SIDE B / LISTENING NOTES";
    return (
      <section className="preview-panel preview-music" aria-label={section.title}>
        <p className="preview-kicker">{sectionNumber} / {trackLabel}</p>
        <h2>{section.title}</h2>
        <SpotifyMusicCard
          section={section}
          isDark={isDark}
          onMetadataChange={onSpotifyMetadataChange ? (metadata) => onSpotifyMetadataChange(section.id, metadata) : undefined}
          showEmbedLauncher={enableSpotifyPlayback}
        />
      </section>
    );
  }

  return (
    <section className={`preview-panel preview-${section.kind} ${layoutPreset === "field-notes" ? "field-notes-panel" : ""}`}>
      {section.image && (
        <figure className="preview-panel-image">
          <img src={section.image} alt={section.imageAlt} loading="lazy" />
          <figcaption>{section.caption}</figcaption>
        </figure>
      )}
      <div className="preview-panel-copy">
        <p className="preview-kicker">{sectionNumber} / {section.kind.toUpperCase()}</p>
        <h2>{section.title}</h2>
        <p>{section.body}</p>
      </div>
    </section>
  );
}
