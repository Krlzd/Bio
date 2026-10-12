import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  cachePublishedProfile,
  fetchPublishedProfile,
  isProfileSnapshot,
  loadCachedPublishedProfile
} from "./data/supabaseProfileApi.js";
import { ProfilePreview } from "./ProfilePreview.jsx";
import { supabase, supabaseConfigurationError } from "./supabaseClient.js";
import "./studio.css";

function PublicPreview() {
  const [profile, setProfile] = useState(null);
  const [profileNotice, setProfileNotice] = useState(
    supabaseConfigurationError ? "Supabase is not configured; showing this browser's local preview." : "Loading the published profile…"
  );
  const [isDark, setIsDark] = useState(false);
  const publicBrand = profile?.copy?.publicBrand ?? "AJAX'S BIO";
  const editorLink = profile?.copy?.editorLink ?? "OPEN THE EDITOR";
  const modeLabel = isDark
    ? profile?.copy?.lightModeLabel ?? "LIGHT INK"
    : profile?.copy?.darkModeLabel ?? "DARK INK";
  const isCopyVisible = (key) => profile?.copyVisibility?.[key] !== false;

  useEffect(() => {
    if (!supabase) {
      const cached = loadCachedPublishedProfile();
      if (cached) {
        setProfile(cached.content);
        setIsDark(cached.content.theme.mode === "night");
        setProfileNotice("Supabase is not configured. Showing the last published profile cached in this browser.");
      } else {
        setProfileNotice("Supabase is not configured and this browser has no cached publication.");
      }
      return undefined;
    }
    let active = true;
    fetchPublishedProfile(supabase).then((publication) => {
      if (!active) return;
      if (publication && isProfileSnapshot(publication.content)) {
        setProfile(publication.content);
        setIsDark(publication.content.theme.mode === "night");
        cachePublishedProfile(publication);
        setProfileNotice("");
      } else {
        setProfile(null);
        setProfileNotice(publication
          ? "The published profile has an unsupported format and cannot be displayed."
          : "No published profile was found yet.");
      }
    }).catch(() => {
      if (!active) return;
      const cached = loadCachedPublishedProfile();
      if (cached) {
        setProfile(cached.content);
        setIsDark(cached.content.theme.mode === "night");
        setProfileNotice("Supabase is unavailable. Showing the last published profile cached in this browser.");
      } else {
        setProfile(null);
        setProfileNotice("The published profile could not be loaded and this browser has no cached copy.");
      }
    });
    return () => { active = false; };
  }, []);

  return (
    <main className="public-preview-page">
      <div className="public-preview-notice">
        {isCopyVisible("publicBrand") && publicBrand && <span>{publicBrand}</span>}
        <div className="public-preview-actions">
          <button
            className="preview-theme-toggle"
            type="button"
            aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
            aria-pressed={isDark}
            onClick={() => setIsDark((dark) => !dark)}
          >
            {isCopyVisible(isDark ? "lightModeLabel" : "darkModeLabel") && modeLabel ? modeLabel : "◐"}
          </button>
          {isCopyVisible("editorLink") && editorLink && <a href={`${import.meta.env.BASE_URL}admin/`}>{editorLink} <span aria-hidden="true">↗</span></a>}
        </div>
      </div>
      {profileNotice && <p className="public-profile-notice" role="status">{profileNotice}</p>}
      {profile
        ? <ProfilePreview profile={profile} isDark={isDark} />
        : <section className="public-empty-state" aria-live="polite"><h1>{profileNotice === "Loading the published profile…" ? "LOADING THE PAGE." : "NO PUBLISHED PROFILE."}</h1><p>{profileNotice === "Loading the published profile…" ? "Checking the published scrapbook…" : "The scrapbook will appear here after its owner publishes a profile."}</p></section>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<PublicPreview />);
