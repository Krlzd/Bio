import { SpotifyMusicCard } from "./SpotifyMusicCard.jsx";

const defaultCopy = {
  mark: "冴",
  brand: "AJAX'S BIO",
  publicBrand: "AJAX'S BIO",
  editorLink: "OPEN THE EDITOR",
  darkModeLabel: "DARK INK",
  lightModeLabel: "LIGHT INK",
  pageMark: "№ 10",
  heroKicker: "CHARACTER FILE / 010",
  heroImageCaption: "THE PRODIGY / JAPAN U-20",
  heroImageMark: "10",
  sectionsHeading: "SELECTED PAGES",
  sectionCountSuffix: "PANELS",
  sectionDivider: "/",
  ratingLabel: "RATING",
  externalLinkLabel: "OFFICIAL PAGE",
  footerLeft: "UNOFFICIAL CHARACTER SCRAPBOOK",
  footerRight: "TURN THE PAGE ↘",
  spotifyDisclaimer: "PLAYBACK IS PROVIDED BY SPOTIFY. NO LOCAL PLAYER OR PLAYBACK PROGRESS IS SIMULATED."
};

function copyText(profile, key) {
  return profile.copy?.[key] ?? defaultCopy[key];
}

function showCopy(profile, key) {
  return profile.copyVisibility?.[key] !== false;
}

export function ProfilePreview({ profile, sectionActions, isDark, onSpotifyMetadataChange }) {
  const visibleSections = profile.sections.filter((section) =>
    section.visible !== false && (section.kind !== "music" || Boolean(section.spotifyUrl?.trim()))
  );
  const layout = profile.layout ?? {};
  const columns = Math.min(4, Math.max(1, Number(layout.columns) || 2));
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
      className={`bio-preview preset-${profile.layoutPreset} motion-${profile.effects?.intensity ?? "subtle"} ${profile.effects?.entrance === false ? "no-entrance" : ""} ${profile.effects?.hover === false ? "no-hover-effects" : ""} ${profile.effects?.backgroundMotion ? "moving-paper" : ""}`}
      style={previewStyle}
      aria-label={`Live preview for ${profile.profile.displayName}`}
    >
      <header className="bio-preview-header">
        {showCopy(profile, "mark") && copyText(profile, "mark") && <span className="preview-mark" aria-hidden="true">{copyText(profile, "mark")}</span>}
          {showCopy(profile, "brand") && copyText(profile, "brand") && <span className="preview-wordmark">{copyText(profile, "brand")}{profile.profileVisibility?.username !== false && profile.profile.username && <><b> / </b>{profile.profile.username}</>}</span>}
        {showCopy(profile, "pageMark") && <span className="preview-page-number">{copyText(profile, "pageMark")}</span>}
      </header>

      <section className="bio-hero">
        <div className="bio-hero-copy">
          {showCopy(profile, "heroKicker") && copyText(profile, "heroKicker") && <p className="preview-kicker">{copyText(profile, "heroKicker")}</p>}
          {(profile.profileVisibility?.displayName !== false && profile.profile.displayName || profile.profileVisibility?.heroTagline !== false && (profile.profile.heroTagline ?? "IN THE MARGINS.")) && (
            <h1>
              {profile.profileVisibility?.displayName !== false && profile.profile.displayName}
              {profile.profileVisibility?.heroTagline !== false && (profile.profile.heroTagline ?? "IN THE MARGINS.") && <><br /><em>{profile.profile.heroTagline ?? "IN THE MARGINS."}</em></>}
            </h1>
          )}
          {profile.profileVisibility?.status !== false && profile.profile.status && <p className="bio-status"><span aria-hidden="true">●</span> {profile.profile.status}</p>}
          {profile.profileVisibility?.introduction !== false && profile.profile.introduction && <p className="bio-introduction">{profile.profile.introduction}</p>}
        </div>
        <figure className="bio-hero-art">
          {showCopy(profile, "heroImageMark") && copyText(profile, "heroImageMark") && <span className="hero-annotation" aria-hidden="true">{copyText(profile, "heroImageMark")}</span>}
          {profile.media.hero && <img src={profile.media.hero} alt={profile.media.heroAlt ?? "Transparent black-and-white manga cutout of Sae Itoshi"} />}
          {showCopy(profile, "heroImageCaption") && copyText(profile, "heroImageCaption") && <figcaption>{copyText(profile, "heroImageCaption")}</figcaption>}
        </figure>
      </section>

      {(showCopy(profile, "sectionsHeading") || showCopy(profile, "sectionCountSuffix")) && (
        <div className="preview-section-rubric">
          {showCopy(profile, "sectionsHeading") && copyText(profile, "sectionsHeading") && <span>{copyText(profile, "sectionsHeading")}</span>}
          {showCopy(profile, "sectionCountSuffix") && copyText(profile, "sectionCountSuffix") && <span>{String(visibleSections.length).padStart(2, "0")} {copyText(profile, "sectionCountSuffix")}</span>}
        </div>
      )}

      <div
        className={`preview-sections layout-${layout.mode ?? "grid"}`}
        style={{ "--section-columns": columns, "--section-gap": `${Math.min(48, Math.max(0, Number(layout.gap) || 0))}px` }}
      >
        {visibleSections.map((section, index) => (
          <PreviewSection
            key={section.id}
            section={section}
            index={index}
            layoutPreset={profile.layoutPreset}
            profile={profile}
            isDark={isDark}
            onSpotifyMetadataChange={onSpotifyMetadataChange}
          />
        ))}
      </div>

      {(showCopy(profile, "footerLeft") && copyText(profile, "footerLeft") || showCopy(profile, "footerRight") && copyText(profile, "footerRight")) && (
        <footer className="bio-preview-footer">
          {showCopy(profile, "footerLeft") && copyText(profile, "footerLeft") && <span>{copyText(profile, "footerLeft")}</span>}
          {showCopy(profile, "footerRight") && copyText(profile, "footerRight") && <span>{copyText(profile, "footerRight")}</span>}
        </footer>
      )}
      {sectionActions}
    </article>
  );
}

