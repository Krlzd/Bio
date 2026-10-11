import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createSectionId, defaultProfile } from "./data/defaultProfile.js";
import { DRAFT_STORAGE_KEY, loadProfileDraft } from "./data/profileDraft.js";
import {
  deleteUnusedProfileImage,
  fetchDraft,
  fetchPublishedProfile,
  isProfileSnapshot,
  publishDraft,
  saveDraft,
  uploadProfileImage,
  verifyProfileOwner
} from "./data/supabaseProfileApi.js";
import { ProfilePreview } from "./ProfilePreview.jsx";
import { parseSpotifyTrackUrl } from "./spotify.js";
import { supabase, supabaseConfigurationError } from "./supabaseClient.js";
import "./studio.css";

function ProfileStudio() {
  const [initialDraft] = useState(loadProfileDraft);
  const [profile, setProfile] = useState(initialDraft.profile);
  const [draftStatus, setDraftStatus] = useState(initialDraft.warning || "Changes save in this browser.");
  const skipInitialDraftWrite = useRef(true);
  const [selectedId, setSelectedId] = useState(profile.sections[0]?.id ?? null);
  const [previewMode, setPreviewMode] = useState("day");
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [ownerCheck, setOwnerCheck] = useState({ status: "idle", message: "" });
  const [cloudDraft, setCloudDraft] = useState(null);
  const [cloudStatus, setCloudStatus] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [assetStatus, setAssetStatus] = useState("");
  const selectedSection = useMemo(
    () => profile.sections.find((section) => section.id === selectedId) ?? null,
    [profile.sections, selectedId]
  );
  const localDraftMatchesCloud = Boolean(
    cloudDraft && stableSerialize(profile) === stableSerialize(cloudDraft.content)
  );

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setAuthReady(true);
    }).catch((error) => {
      if (!active) return;
      setAuthError(error instanceof Error ? error.message : "Could not check your Supabase session.");
      setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthError("");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || !supabase) {
      setOwnerCheck({ status: "idle", message: "" });
      setCloudDraft(null);
      setCloudStatus("");
      return undefined;
    }

    let active = true;
    setOwnerCheck({ status: "checking", message: "Verifying the account against the database owner allowlist…" });
    verifyProfileOwner(supabase).then((authorized) => {
      if (!active) return;
      setOwnerCheck(authorized
        ? { status: "owner", message: "" }
        : { status: "denied", message: "This signed-in account is not the explicitly authorized profile owner." });
    }).catch((error) => {
      if (!active) return;
      setOwnerCheck({ status: "error", message: describeDatabaseError(error) });
    });

    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (!session || !supabase || ownerCheck.status !== "owner") {
      setCloudDraft(null);
      setCloudStatus("");
      return undefined;
    }

    let active = true;
    setCloudStatus("Checking for a saved cloud draft…");
    fetchDraft(supabase).then((draft) => {
      if (!active) return;
      setCloudDraft(draft);
      setCloudStatus(draft ? "A cloud draft is available. Load it or keep your local draft." : "No cloud draft exists yet. Your local draft has not been changed.");
    }).catch((error) => {
      if (!active) return;
      setCloudStatus(describeDatabaseError(error));
    });
    return () => { active = false; };
  }, [session, ownerCheck.status]);

  useEffect(() => {
    if (skipInitialDraftWrite.current) {
      skipInitialDraftWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(profile));
      setDraftStatus("Draft saved in this browser.");
    } catch {
      setDraftStatus("Browser storage is unavailable; keep this tab open or copy your changes before leaving.");
    }
  }, [profile]);

  const updateProfile = (key, value) => {
    setProfile((current) => ({
      ...current,
      profile: { ...current.profile, [key]: value }
    }));
  };

  const downloadLocalBackup = () => {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `sae-profile-draft-${date}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const updateTheme = (key, value) => {
    setProfile((current) => ({
      ...current,
      theme: { ...current.theme, [key]: value }
    }));
  };

  const updateSelectedSection = (key, value) => {
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === selectedId
          ? { ...section, [key]: value, ...(key === "spotifyUrl" ? { spotifyMetadata: null } : {}) }
          : section
      )
    }));
  };

  const updateSpotifyMetadata = useCallback((sectionId, metadata) => {
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId &&
        parseSpotifyTrackUrl(section.spotifyUrl ?? "")?.trackId === metadata.trackId &&
        section.spotifyMetadata?.trackId !== metadata.trackId
          ? { ...section, spotifyMetadata: metadata }
          : section
      )
    }));
  }, []);

  const toggleSection = (id) => {
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === id ? { ...section, visible: !section.visible } : section
      )
    }));
  };

  const moveSection = (id, offset) => {
    setProfile((current) => {
      const from = current.sections.findIndex((section) => section.id === id);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= current.sections.length) return current;
      const sections = [...current.sections];
      [sections[from], sections[to]] = [sections[to], sections[from]];
      return { ...current, sections };
    });
  };

  const addSection = () => {
    const section = {
      id: createSectionId(),
      kind: "note",
      title: "A NEW MARGIN NOTE.",
      body: "Write a new thought in the margin.",
      image: defaultProfile.sections[1].image,
      imageAlt: "Sae Itoshi in a monochrome manga portrait",
      caption: "FIELD NOTE / NEW",
      visible: true
    };
    setProfile((current) => ({ ...current, sections: [...current.sections, section] }));
    setSelectedId(section.id);
  };

  const addMusicSection = () => {
    const section = {
      id: createSectionId(),
      kind: "music",
      title: "AFTER THE FINAL WHISTLE.",
      body: "A track for the walk back to the center circle.",
      caption: "SIDE B / LISTENING NOTES",
      spotifyUrl: "",
      spotifyMetadata: null,
      visible: true
    };
    setProfile((current) => ({ ...current, sections: [...current.sections, section] }));
    setSelectedId(section.id);
  };

  const duplicateSection = () => {
    if (!selectedSection) return;
    const copy = { ...selectedSection, id: createSectionId(), title: `${selectedSection.title} / COPY` };
    const index = profile.sections.findIndex((section) => section.id === selectedId);
    setProfile((current) => {
      const sections = [...current.sections];
      sections.splice(index + 1, 0, copy);
      return { ...current, sections };
    });
    setSelectedId(copy.id);
  };

  const removeSection = () => {
    if (!selectedSection) return;
    const remaining = profile.sections.filter((section) => section.id !== selectedId);
    setProfile((current) => ({ ...current, sections: remaining }));
    setSelectedId(remaining[0]?.id ?? null);
  };

  const uploadImage = async (event, target) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !supabase || !session?.user) return;
    setAssetStatus("Uploading image to the public profile bucket…");
    try {
      const imageUrl = await uploadProfileImage(supabase, file);
      setProfile((current) => {
        if (target.type === "hero") {
          return { ...current, media: { ...current.media, hero: imageUrl } };
        }
        return {
          ...current,
          sections: current.sections.map((section) =>
            section.id === target.id ? { ...section, image: imageUrl } : section
          )
        };
      });
      setAssetStatus("Image uploaded. Save the profile draft to keep this image reference, then publish when ready.");
    } catch (error) {
      setAssetStatus(error instanceof Error ? error.message : "Image upload failed. The profile was not changed.");
    }
  };

  const removeImage = async (target, imageUrl) => {
    if (!imageUrl) return;
    const nextProfile = target.type === "hero"
      ? { ...profile, media: { ...profile.media, hero: "" } }
      : {
          ...profile,
          sections: profile.sections.map((section) =>
            section.id === target.id
              ? Object.fromEntries(Object.entries(section).filter(([key]) => key !== "image"))
              : section
          )
        };
    const isStoredImage = imageUrl.includes("/storage/v1/object/public/bio-media/");
    const confirmation = isStoredImage
      ? "Remove this uploaded image from the draft and delete its stored file? Deletion is blocked while any currently published profile still uses it."
      : "Remove this image from the draft? The original bundled asset will remain untouched.";
    if (!window.confirm(confirmation)) return;

    setAssetStatus(isStoredImage ? "Checking published references before deletion…" : "Removing image from the draft…");
    try {
      if (isStoredImage) {
        await deleteUnusedProfileImage(supabase, imageUrl, nextProfile);
      }
      setProfile(nextProfile);
      setAssetStatus("Image removed from the draft. Save the draft and publish separately to update the public page.");
    } catch (error) {
      setAssetStatus(error instanceof Error ? error.message : "Image could not be removed. The profile was not changed.");
    }
  };

  const reloadCloudDraft = async () => {
    if (!supabase) return;
    if (!window.confirm("Replace the current editor contents with the latest cloud draft? Download a local backup first if you need to preserve these edits.")) return;
    setCloudBusy(true);
    setCloudStatus("Reloading the cloud draft…");
    try {
      const draft = await fetchDraft(supabase);
      if (!draft) {
        setCloudDraft(null);
        setCloudStatus("No cloud draft exists. Your current local edits were not replaced.");
        return;
      }
      if (!isProfileSnapshot(draft.content)) {
        setCloudStatus("The cloud draft has an unsupported profile shape and was not loaded.");
        return;
      }
      setCloudDraft(draft);
      setProfile(draft.content);
      setSelectedId(draft.content.sections[0]?.id ?? null);
      setCloudStatus("Latest cloud draft loaded. Review it before saving or publishing.");
    } catch (error) {
      setCloudStatus(describeDatabaseError(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const signIn = async (event) => {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (error) {
        setAuthError("Sign-in failed. Check the email and password for your existing Supabase user.");
        return;
      }
      if (!data.session) {
        setAuthError("Supabase did not start a session. Check whether this existing account still needs email confirmation.");
        return;
      }
      setPassword("");
      setSession(data.session);
    } catch {
      setAuthError("Supabase could not be reached. Check your connection and project URL, then try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setAuthError(`Sign-out failed: ${error.message}`);
        return;
      }
      setSession(null);
      setOwnerCheck({ status: "idle", message: "" });
      setCloudDraft(null);
      setCloudStatus("");
    } catch {
      setAuthError("Supabase could not be reached to sign out. Close this tab or retry when your connection is restored.");
    } finally {
      setAuthBusy(false);
    }
  };

  const saveCloudDraft = async () => {
    if (!supabase || !session?.user) return;
    if (cloudDraft && !window.confirm("Replace the saved cloud draft with this browser's local draft? Your published profile will not change until you publish.")) return;
    setCloudBusy(true);
    setCloudStatus("Saving this editor draft to Supabase…");
    try {
      const saved = await saveDraft(supabase, session.user.id, profile, cloudDraft);
      setCloudDraft(saved);
      setCloudStatus("Cloud draft saved. Publishing is a separate step.");
    } catch (error) {
      setCloudStatus(describeDatabaseError(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const publishCloudDraft = async () => {
    if (!supabase || !cloudDraft || !localDraftMatchesCloud) return;
    if (!window.confirm("Publish the saved cloud draft now? This replaces the currently public profile.")) return;
    setCloudBusy(true);
    setCloudStatus("Publishing the saved cloud draft…");
    try {
      const publishedAt = await publishDraft(supabase, cloudDraft.updated_at);
      const publication = await fetchPublishedProfile(supabase);
      const expectedContent = {
        ...cloudDraft.content,
        sections: cloudDraft.content.sections.filter((section) => section.visible === true)
      };
      if (!publication || !isProfileSnapshot(publication.content) ||
          stableSerialize(publication.content) !== stableSerialize(expectedContent)) {
        setCloudStatus("The publish request completed, but the saved public snapshot could not be verified. Reload the public page and check Supabase before retrying.");
        return;
      }
      setCloudStatus(`Published and verified${publishedAt ? ` at ${new Date(publishedAt).toLocaleString()}` : ""}.`);
    } catch (error) {
      setCloudStatus(describeDatabaseError(error));
    } finally {
      setCloudBusy(false);
    }
  };

  if (!authReady) {
    return <main className="auth-screen"><p role="status">Checking Supabase sign-in…</p></main>;
  }

  if (!session) {
    return (
      <main className="auth-screen">
        <section className="auth-panel panel-frame" aria-labelledby="auth-heading">
          <a className="studio-wordmark" href={`${import.meta.env.BASE_URL}`} aria-label="Return to public preview">
            <span className="studio-logo" aria-hidden="true">冴</span>
            <span>PROFILE STUDIO <b>/</b> SAE 10</span>
          </a>
          <p className="studio-kicker">PRIVATE EDITOR / AUTHENTICATED ACCESS</p>
          <h1 id="auth-heading">SIGN IN TO <em>EDIT.</em></h1>
          <p className="auth-intro">Use the existing owner account in your Supabase project. This page does not create accounts or validate passwords locally.</p>
          {supabaseConfigurationError ? (
            <p className="auth-message auth-error" role="alert">{supabaseConfigurationError}</p>
          ) : (
            <form className="auth-form" onSubmit={signIn}>
              <label className="field-label" htmlFor="auth-email">EMAIL</label>
              <input id="auth-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
              <label className="field-label" htmlFor="auth-password">PASSWORD</label>
              <input id="auth-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              {authError && <p className="auth-message auth-error" role="alert">{authError}</p>}
              <button className="button button-ink" type="submit" disabled={authBusy}>{authBusy ? "SIGNING IN…" : "SIGN IN"}</button>
            </form>
          )}
          <a className="text-link auth-back" href={`${import.meta.env.BASE_URL}`}>← BACK TO PUBLIC PAGE</a>
        </section>
      </main>
    );
  }

  if (ownerCheck.status !== "owner") {
    return (
      <main className="auth-screen">
        <section className="auth-panel panel-frame" aria-labelledby="owner-check-heading">
          <p className="studio-kicker">PRIVATE EDITOR / OWNER CHECK</p>
          <h1 id="owner-check-heading">{ownerCheck.status === "checking" ? "VERIFYING ACCESS." : "EDITOR LOCKED."}</h1>
          <p className={`auth-message ${ownerCheck.status === "checking" ? "" : "auth-error"}`} role={ownerCheck.status === "checking" ? "status" : "alert"}>
            {ownerCheck.message || "The signed-in account has not been verified yet."}
          </p>
          <button className="button button-outline" type="button" disabled={authBusy} onClick={signOut}>SIGN OUT</button>
        </section>
      </main>
    );
  }

  return (
    <main className="studio-app">
      <header className="studio-header">
        <a className="studio-wordmark" href={`${import.meta.env.BASE_URL}`} aria-label="Open public preview">
          <span className="studio-logo" aria-hidden="true">冴</span>
          <span>PROFILE STUDIO <b>/</b> SAE 10</span>
        </a>
        <div className="studio-header-actions">
          <span className="signed-in-label">{session.user.email}</span>
          <button className="text-link" type="button" onClick={signOut} disabled={authBusy}>SIGN OUT</button>
          <a className="text-link" href={`${import.meta.env.BASE_URL}`} target="_blank" rel="noreferrer">OPEN PREVIEW ↗</a>
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Preview ${previewMode === "day" ? "dark" : "light"} mode`}
            aria-pressed={previewMode === "night"}
            onClick={() => setPreviewMode((mode) => mode === "day" ? "night" : "day")}
          >
            {previewMode === "day" ? "☾" : "☼"}
          </button>
        </div>
      </header>

      <div className="prototype-banner" role="status">
        <span className="prototype-dot" aria-hidden="true"></span>
        LOCAL SAFETY COPY <b>—</b> {draftStatus.toUpperCase()} SUPABASE SAVING IS SEPARATE.
      </div>
      <section className="cloud-draft-bar panel-frame" aria-label="Supabase draft and publishing">
        <div>
          <p className="studio-kicker">SUPABASE / PROFILE {cloudDraft ? "DRAFT FOUND" : "DRAFT"}</p>
          <p className="cloud-draft-status" role="status">{cloudStatus || "Checking cloud profile status…"}</p>
        </div>
        <div className="cloud-draft-actions">
          <button className="button button-outline" type="button" onClick={downloadLocalBackup}>DOWNLOAD LOCAL BACKUP</button>
          <button className="button button-outline" type="button" disabled={cloudBusy} onClick={reloadCloudDraft}>RELOAD CLOUD DRAFT</button>
          {cloudDraft && (
            <button className="button button-outline" type="button" disabled={cloudBusy} onClick={() => {
              if (window.confirm("Replace the current editor contents with the saved cloud draft? Download a local backup first if you need to preserve these unsaved edits.")) {
                if (!isProfileSnapshot(cloudDraft.content)) {
                  setCloudStatus("The cloud draft has an unsupported profile shape and was not loaded.");
                  return;
                }
                setProfile(cloudDraft.content);
                setSelectedId(cloudDraft.content.sections[0]?.id ?? null);
                setCloudStatus("Loaded the cloud draft into the editor. Save it again to confirm cloud changes.");
              }
            }}>LOAD CLOUD DRAFT</button>
          )}
          <button className="button button-outline" type="button" disabled={cloudBusy || !supabase || localDraftMatchesCloud} onClick={saveCloudDraft}>
            {cloudBusy ? "PLEASE WAIT…" : "SAVE DRAFT"}
          </button>
          <button className="button button-ink" type="button" disabled={cloudBusy || !localDraftMatchesCloud} onClick={publishCloudDraft}>
            PUBLISH
          </button>
        </div>
      </section>

      <section className="studio-heading">
        <div>
          <p className="studio-kicker">CONTROL ROOM / 01</p>
          <h1>SHAPE THE <em>PAGE.</em></h1>
        </div>
        <div className="studio-save-status">
          <span>DRAFT STATUS</span>
          <strong>LOCAL PREVIEW</strong>
        </div>
      </section>

      <div className="studio-workspace">
        <aside className="section-rail panel-frame" aria-labelledby="sections-heading">
          <div className="panel-heading">
            <div>
              <p className="studio-kicker">01 / STRUCTURE</p>
              <h2 id="sections-heading">PAGE SECTIONS</h2>
            </div>
            <span className="count-stamp">{String(profile.sections.length).padStart(2, "0")}</span>
          </div>
          <p className="panel-hint">Select a panel to edit it. Use arrows to set its page order.</p>
          <ol className="section-list">
            {profile.sections.map((section, index) => (
              <li className={selectedId === section.id ? "is-selected" : ""} key={section.id}>
                <button className="section-select" type="button" onClick={() => setSelectedId(section.id)} aria-current={selectedId === section.id ? "true" : undefined}>
                  <span className="section-order">{String(index + 1).padStart(2, "0")}</span>
                  <span className="section-label">{section.title}</span>
                  <span className={`visibility-mark ${section.visible ? "is-visible" : ""}`} aria-label={section.visible ? "Visible" : "Hidden"}>{section.visible ? "●" : "○"}</span>
                </button>
                <div className="section-row-actions" aria-label={`Actions for ${section.title}`}>
                  <button type="button" aria-label={`Move ${section.title} up`} disabled={index === 0} onClick={() => moveSection(section.id, -1)}>↑</button>
                  <button type="button" aria-label={`Move ${section.title} down`} disabled={index === profile.sections.length - 1} onClick={() => moveSection(section.id, 1)}>↓</button>
                  <button type="button" aria-label={`${section.visible ? "Hide" : "Show"} ${section.title}`} onClick={() => toggleSection(section.id)}>{section.visible ? "HIDE" : "SHOW"}</button>
                </div>
              </li>
            ))}
          </ol>
          <button className="button button-outline add-section" type="button" onClick={addSection}><span aria-hidden="true">＋</span> ADD A NOTE</button>
          <button className="button button-outline add-section add-music-section" type="button" onClick={addMusicSection}><span aria-hidden="true">♫</span> ADD SPOTIFY MUSIC</button>
          {selectedSection && (
            <div className="section-management">
              <button className="text-link" type="button" onClick={duplicateSection}>DUPLICATE PANEL</button>
              <button className="text-link text-link-danger" type="button" onClick={removeSection}>REMOVE PANEL</button>
            </div>
          )}
        </aside>

        <section className="preview-column" aria-labelledby="preview-heading">
          <div className="preview-toolbar">
            <div>
              <p className="studio-kicker">02 / LIVE CANVAS</p>
              <h2 id="preview-heading">SCRAPBOOK PREVIEW</h2>
            </div>
            <label className="preset-control">
              <span>LAYOUT</span>
              <select value={profile.layoutPreset} onChange={(event) => setProfile((current) => ({ ...current, layoutPreset: event.target.value }))}>
                <option value="scrapbook">SCRAPBOOK</option>
                <option value="field-notes">FIELD NOTES</option>
              </select>
            </label>
          </div>
          <div className="preview-stage">
            <ProfilePreview
              profile={profile}
              isDark={previewMode === "night"}
              onSpotifyMetadataChange={updateSpotifyMetadata}
            />
          </div>
        </section>

        <aside className="inspector panel-frame" aria-labelledby="inspector-heading">
          <div className="panel-heading">
            <div>
              <p className="studio-kicker">03 / PROPERTIES</p>
              <h2 id="inspector-heading">INSPECTOR</h2>
            </div>
            <span className="inspector-mark" aria-hidden="true">✳</span>
          </div>
          <div className="inspector-scroll">
            <fieldset className="property-group">
              <legend>PROFILE / IDENTITY</legend>
              <label className="field-label" htmlFor="display-name">DISPLAY NAME</label>
              <input id="display-name" value={profile.profile.displayName} onChange={(event) => updateProfile("displayName", event.target.value)} maxLength={48} />
              <label className="field-label" htmlFor="username">USERNAME</label>
              <div className="input-prefix"><span>@</span><input id="username" value={profile.profile.username} onChange={(event) => updateProfile("username", event.target.value.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 24))} maxLength={24} /></div>
              <label className="field-label" htmlFor="status">STATUS / NOW</label>
              <input id="status" value={profile.profile.status} onChange={(event) => updateProfile("status", event.target.value)} maxLength={72} />
              <label className="field-label" htmlFor="introduction">INTRODUCTION</label>
              <textarea id="introduction" value={profile.profile.introduction} onChange={(event) => updateProfile("introduction", event.target.value)} rows={3} maxLength={240} />
              <label className="field-label" htmlFor="hero-image-upload">HERO IMAGE</label>
              <div className="asset-controls">
                <input
                  id="hero-image-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  disabled={cloudBusy}
                  onChange={(event) => uploadImage(event, { type: "hero" })}
                />
                <button className="text-link text-link-danger" type="button" disabled={!profile.media.hero || cloudBusy} onClick={() => removeImage({ type: "hero" }, profile.media.hero)}>REMOVE IMAGE</button>
              </div>
              <p className="panel-hint">PNG, JPEG, WebP, GIF, or AVIF; maximum 8 MiB. Uploaded images are publicly accessible.</p>
            </fieldset>

            <fieldset className="property-group">
              <legend>INK / COLOR STUDY</legend>
              <ColorControl label="PAPER" id="paper-color" value={profile.theme.paper} onChange={(value) => updateTheme("paper", value)} />
              <ColorControl label="INK" id="ink-color" value={profile.theme.ink} onChange={(value) => updateTheme("ink", value)} />
              <ColorControl label="ICY TEAL" id="teal-color" value={profile.theme.teal} onChange={(value) => updateTheme("teal", value)} />
              <ColorControl label="MUTED BLUE" id="blue-color" value={profile.theme.blue} onChange={(value) => updateTheme("blue", value)} />
            </fieldset>

            <fieldset className="property-group selected-properties">
              <legend>SELECTED PANEL</legend>
              {selectedSection ? (
                <>
                  <p className="selected-type">{selectedSection.kind.toUpperCase()} / {selectedSection.id}</p>
                  <label className="field-label" htmlFor="section-title">HEADING</label>
                  <input id="section-title" value={selectedSection.title} onChange={(event) => updateSelectedSection("title", event.target.value)} maxLength={80} />
                  <label className="field-label" htmlFor="section-copy">PANEL TEXT</label>
                  <textarea id="section-copy" value={selectedSection.body} onChange={(event) => updateSelectedSection("body", event.target.value)} rows={4} maxLength={420} />
                  {selectedSection.kind !== "music" && (
                    <>
                      <label className="field-label" htmlFor="section-image-upload">PANEL IMAGE</label>
                      <div className="asset-controls">
                        <input
                          id="section-image-upload"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                          disabled={cloudBusy}
                          onChange={(event) => uploadImage(event, { type: "section", id: selectedSection.id })}
                        />
                        <button className="text-link text-link-danger" type="button" disabled={!selectedSection.image || cloudBusy} onClick={() => removeImage({ type: "section", id: selectedSection.id }, selectedSection.image)}>REMOVE IMAGE</button>
                      </div>
                      <label className="field-label" htmlFor="section-image-alt">IMAGE DESCRIPTION</label>
                      <input id="section-image-alt" value={selectedSection.imageAlt ?? ""} onChange={(event) => updateSelectedSection("imageAlt", event.target.value)} maxLength={180} />
                    </>
                  )}
                  {selectedSection.kind === "music" && (
                    <>
                      <label className="field-label" htmlFor="spotify-url">SPOTIFY TRACK URL</label>
                      <input
                        id="spotify-url"
                        type="url"
                        inputMode="url"
                        placeholder="https://open.spotify.com/track/…"
                        value={selectedSection.spotifyUrl ?? ""}
                        onChange={(event) => updateSelectedSection("spotifyUrl", event.target.value)}
                        aria-describedby="spotify-url-help"
                      />
                      <p className="spotify-url-help" id="spotify-url-help">
                        {selectedSection.spotifyUrl && !parseSpotifyTrackUrl(selectedSection.spotifyUrl)
                          ? "Use a Spotify track link, not an album, playlist, or search link."
                          : "The live preview fetches Spotify's public title and artwork. Artist details may not be included."}
                      </p>
                      <label className="field-label" htmlFor="spotify-label">MUSIC LABEL / SMALL HEADING</label>
                      <input
                        id="spotify-label"
                        value={selectedSection.caption ?? ""}
                        onChange={(event) => updateSelectedSection("caption", event.target.value)}
                        maxLength={48}
                      />
                    </>
                  )}
                </>
              ) : <p className="panel-hint">Add a panel to begin editing.</p>}
            </fieldset>
            {assetStatus && <p className="asset-status" role="status">{assetStatus}</p>}
          </div>
          <div className="inspector-actions">
            <p>{draftStatus} A separate browser copy remains saved locally as you edit.</p>
            <div>
              <button className="button button-outline" type="button" disabled title="Supabase draft controls are above the editor">CLOUD CONTROLS ↑</button>
              <button className="button button-ink" type="button" disabled={cloudBusy || !localDraftMatchesCloud} title={localDraftMatchesCloud ? "Publish the saved cloud draft" : "Save the current draft to Supabase before publishing"} onClick={publishCloudDraft}>PUBLISH</button>
            </div>
          </div>
        </aside>
      </div>
      <footer className="studio-footer"><span>LOCAL DRAFT / STORED IN THIS BROWSER ONLY</span><a href={`${import.meta.env.BASE_URL}`}>BACK TO PREVIEW ↑</a></footer>
    </main>
  );
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function describeDatabaseError(error) {
  const message = error?.message ?? "";
  if (/changed since it was loaded|changed in another tab|reload it before publishing/i.test(message)) {
    return "This cloud draft is stale. Reload the latest cloud draft before publishing; your current editor changes remain in the local safety copy.";
  }
  if (error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202") {
    return "The profile database has not been initialized (or its API schema cache has not refreshed). Do not retry publishing yet; apply the reviewed migration in Supabase first.";
  }
  if (error?.code === "42501" || error?.code === "PGRST301") {
    return "Supabase denied this operation. Confirm you signed in with the authorized owner account and that the reviewed RLS policies are installed.";
  }
  return `Supabase request failed: ${message || "unknown error"}. Your local browser draft is still available.`;
}

function ColorControl({ label, id, value, onChange }) {
  return (
    <label className="color-control" htmlFor={id}>
      <span>{label}</span>
      <span className="color-control-value">{value.toUpperCase()}</span>
      <input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

createRoot(document.getElementById("root")).render(<ProfileStudio />);