function PreviewSection({ section, index, layoutPreset, profile, isDark, onSpotifyMetadataChange }) {
  const sectionNumber = String(index + 1).padStart(2, "0");
  const sectionLayout = section.layout ?? {};
  const width = sectionLayout.width ?? "half";
  const arrangement = profile.layout?.mode ?? "grid";
  const columns = Math.min(4, Math.max(1, Number(profile.layout?.columns) || 2));
  const span = width === "full" ? columns : width === "half" ? Math.max(1, Math.ceil(columns / 2)) : width === "third" ? Math.max(1, Math.ceil(columns / 3)) : 1;
  const customWidth = Math.min(100, Math.max(20, Number(sectionLayout.customWidth) || 50));
  const presetWidth = width === "full" ? 100
    : width === "half" ? 50
      : width === "third" ? 100 / 3
        : width === "compact" ? 25
          : customWidth;
  const gridItemWidth = width === "full" ? undefined
    : width === "custom" ? `${customWidth}%`
      : `${Math.min(100, presetWidth * columns / span)}%`;
  const textureImage = sectionLayout.texture === "halftone"
    ? "radial-gradient(circle, color-mix(in srgb, var(--preview-ink) 12%, transparent) .6px, transparent .8px)"
    : sectionLayout.texture === "speed-lines"
      ? "repeating-linear-gradient(135deg, transparent 0 17px, color-mix(in srgb, var(--preview-ink) 5%, transparent) 17px 18px)"
      : "";
  const backgroundImageUrl = safeImageUrl(sectionLayout.backgroundImage);
  const backgroundTint = backgroundImageUrl
    ? "linear-gradient(color-mix(in srgb, var(--preview-card) 72%, transparent), color-mix(in srgb, var(--preview-card) 72%, transparent))"
    : "";
  const backgroundImages = [
    textureImage,
    backgroundTint,
    backgroundImageUrl ? `url("${backgroundImageUrl}")` : ""
  ].filter(Boolean);
  const isStrip = arrangement === "strip";
  const isRows = arrangement === "rows";
  const layoutStyle = {
    "--panel-order": index,
    gridColumn: isRows ? "1 / -1" : width === "custom" || width === "full" ? `1 / -1` : `span ${span}`,
    width: isStrip ? undefined : isRows ? width === "custom" ? `${customWidth}%` : "100%" : gridItemWidth,
    flexBasis: `${presetWidth}%`,
    marginInlineStart: isStrip && sectionLayout.horizontalAlign !== "start" ? "auto" : undefined,
    marginInlineEnd: isStrip && sectionLayout.horizontalAlign !== "end" ? "auto" : undefined,
    minHeight: sectionLayout.height === "tall" ? "340px" : sectionLayout.height === "short" ? "140px" : sectionLayout.height === "custom" ? `${Math.min(900, Math.max(90, Number(sectionLayout.customHeight) || 240))}px` : undefined,
    alignSelf: sectionLayout.align ?? "stretch",
    justifySelf: sectionLayout.horizontalAlign ?? "stretch",
    padding: Number.isFinite(Number(sectionLayout.padding)) ? `${Math.min(48, Math.max(0, Number(sectionLayout.padding)))}px` : undefined,
    backgroundColor: sectionLayout.background
      ? `color-mix(in srgb, ${sectionLayout.background} ${Math.min(100, Math.max(0, Number(sectionLayout.backgroundOpacity ?? 100)))}%, var(--preview-card))`
      : undefined,
    borderStyle: sectionLayout.borderStyle ?? undefined,
    borderWidth: Number.isFinite(Number(sectionLayout.borderWidth)) ? `${Math.min(8, Math.max(0, Number(sectionLayout.borderWidth)))}px` : undefined,
    borderRadius: Number.isFinite(Number(sectionLayout.radius)) ? `${Math.min(32, Math.max(0, Number(sectionLayout.radius)))}px` : undefined,
    boxShadow: sectionLayout.shadow ? "5px 5px 0 color-mix(in srgb, var(--preview-ink) 18%, transparent)" : undefined,
    backgroundImage: backgroundImages.length ? backgroundImages.join(", ") : undefined,
    backgroundSize: [
      sectionLayout.texture === "halftone" ? "5px 5px" : textureImage ? "auto" : "",
      backgroundTint ? "cover" : "",
      backgroundImageUrl ? "cover" : ""
    ].filter(Boolean).join(", ") || undefined,
    backgroundPosition: backgroundImageUrl ? "center" : undefined
  };

  if (section.kind === "music") {
    if (!section.spotifyUrl) return null;
    const trackLabel = section.copyVisibility?.caption !== false ? section.caption ?? "" : "";
    return (
      <section className="preview-panel preview-music" aria-label={section.title || "Spotify player"} style={layoutStyle}>
        {trackLabel && <p className="preview-kicker">{sectionNumber}{showCopy(profile, "sectionDivider") && copyText(profile, "sectionDivider") ? ` ${copyText(profile, "sectionDivider")} ` : " "}{trackLabel}</p>}
        {section.copyVisibility?.title !== false && section.title && <h2>{section.title}</h2>}
        {section.copyVisibility?.body !== false && section.body && <p className="spotify-description">{section.body}</p>}
        <SpotifyMusicCard
          section={section}
          isDark={isDark}
          onMetadataChange={onSpotifyMetadataChange ? (metadata) => onSpotifyMetadataChange(section.id, metadata) : undefined}
          disclaimer={showCopy(profile, "spotifyDisclaimer") ? copyText(profile, "spotifyDisclaimer") : ""}
          embedHeight={sectionLayout.embedHeight}
        />
      </section>
    );
  }

  if (section.kind === "games" || section.kind === "shows") {
    const entries = section.entries ?? profile.collections?.[section.kind] ?? [];
    return (
      <section className={`preview-panel preview-collection preview-${section.kind}`} style={layoutStyle}>
        {section.copyVisibility?.caption !== false && section.caption && <p className="preview-kicker">{sectionNumber}{showCopy(profile, "sectionDivider") && copyText(profile, "sectionDivider") ? ` ${copyText(profile, "sectionDivider")} ` : " "}{section.caption}</p>}
        {section.copyVisibility?.title !== false && section.title && <h2>{section.title}</h2>}
        {section.copyVisibility?.body !== false && section.body && <p className="collection-description">{section.body}</p>}
        <div className="collection-grid">
          {entries.filter((entry) => entry.visible !== false).map((entry) => (
            <CollectionEntry key={entry.id} entry={entry} profile={profile} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={`preview-panel preview-${section.kind} width-${width} height-${sectionLayout.height ?? "auto"} ${layoutPreset === "field-notes" ? "field-notes-panel" : ""}`} style={layoutStyle}>
      {section.image && (
      <figure className="preview-panel-image" style={{ height: sectionLayout.imageHeight ? `${Math.min(700, Math.max(70, Number(sectionLayout.imageHeight)))}px` : undefined }}>
          <img
            src={section.image}
            alt={section.imageAlt ?? ""}
            loading="lazy"
            style={{
              objectFit: sectionLayout.imageFit ?? "cover",
              objectPosition: sectionLayout.imagePosition ?? "center",
              transform: sectionLayout.imageRotation ? `rotate(${Math.min(20, Math.max(-20, Number(sectionLayout.imageRotation)))}deg)` : undefined
            }}
          />
          {section.copyVisibility?.caption !== false && section.caption && <figcaption>{section.caption}</figcaption>}
        </figure>
      )}
      {(section.copyVisibility?.title !== false && section.title || section.copyVisibility?.body !== false && section.body) && <div className="preview-panel-copy">
        {section.copyVisibility?.title !== false && section.title && <h2>{section.title}</h2>}
        {section.copyVisibility?.body !== false && section.body && <p>{section.body}</p>}
      </div>}
    </section>
  );
}

function safeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol !== "https:" && url.protocol !== window.location.protocol) return "";
    return url.href;
  } catch {
    return "";
  }
}

function CollectionEntry({ entry, profile }) {
  const visibility = entry.metadataVisibility ?? {};
  const visible = (key) => visibility[key] !== false && Boolean(entry[key]);
  let safeExternalUrl = "";
  try {
    const externalUrl = new URL(entry.externalUrl);
    if (externalUrl.protocol === "https:" || externalUrl.protocol === "http:") safeExternalUrl = externalUrl.href;
  } catch {
    safeExternalUrl = "";
  }
  return (
    <article className="collection-entry">
      {entry.metadataVisibility?.cover !== false && entry.image && <img className="collection-cover" src={entry.image} alt={visible("title") && entry.title ? `${entry.title} cover` : ""} loading="lazy" />}
      <div className="collection-entry-copy">
        {visible("title") && <h3>{entry.title}</h3>}
        {visible("note") && <p>{entry.note}</p>}
        {visible("platform") && <p className="collection-meta">{entry.platform}</p>}
        {visible("year") && <p className="collection-meta">{entry.year}</p>}
        {visible("developer") && <p className="collection-meta">{entry.developer}</p>}
        {visible("genre") && <p className="collection-meta">{entry.genre}</p>}
        {visible("status") && <p className="collection-meta">{entry.status}</p>}
        {visible("rating") && <p className="collection-meta">{showCopy(profile, "ratingLabel") && copyText(profile, "ratingLabel") ? `${copyText(profile, "ratingLabel")} / ` : ""}{entry.rating}</p>}
        {visible("mediaType") && <p className="collection-meta">{entry.mediaType}</p>}
        {visible("externalUrl") && safeExternalUrl && (
          <a href={safeExternalUrl} target="_blank" rel="noreferrer" aria-label={`Open ${entry.title || "item"} external page`}>
            {showCopy(profile, "externalLinkLabel") && copyText(profile, "externalLinkLabel") && <>{copyText(profile, "externalLinkLabel")} </>}
            <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    </article>
  );
}
