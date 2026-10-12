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
import { searchAniListAnime } from "./anilist.js";
import { fetchIgdbGameDetails, searchIgdbGames } from "./igdb.js";
import { featuredGameIdFor, moveOtherGameEntries } from "./gameCollection.js";
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
  const [animeSearch, setAnimeSearch] = useState("");
  const [animeSearchQuery, setAnimeSearchQuery] = useState("");
  const [animeResults, setAnimeResults] = useState([]);
  const [animeSearchStatus, setAnimeSearchStatus] = useState("");
  const [gameSearch, setGameSearch] = useState("");
  const [gameResults, setGameResults] = useState([]);
  const [gameSearchStatus, setGameSearchStatus] = useState("");
  const [gameSearchBusy, setGameSearchBusy] = useState(false);
  const [gameEditorTab, setGameEditorTab] = useState("favorite");
  const [availableGameScreenshots, setAvailableGameScreenshots] = useState({});
  const [gameScreenshotStatus, setGameScreenshotStatus] = useState({});
  const [activeGameScreenshot, setActiveGameScreenshot] = useState(null);
  const selectedSection = useMemo(
    () => profile.sections.find((section) => section.id === selectedId) ?? null,
    [profile.sections, selectedId]
  );
  const featuredGameId = selectedSection?.kind === "games" ? featuredGameIdFor(selectedSection) : "";
  const gameEditorEntries = selectedSection?.kind === "games"
    ? (selectedSection.entries ?? []).filter((entry) => gameEditorTab === "favorite"
      ? entry.id === featuredGameId
      : entry.id !== featuredGameId)
    : [];
  const editableCollectionEntries = selectedSection?.kind === "games"
    ? gameEditorEntries
    : selectedSection?.entries ?? [];
  const localDraftMatchesCloud = Boolean(
    cloudDraft && stableSerialize(profile) === stableSerialize(cloudDraft.content)
  );
  useEffect(() => {
    if (selectedSection?.kind !== "shows" || animeSearchQuery.trim().length < 2) {
      setAnimeResults([]);
      setAnimeSearchStatus("");
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAnimeSearchStatus("Searching AniList…");
      try {
        const results = await searchAniListAnime(animeSearchQuery, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setAnimeResults(results);
          setAnimeSearchStatus(results.length ? "" : "No anime matches. You can enter the show manually.");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setAnimeResults([]);
          setAnimeSearchStatus(error instanceof Error ? error.message : "Search failed. Manual entry is still available.");
        }
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [animeSearchQuery, selectedSection?.kind]);

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

  const updateProfileLayout = (key, value) => {
    setProfile((current) => ({
      ...current,
      layout: { ...(current.layout ?? {}), [key]: value }
    }));
  };

  const updateSectionLayout = (key, value) => {
    if (!selectedSection) return;
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === selectedId
          ? { ...section, layout: { ...(section.layout ?? {}), [key]: value } }
          : section
      )
    }));
  };

  const updateProfileCopy = (key, value) => {
    setProfile((current) => ({
      ...current,
      copy: { ...current.copy, [key]: value }
    }));
  };

  const setProfileFieldVisibility = (key, visible) => {
    setProfile((current) => ({
      ...current,
      profileVisibility: { ...current.profileVisibility, [key]: visible }
    }));
  };

  const resetProfileField = (key) => {
    setProfile((current) => ({
      ...current,
      profile: { ...current.profile, [key]: defaultProfile.profile[key] },
      profileVisibility: { ...current.profileVisibility, [key]: true }
    }));
  };

  const setSelectedTextVisibility = (key, visible) => {
    if (!selectedSection) return;
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === selectedId
        ? { ...section, copyVisibility: { ...section.copyVisibility, [key]: visible } }
        : section)
    }));
  };

  const resetSelectedText = (key) => {
    if (!selectedSection) return;
    const template = defaultProfile.sections.find((section) => section.id === selectedId)
      ?? defaultProfile.sections.find((section) => section.kind === selectedSection.kind);
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === selectedId
        ? {
            ...section,
            [key]: template?.[key] ?? "",
            copyVisibility: { ...section.copyVisibility, [key]: true }
          }
        : section)
    }));
  };

  const resetProfileCopy = (key) => {
    setProfile((current) => {
      const copy = { ...current.copy, [key]: defaultProfile.copy[key] };
      const copyVisibility = { ...current.copyVisibility };
      delete copyVisibility[key];
      return { ...current, copy, copyVisibility };
    });
  };

  const selectAniListResult = (result) => {
    if (!selectedSection) return;
    const entry = {
      ...result,
      id: createSectionId(),
      note: "",
      status: "",
      rating: "",
      metadataVisibility: {}
    };
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === selectedId
          ? { ...section, entries: [...(section.entries ?? []), entry] }
          : section
      )
    }));
    setAnimeSearch("");
    setAnimeSearchQuery("");
    setAnimeResults([]);
    setAnimeSearchStatus("");
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
    window.requestAnimationFrame(() => document.getElementById("spotify-url")?.focus());
  };

  const addCollectionSection = (kind) => {
    const isGames = kind === "games";
    const section = {
      id: createSectionId(),
      kind,
      title: isGames ? "FAVORITE GAMES" : "FAVORITE SHOWS & ANIME",
      caption: isGames ? "SAVE FILES / SELECTED" : "WATCHLIST / SELECTED",
      entries: [],
      visible: true,
      layout: { width: "full", height: "auto", borderStyle: "solid", padding: 12 }
    };
    setProfile((current) => ({ ...current, sections: [...current.sections, section] }));
    setSelectedId(section.id);
  };

  const addCollectionEntry = (sectionId) => {
    const entryId = createSectionId();
    const isFeaturedGame = profile.sections.find((section) => section.id === sectionId)?.kind === "games"
      && gameEditorTab === "favorite";
    const entry = {
      id: entryId,
      title: "",
      image: "",
      note: "",
      metadataVisibility: {}
    };
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              entries: [...(section.entries ?? []), entry],
              ...(isFeaturedGame ? { featuredGameId: entryId } : {})
            }
          : section
      )
    }));
  };

  const searchGames = async (event) => {
      event.preventDefault();
      if (!supabase || selectedSection?.kind !== "games") return;
      setGameSearchBusy(true);
      setGameSearchStatus("Searching IGDB…");
      setGameResults([]);
      try {
        const results = await searchIgdbGames(supabase, gameSearch);
        setGameResults(results);
        setGameSearchStatus(results.length ? `${results.length} IGDB result${results.length === 1 ? "" : "s"}. Select a title to add it to this local draft.` : "No matches found. You can still add a game manually.");
      } catch (error) {
        setGameSearchStatus(error instanceof Error ? error.message : "IGDB search failed. Manual game entry still works.");
      } finally {
        setGameSearchBusy(false);
      }
    };

  const selectIgdbGame = async (result) => {
      if (!selectedSection || selectedSection.kind !== "games" || gameSearchBusy) return;
      const existingEntry = (selectedSection.entries ?? []).find((entry) => Number(entry.igdbId) === Number(result.id));
      if (existingEntry) {
        if (gameEditorTab === "favorite") {
          setFeaturedGame(selectedSection.id, existingEntry.id);
          if (existingEntry.visible === false) {
            updateCollectionEntry(selectedSection.id, existingEntry.id, "visible", true);
          }
        }
        setGameSearchStatus(gameEditorTab === "favorite"
          ? `${existingEntry.title || result.title} is already in the collection and is now the featured game.`
          : `${existingEntry.title || result.title} is already in the collection.`);
        return;
      }
      setGameSearchBusy(true);
      setGameSearchStatus(gameEditorTab === "favorite"
        ? `Loading IGDB details and screenshots for ${result.title}…`
        : `Adding ${result.title} to Other Games…`);

      let game = result;
      let screenshots = [];
      let detailsWarning = "";
      if (gameEditorTab === "favorite") {
        try {
          const details = await fetchIgdbGameDetails(supabase, result.id);
          game = details.game;
          screenshots = details.screenshots;
        } catch (error) {
          detailsWarning = error instanceof Error ? error.message : "Details could not be loaded. You can still edit this entry manually.";
        }
      }

      const entryId = createSectionId();
      const entry = {
        id: entryId,
        title: game.title || result.title || "",
        sourceTitle: game.title || result.title || "",
        image: game.cover || result.cover || "",
        note: "",
        description: game.description ?? "",
        releaseDate: game.releaseDate ?? "",
        year: game.year ?? "",
        genre: (game.genres ?? []).join(", "),
        developer: (game.developers ?? []).join(", "),
        publisher: (game.publishers ?? []).join(", "),
        platform: (game.platforms ?? []).join(", "),
        rating: "",
        website: game.website ?? "",
        externalUrl: game.website ?? "",
        igdbId: game.id,
        igdbUrl: game.igdbUrl ?? result.igdbUrl ?? "",
        dataSource: "igdb",
        screenshots: [],
        featuredScreenshotId: "",
        favorite: false,
        metadataVisibility: {}
      };
      setProfile((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.id === selectedSection.id
            ? {
                ...section,
                entries: [...(section.entries ?? []), entry],
                ...(gameEditorTab === "favorite" ? { featuredGameId: entryId } : {})
              }
            : section
        )
      }));
      setAvailableGameScreenshots((current) => ({ ...current, [entryId]: screenshots }));
      if (gameEditorTab === "favorite") {
        setGameScreenshotStatus((current) => ({
          ...current,
          [entryId]: screenshots.length
            ? `${screenshots.length} IGDB screenshots available. Select the ones you want to keep in the profile.`
            : detailsWarning || "IGDB did not return screenshots for this game. You can upload your own."
        }));
      }
      setGameSearchStatus(gameEditorTab === "favorite"
        ? detailsWarning || `${entry.title} added as the featured game. Edit the showcase, then save the draft when ready.`
        : `${entry.title} added to Other Games. Save the draft when ready.`);
      setSelectedId(selectedSection.id);
      setGameSearchBusy(false);
    };

  const loadGameScreenshots = async (entry) => {
      const gameId = entry.igdbId;
      if (!supabase || !Number.isSafeInteger(Number(gameId))) return;
      setGameScreenshotStatus((current) => ({ ...current, [entry.id]: "Loading IGDB screenshots…" }));
      try {
        const details = await fetchIgdbGameDetails(supabase, gameId);
        setAvailableGameScreenshots((current) => ({ ...current, [entry.id]: details.screenshots }));
        setGameScreenshotStatus((current) => ({
          ...current,
          [entry.id]: details.screenshots.length
            ? `${details.screenshots.length} IGDB screenshots available. Select the ones you want to keep in the profile.`
            : "IGDB did not return screenshots for this game. You can upload your own."
        }));
      } catch (error) {
        setGameScreenshotStatus((current) => ({
          ...current,
          [entry.id]: error instanceof Error ? error.message : "Screenshots could not be loaded. You can upload your own."
        }));
      }
    };

  const toggleSourceScreenshot = (sectionId, entryId, screenshot) => {
      const currentEntry = profile.sections
        .find((section) => section.id === sectionId)
        ?.entries?.find((entry) => entry.id === entryId);
      const wasSelected = currentEntry?.screenshots?.some((item) => item.id === screenshot.id) ?? false;
      setProfile((current) => ({
        ...current,
        sections: current.sections.map((section) => section.id !== sectionId ? section : {
          ...section,
          entries: (section.entries ?? []).map((entry) => {
            if (entry.id !== entryId) return entry;
            const selectedScreenshots = entry.screenshots ?? [];
            const alreadySelected = selectedScreenshots.some((item) => item.id === screenshot.id);
            const nextScreenshots = alreadySelected
              ? selectedScreenshots.filter((item) => item.id !== screenshot.id)
              : [...selectedScreenshots, { ...screenshot, source: "igdb" }];
            return {
              ...entry,
              screenshots: nextScreenshots,
              featuredScreenshotId: alreadySelected && entry.featuredScreenshotId === screenshot.id
                ? nextScreenshots[0]?.id ?? ""
                : !alreadySelected && !entry.featuredScreenshotId ? screenshot.id : entry.featuredScreenshotId
            };
          })
        })
      }));
      setActiveGameScreenshot(wasSelected ? null : { entryId, url: screenshot.url });
    };

  const moveGameScreenshot = (sectionId, entryId, screenshotId, offset) => {
      setProfile((current) => ({
        ...current,
        sections: current.sections.map((section) => {
          if (section.id !== sectionId) return section;
          return {
            ...section,
            entries: (section.entries ?? []).map((entry) => {
              if (entry.id !== entryId) return entry;
              const screenshots = [...(entry.screenshots ?? [])];
              const from = screenshots.findIndex((item) => item.id === screenshotId);
              const to = from + offset;
              if (from < 0 || to < 0 || to >= screenshots.length) return entry;
              [screenshots[from], screenshots[to]] = [screenshots[to], screenshots[from]];
              return { ...entry, screenshots };
            })
          };
        })
      }));
    };

  const removeGameScreenshot = (sectionId, entryId, screenshot) => {
      if (activeGameScreenshot?.entryId === entryId && activeGameScreenshot.url === screenshot.url) {
        setActiveGameScreenshot(null);
      }
      if (screenshot.source === "upload") {
        removeImage({ type: "gameScreenshot", sectionId, id: entryId }, screenshot.url);
        return;
      }
      setProfile((current) => ({
        ...current,
        sections: current.sections.map((section) => section.id !== sectionId ? section : {
          ...section,
          entries: (section.entries ?? []).map((entry) => {
            if (entry.id !== entryId) return entry;
            const screenshots = (entry.screenshots ?? []).filter((item) => item.id !== screenshot.id);
            return {
              ...entry,
              screenshots,
              featuredScreenshotId: entry.featuredScreenshotId === screenshot.id
                ? screenshots[0]?.id ?? ""
                : entry.featuredScreenshotId
            };
          })
        })
      }));
    };

  const setFeaturedGame = (sectionId, entryId) => {
      setProfile((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId ? { ...section, featuredGameId: entryId } : section
        )
      }));
  };

  const moveOtherGame = (sectionId, entryId, offset) => {
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        if (section.id !== sectionId || section.kind !== "games") return section;
        return moveOtherGameEntries(section, entryId, offset);
      })
    }));
  };

  const updateCollectionEntry = (sectionId, entryId, key, value) => {
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id !== sectionId ? section : {
        ...section,
        entries: (section.entries ?? []).map((entry) =>
          entry.id === entryId ? { ...entry, [key]: value } : entry
        )
      })
    }));
  };

  const toggleCollectionMetadata = (sectionId, entryId, key, visible) => {
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id !== sectionId ? section : {
        ...section,
        entries: (section.entries ?? []).map((entry) => entry.id !== entryId ? entry : {
          ...entry,
          metadataVisibility: { ...entry.metadataVisibility, [key]: visible }
        })
      })
    }));
  };

  const moveCollectionEntry = (sectionId, entryId, offset) => {
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const entries = [...(section.entries ?? [])];
        const from = entries.findIndex((entry) => entry.id === entryId);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= entries.length) return section;
        [entries[from], entries[to]] = [entries[to], entries[from]];
        return { ...section, entries };
      })
    }));
  };

  const removeCollectionEntry = (sectionId, entryId) => {
    if (!window.confirm("Remove this entry from the current profile draft?")) return;
    setProfile((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId
        ? {
            ...section,
            entries: (section.entries ?? []).filter((entry) => entry.id !== entryId),
            ...(section.kind === "games" && section.featuredGameId === entryId ? { featuredGameId: "" } : {})
          }
        : section)
    }));
  };

  const resetToDefaults = () => {
    if (!window.confirm("Reset the editor and this browser's local draft to the original default profile? This does not change your saved Supabase draft or published profile. You can save and publish the defaults separately.")) return;
    const resetProfile = structuredClone(defaultProfile);
    setProfile(resetProfile);
    setSelectedId(resetProfile.sections[0]?.id ?? null);
    setPreviewMode(resetProfile.theme.mode);
    setAssetStatus("");
    setCloudStatus("Editor reset to the original defaults locally. Save the draft and publish separately if you want these defaults online.");
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
      const uploadedScreenshotId = target.type === "gameScreenshot" ? createSectionId() : "";
      setProfile((current) => {
        if (target.type === "hero") {
          return { ...current, media: { ...current.media, hero: imageUrl } };
        }
        return {
          ...current,
          sections: current.sections.map((section) => {
            if (target.type === "entry") {
              return section.id !== target.sectionId ? section : {
                ...section,
                entries: (section.entries ?? []).map((entry) =>
                  entry.id === target.id ? { ...entry, image: imageUrl } : entry
                )
              };
            }
            if (target.type === "gameScreenshot") {
              return section.id !== target.sectionId ? section : {
                ...section,
                entries: (section.entries ?? []).map((entry) => entry.id !== target.id ? entry : {
                  ...entry,
                  screenshots: [
                    ...(entry.screenshots ?? []),
                    { id: uploadedScreenshotId, url: imageUrl, source: "upload" }
                  ],
                  featuredScreenshotId: entry.featuredScreenshotId || uploadedScreenshotId
                })
              };
            }
            if (target.type === "sectionBackground") {
              return section.id !== target.id ? section : {
                ...section,
                layout: { ...(section.layout ?? {}), backgroundImage: imageUrl }
              };
            }
            return section.id === target.id ? { ...section, image: imageUrl } : section;
          })
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
      : target.type === "entry"
        ? {
            ...profile,
            sections: profile.sections.map((section) => section.id !== target.sectionId ? section : {
              ...section,
              entries: (section.entries ?? []).map((entry) =>
                entry.id === target.id ? { ...entry, image: "" } : entry
              )
            })
          }
      : target.type === "gameScreenshot"
        ? {
            ...profile,
            sections: profile.sections.map((section) => section.id !== target.sectionId ? section : {
              ...section,
              entries: (section.entries ?? []).map((entry) => {
                if (entry.id !== target.id) return entry;
                const screenshots = (entry.screenshots ?? []).filter((item) => item.url !== imageUrl);
                return {
                  ...entry,
                  screenshots,
                  featuredScreenshotId: screenshots.some((item) => item.id === entry.featuredScreenshotId)
                    ? entry.featuredScreenshotId
                    : screenshots[0]?.id ?? ""
                };
              })
            })
          }
      : target.type === "sectionBackground"
        ? {
            ...profile,
            sections: profile.sections.map((section) => section.id === target.id
              ? { ...section, layout: { ...(section.layout ?? {}), backgroundImage: "" } }
              : section)
          }
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
            <span>PROFILE STUDIO <b>/</b> AJAX&apos;S BIO</span>
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
          <span>PROFILE STUDIO <b>/</b> AJAX&apos;S BIO</span>
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
          <button className="button button-outline" type="button" disabled={cloudBusy} onClick={resetToDefaults}>RESET TO DEFAULTS</button>
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
                  <span className={`visibility-mark ${section.visible !== false ? "is-visible" : ""}`} aria-label={section.visible === false ? "Hidden" : "Visible"}>{section.visible === false ? "○" : "●"}</span>
                </button>
                <div className="section-row-actions" aria-label={`Actions for ${section.title}`}>
                  <button type="button" aria-label={`Move ${section.title} up`} disabled={index === 0} onClick={() => moveSection(section.id, -1)}>↑</button>
                  <button type="button" aria-label={`Move ${section.title} down`} disabled={index === profile.sections.length - 1} onClick={() => moveSection(section.id, 1)}>↓</button>
                  <button type="button" aria-label={`${section.visible !== false ? "Hide" : "Show"} ${section.title}`} onClick={() => toggleSection(section.id)}>{section.visible !== false ? "HIDE" : "SHOW"}</button>
                </div>
              </li>
            ))}
          </ol>
          <button className="button button-outline add-section" type="button" onClick={addSection}><span aria-hidden="true">＋</span> ADD A NOTE</button>
          <button className="button button-outline add-section add-music-section" type="button" onClick={addMusicSection}><span aria-hidden="true">♫</span> ADD SPOTIFY TRACK</button>
          <button className="button button-outline add-section" type="button" onClick={() => addCollectionSection("games")}>＋ FAVORITE GAMES</button>
          <button className="button button-outline add-section" type="button" onClick={() => addCollectionSection("shows")}>＋ FAVORITE SHOWS &amp; ANIME</button>
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
            <label className="preset-control">
              <span>ARRANGEMENT</span>
              <select value={profile.layout?.mode ?? "grid"} onChange={(event) => updateProfileLayout("mode", event.target.value)}>
                <option value="grid">GRID</option>
                <option value="rows">ROWS</option>
                <option value="strip">WRAPPED STRIP</option>
                <option value="scrapbook">SCRAPBOOK GRID</option>
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
              <legend>PAGE ARRANGEMENT / MOTION</legend>
              <label className="field-label" htmlFor="layout-columns">GRID COLUMNS</label>
              <select id="layout-columns" value={profile.layout?.columns ?? 2} onChange={(event) => updateProfileLayout("columns", Number(event.target.value))}>
                <option value="1">ONE</option><option value="2">TWO</option><option value="3">THREE</option><option value="4">FOUR</option>
              </select>
              <label className="field-label" htmlFor="layout-mode">ARRANGEMENT</label>
              <select id="layout-mode" value={profile.layout?.mode ?? "grid"} onChange={(event) => updateProfileLayout("mode", event.target.value)}>
                <option value="grid">EDITORIAL GRID</option><option value="rows">HORIZONTAL ROWS</option><option value="strip">WRAPPED STRIP</option><option value="scrapbook">SCRAPBOOK COLLAGE</option>
              </select>
              <label className="field-label" htmlFor="layout-gap">PANEL GAP / PX</label>
              <input id="layout-gap" type="number" min="0" max="48" value={profile.layout?.gap ?? 9} onChange={(event) => updateProfileLayout("gap", Number(event.target.value))} />
              {[
                ["entrance", "SUBTLE PANEL ENTRANCE"],
                ["hover", "PANEL HOVER LIFT"],
                ["backgroundMotion", "SLOW PAPER GRAIN"]
              ].map(([key, label]) => (
                <label className="toggle-control" key={key}>
                  <input type="checkbox" checked={profile.effects?.[key] ?? (key !== "backgroundMotion")} onChange={(event) => setProfile((current) => ({ ...current, effects: { ...current.effects, [key]: event.target.checked } }))} />
                  <span>{label}</span>
                </label>
              ))}
              <label className="field-label" htmlFor="effect-intensity">MOTION INTENSITY</label>
              <select id="effect-intensity" value={profile.effects?.intensity ?? "subtle"} onChange={(event) => setProfile((current) => ({ ...current, effects: { ...current.effects, intensity: event.target.value } }))}>
                <option value="subtle">SUBTLE</option><option value="expressive">EXPRESSIVE</option>
              </select>
            </fieldset>

            <fieldset className="property-group">
              <legend>PROFILE / IDENTITY</legend>
              <CustomTextControl label="DISPLAY NAME" id="display-name" value={profile.profile.displayName} onChange={(value) => updateProfile("displayName", value)} visible={profile.profileVisibility?.displayName !== false} onVisibilityChange={(value) => setProfileFieldVisibility("displayName", value)} onReset={() => resetProfileField("displayName")} maxLength={48} />
              <CustomTextControl label="HERO HEADLINE / TEXT UNDER YOUR NAME" id="hero-tagline" value={profile.profile.heroTagline ?? defaultProfile.profile.heroTagline} onChange={(value) => updateProfile("heroTagline", value)} visible={profile.profileVisibility?.heroTagline !== false} onVisibilityChange={(value) => setProfileFieldVisibility("heroTagline", value)} onReset={() => resetProfileField("heroTagline")} maxLength={48} />
              <CustomTextControl label="USERNAME" id="username" value={profile.profile.username} onChange={(value) => updateProfile("username", value.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 24))} visible={profile.profileVisibility?.username !== false} onVisibilityChange={(value) => setProfileFieldVisibility("username", value)} onReset={() => resetProfileField("username")} maxLength={24} />
              <CustomTextControl label="STATUS / NOW" id="status" value={profile.profile.status} onChange={(value) => updateProfile("status", value)} visible={profile.profileVisibility?.status !== false} onVisibilityChange={(value) => setProfileFieldVisibility("status", value)} onReset={() => resetProfileField("status")} maxLength={72} />
              <CustomTextControl label="INTRODUCTION" id="introduction" value={profile.profile.introduction} onChange={(value) => updateProfile("introduction", value)} visible={profile.profileVisibility?.introduction !== false} onVisibilityChange={(value) => setProfileFieldVisibility("introduction", value)} onReset={() => resetProfileField("introduction")} multiline maxLength={240} />
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
              <label className="field-label" htmlFor="hero-image-alt">HERO IMAGE DESCRIPTION / ALT TEXT</label>
              <input id="hero-image-alt" value={profile.media.heroAlt ?? defaultProfile.media.heroAlt} maxLength={180} onChange={(event) => setProfile((current) => ({ ...current, media: { ...current.media, heroAlt: event.target.value } }))} />
              <button className="text-link" type="button" onClick={() => setProfile((current) => ({ ...current, media: { ...current.media, heroAlt: defaultProfile.media.heroAlt } }))}>RESTORE DESCRIPTION</button>
              <p className="panel-hint">PNG, JPEG, WebP, GIF, or AVIF; maximum 8 MiB. Uploaded images are publicly accessible.</p>
            </fieldset>

            <fieldset className="property-group">
              <legend>PUBLIC TEXT / LABELS</legend>
              {[
                ["mark", "HEADER GLYPH"],
                ["brand", "HEADER BRAND"],
                ["publicBrand", "PUBLIC PAGE BRAND"],
                ["editorLink", "PUBLIC EDITOR LINK"],
                ["darkModeLabel", "DARK MODE BUTTON"],
                ["lightModeLabel", "LIGHT MODE BUTTON"],
                ["pageMark", "PAGE MARK"],
                ["heroKicker", "SMALL HERO LABEL"],
                ["heroImageCaption", "HERO IMAGE CAPTION"],
                ["heroImageMark", "HERO IMAGE NUMBER"],
                ["sectionsHeading", "SECTIONS HEADING"],
                ["sectionCountSuffix", "SECTION COUNT LABEL"],
                ["sectionDivider", "PANEL NUMBER DIVIDER"],
                ["ratingLabel", "GAME / SHOW RATING LABEL"],
                ["externalLinkLabel", "EXTERNAL LINK LABEL"],
                ["footerLeft", "FOOTER LEFT"],
                ["footerRight", "FOOTER RIGHT"],
                ["spotifyDisclaimer", "SPOTIFY NOTE"]
              ].map(([key, label]) => (
                <div className="copy-control" key={key}>
                  <label className="field-label" htmlFor={`copy-${key}`}>{label}</label>
                  <input
                    id={`copy-${key}`}
                    value={profile.copy?.[key] ?? defaultProfile.copy[key] ?? ""}
                    onChange={(event) => updateProfileCopy(key, event.target.value)}
                  />
                  <div className="copy-control-actions">
                    <label className="toggle-control">
                      <input
                        type="checkbox"
                        checked={profile.copyVisibility?.[key] !== false}
                        onChange={(event) => setProfile((current) => ({ ...current, copyVisibility: { ...current.copyVisibility, [key]: event.target.checked } }))}
                      />
                      <span>SHOW</span>
                    </label>
                    <button className="text-link" type="button" onClick={() => resetProfileCopy(key)}>RESTORE DEFAULT</button>
                  </div>
                </div>
              ))}
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
                  {selectedSection.kind === "music" && (
                    <>
                      <label className="field-label" htmlFor="spotify-url">PASTE SPOTIFY TRACK LINK HERE</label>
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
                          ? "That link does not look like a Spotify track. Paste a track link to load its preview."
                          : "Paste a Spotify track URL here. The preview will load its available title and artwork."}
                      </p>
                    </>
                  )}
                  {selectedSection.kind === "shows" && (
                    <>
                      <label className="field-label" htmlFor="anime-search">SEARCH ANILIST (PUBLIC ANIME METADATA)</label>
                      <div className="collection-search">
                        <input id="anime-search" value={animeSearch} onChange={(event) => setAnimeSearch(event.target.value)} placeholder="Type an anime title…" />
                        <button className="button button-outline" type="button" disabled={animeSearch.trim().length < 2} onClick={() => setAnimeSearchQuery(animeSearch.trim())}>SEARCH</button>
                      </div>
                      {animeSearchStatus && <p className="panel-hint" role="status">{animeSearchStatus}</p>}
                      {animeResults.length > 0 && (
                        <ul className="anime-results">
                          {animeResults.map((result) => (
                            <li key={result.id}>
                              <button type="button" onClick={() => selectAniListResult(result)}>
                                {result.image && <img src={result.image} alt="" />}
                                <span>{result.title}{result.year ? ` · ${result.year}` : ""}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="panel-hint">Search is optional; you can create a fully manual entry below. Selected metadata is saved in your profile JSON.</p>
                    </>
                  )}
                  {selectedSection.kind === "games" && (
                    <>
                      <div className="game-editor-tabs" role="tablist" aria-label="Game display editors">
                        <button
                          id="favorite-game-tab"
                          type="button"
                          role="tab"
                          aria-selected={gameEditorTab === "favorite"}
                          aria-controls="favorite-game-editor"
                          className={gameEditorTab === "favorite" ? "is-active" : ""}
                          onClick={() => setGameEditorTab("favorite")}
                        >
                          FAVORITE GAME
                        </button>
                        <button
                          id="other-games-tab"
                          type="button"
                          role="tab"
                          aria-selected={gameEditorTab === "other"}
                          aria-controls="other-games-editor"
                          className={gameEditorTab === "other" ? "is-active" : ""}
                          onClick={() => setGameEditorTab("other")}
                        >
                          OTHER GAMES
                        </button>
                      </div>
                      <div
                        id={gameEditorTab === "favorite" ? "favorite-game-editor" : "other-games-editor"}
                        role="tabpanel"
                        aria-labelledby={gameEditorTab === "favorite" ? "favorite-game-tab" : "other-games-tab"}
                      >
                      <p className="panel-hint">
                        {gameEditorTab === "favorite"
                          ? "One game is featured in the large public showcase. Replacing or clearing it keeps its entry in Other Games."
                          : "Other Games only displays each game's cover and name. The featured game stays in its own showcase."}
                      </p>
                      <label className="field-label" htmlFor="igdb-game-search">
                        {gameEditorTab === "favorite" ? "SEARCH FOR A FAVORITE GAME" : "ADD TO OTHER GAMES"}
                      </label>
                      <form className="collection-search" onSubmit={searchGames}>
                        <input
                          id="igdb-game-search"
                          value={gameSearch}
                          onChange={(event) => setGameSearch(event.target.value)}
                          placeholder="Search IGDB by game title…"
                          maxLength={100}
                        />
                        <button className="button button-outline" type="submit" disabled={gameSearchBusy || gameSearch.trim().length < 2}>
                          {gameSearchBusy ? "WAIT…" : "SEARCH"}
                        </button>
                      </form>
                      {gameSearchStatus && <p className="panel-hint" role="status">{gameSearchStatus}</p>}
                      {gameResults.length > 0 && (
                        <ul className="anime-results igdb-search-results">
                          {gameResults.map((result) => (
                            <li key={result.id}>
                            <button type="button" disabled={gameSearchBusy} onClick={() => selectIgdbGame(result)}>
                                {result.cover && <img src={result.cover} alt="" loading="lazy" />}
                                <span>
                                  {result.title}{result.releaseDate ? ` · ${result.releaseDate}` : result.year ? ` · ${result.year}` : ""}
                                  {result.genres?.length ? ` · ${result.genres.slice(0, 2).join(", ")}` : ""}
                                  {result.platforms?.length ? ` · ${result.platforms.slice(0, 2).join(", ")}` : ""}
                                  {result.developers?.length ? ` · ${result.developers.slice(0, 1).join(", ")}` : ""}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="panel-hint">
                        IGDB search requires the owner-only Supabase Edge Function and server-side Twitch app credentials. Until configured, use manual entry below.
                      </p>
                      {selectedSection.kind === "games" && (
                        <>
                          <label className="field-label" htmlFor="featured-game">FEATURED GAME</label>
                          <div className="featured-game-control">
                          <select id="featured-game" value={featuredGameId} onChange={(event) => setFeaturedGame(selectedSection.id, event.target.value)}>
                            <option value="">NO FEATURED GAME</option>
                            {(selectedSection.entries ?? []).filter((entry) => entry.visible !== false).map((entry) => (
                              <option key={entry.id} value={entry.id}>{entry.title || "Untitled game"}</option>
                            ))}
                          </select>
                          {featuredGameId && <button className="text-link text-link-danger" type="button" onClick={() => setFeaturedGame(selectedSection.id, "")}>CLEAR FEATURED SLOT</button>}
                          </div>
                        </>
                      )}
                      <div className="collection-editor-heading">
                        <span>{gameEditorTab === "favorite" ? "FEATURED GAME ENTRY" : `OTHER GAMES / ${gameEditorEntries.length}`}</span>
                        {gameEditorTab === "favorite"
                          ? !featuredGameId && <button type="button" className="button button-outline" onClick={() => addCollectionEntry(selectedSection.id)}>＋ ADD MANUAL FAVORITE</button>
                          : <button type="button" className="button button-outline" onClick={() => addCollectionEntry(selectedSection.id)}>＋ ADD MANUAL GAME</button>}
                      </div>
                      {gameEditorTab === "favorite" && !featuredGameId && <p className="game-editor-empty">Choose a result above or add a manual favorite to build the featured showcase.</p>}
                      {editableCollectionEntries.map((entry, entryIndex) => {
                        const metadataFields = selectedSection.kind === "games"
                          ? [["description", "GAME SUMMARY"], ["platform", "PLATFORMS"], ["releaseDate", "RELEASE DATE"], ["year", "RELEASE YEAR"], ["developer", "DEVELOPERS"], ["publisher", "PUBLISHERS"], ["genre", "GENRES"], ...(entry.dataSource === "rawg" ? [["rawgRating", "LEGACY RAWG RATING"], ["metacritic", "LEGACY METACRITIC SCORE"]] : []), ["rating", "PERSONAL RATING"], ["status", "PLAY STATUS"], ["externalUrl", "OFFICIAL WEBSITE"]]
                          : [["mediaType", "MEDIA TYPE"], ["year", "RELEASE YEAR / RANGE"], ["genre", "GENRE"], ["status", "WATCH STATUS"], ["rating", "PERSONAL RATING"], ["externalUrl", "OFFICIAL / EXTERNAL URL"]];
                        const actualEntryIndex = (selectedSection.entries ?? []).findIndex((item) => item.id === entry.id);
                        return (
                          <fieldset className="collection-editor-entry" key={entry.id}>
                            <legend>{String(entryIndex + 1).padStart(2, "0")} / {entry.title || (selectedSection.kind === "games" ? "GAME" : "SHOW")}</legend>
                            <div className="collection-entry-actions">
                              {selectedSection.kind === "games" && gameEditorTab === "other" ? (
                                <>
                                  <button type="button" disabled={entryIndex === 0} aria-label="Move game earlier in Other Games" onClick={() => moveOtherGame(selectedSection.id, entry.id, -1)}>↑</button>
                                  <button type="button" disabled={entryIndex === gameEditorEntries.length - 1} aria-label="Move game later in Other Games" onClick={() => moveOtherGame(selectedSection.id, entry.id, 1)}>↓</button>
                                </>
                              ) : selectedSection.kind === "shows" ? (
                                <>
                                  <button type="button" disabled={actualEntryIndex === 0} aria-label="Move entry up" onClick={() => moveCollectionEntry(selectedSection.id, entry.id, -1)}>↑</button>
                                  <button type="button" disabled={actualEntryIndex === (selectedSection.entries?.length ?? 0) - 1} aria-label="Move entry down" onClick={() => moveCollectionEntry(selectedSection.id, entry.id, 1)}>↓</button>
                                </>
                              ) : null}
                              <button type="button" className="text-link text-link-danger" onClick={() => removeCollectionEntry(selectedSection.id, entry.id)}>REMOVE ENTRY</button>
                            </div>
                            <label className="toggle-control">
                              <input type="checkbox" checked={entry.visible !== false} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, "visible", event.target.checked)} />
                              <span>SHOW THIS ENTRY</span>
                            </label>
                            {selectedSection.kind === "games" && gameEditorTab === "favorite" && (
                              <>
                                <label className="toggle-control">
                                  <input type="checkbox" checked={entry.favorite === true} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, "favorite", event.target.checked)} />
                                  <span>MARK AS A FAVORITE</span>
                                </label>
                                {(entry.dataSource === "igdb" || entry.dataSource === "rawg") && (
                                  <div className="game-credit-editor">
                                    {entry.dataSource === "igdb" ? "IGDB SOURCE" : "LEGACY RAWG SOURCE"} / <a href={entry.igdbUrl || entry.rawgUrl || "https://www.igdb.com/"} target="_blank" rel="noreferrer">VIEW GAME ↗</a>
                                  </div>
                                )}
                              </>
                            )}
                            <label className="field-label" htmlFor={`collection-title-${entry.id}`}>TITLE</label>
                            <input id={`collection-title-${entry.id}`} value={entry.title ?? ""} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, "title", event.target.value)} />
                            {selectedSection.kind === "games" && gameEditorTab === "other" && (
                              <>
                                <label className="field-label" htmlFor={`collection-cover-url-${entry.id}`}>COVER / LOGO URL</label>
                                <input id={`collection-cover-url-${entry.id}`} type="url" value={entry.image ?? ""} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, "image", event.target.value)} placeholder="https://…" />
                              </>
                            )}
                            {selectedSection.kind === "games" && entry.sourceTitle && entry.title !== entry.sourceTitle && (
                              <button type="button" className="text-link" onClick={() => updateCollectionEntry(selectedSection.id, entry.id, "title", entry.sourceTitle)}>RESTORE DATABASE TITLE</button>
                            )}
                            <label className="toggle-control">
                              <input type="checkbox" checked={entry.metadataVisibility?.title !== false} onChange={(event) => toggleCollectionMetadata(selectedSection.id, entry.id, "title", event.target.checked)} />
                              <span>SHOW TITLE</span>
                            </label>
                            <label className="field-label" htmlFor={`collection-cover-${entry.id}`}>COVER / POSTER</label>
                            <input id={`collection-cover-${entry.id}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={cloudBusy} onChange={(event) => uploadImage(event, { type: "entry", sectionId: selectedSection.id, id: entry.id })} />
                            <label className="toggle-control">
                              <input type="checkbox" checked={entry.metadataVisibility?.cover !== false} onChange={(event) => toggleCollectionMetadata(selectedSection.id, entry.id, "cover", event.target.checked)} />
                              <span>SHOW COVER / POSTER</span>
                            </label>
                            {entry.image && <button type="button" className="text-link text-link-danger" onClick={() => removeImage({ type: "entry", sectionId: selectedSection.id, id: entry.id }, entry.image)}>REMOVE COVER</button>}
                            {!(selectedSection.kind === "games" && gameEditorTab === "other") && (
                              <>
                            {selectedSection.kind === "games" && (
                              <label className="toggle-control">
                                <input type="checkbox" checked={entry.metadataVisibility?.cover !== false} onChange={(event) => toggleCollectionMetadata(selectedSection.id, entry.id, "cover", event.target.checked)} />
                                <span>SHOW COVER ART</span>
                              </label>
                            )}
                            <label className="field-label" htmlFor={`collection-note-${entry.id}`}>PERSONAL NOTE</label>
                            <textarea id={`collection-note-${entry.id}`} rows={2} value={entry.note ?? ""} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, "note", event.target.value)} />
                            <label className="toggle-control">
                              <input type="checkbox" checked={entry.metadataVisibility?.note !== false} onChange={(event) => toggleCollectionMetadata(selectedSection.id, entry.id, "note", event.target.checked)} />
                              <span>SHOW PERSONAL NOTE</span>
                            </label>
                            {metadataFields.map(([key, label]) => (
                              <div className="collection-meta-control" key={key}>
                                <label className="field-label" htmlFor={`collection-${key}-${entry.id}`}>{label}</label>
                                {key === "description" || key === "note" ? (
                                  <textarea id={`collection-${key}-${entry.id}`} rows={key === "description" ? 4 : 2} value={entry[key] ?? ""} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, key, event.target.value)} />
                                ) : key === "status" ? (
                                  <select id={`collection-${key}-${entry.id}`} value={entry[key] ?? ""} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, key, event.target.value)}>
                                    <option value="">NOT SET</option>
                                    {(selectedSection.kind === "games"
                                      ? ["Playing", "Completed", "On Hold", "Want to Play"]
                                      : ["Watching", "Completed", "On Hold", "Plan to Watch"]).map((status) => <option key={status} value={status}>{status}</option>)}
                                  </select>
                                ) : key === "mediaType" ? (
                                  <select id={`collection-${key}-${entry.id}`} value={entry[key] ?? ""} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, key, event.target.value)}>
                                    <option value="">NOT SET</option>{["Anime", "TV Series", "Animated Show", "Movie"].map((type) => <option key={type} value={type}>{type}</option>)}
                                  </select>
                                ) : (
                                  <input id={`collection-${key}-${entry.id}`} value={entry[key] ?? ""} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, key, event.target.value)} />
                                )}
                                <label className="toggle-control">
                                  <input type="checkbox" checked={entry.metadataVisibility?.[key] !== false} onChange={(event) => toggleCollectionMetadata(selectedSection.id, entry.id, key, event.target.checked)} />
                                  <span>SHOW THIS DETAIL</span>
                                </label>
                              </div>
                            ))}
                            {selectedSection.kind === "games" && (
                              <GameScreenshotsEditor
                                entry={entry}
                                sectionId={selectedSection.id}
                                availableScreenshots={availableGameScreenshots[entry.id] ?? []}
                                screenshotStatus={gameScreenshotStatus[entry.id] ?? ""}
                                activeScreenshot={activeGameScreenshot?.entryId === entry.id ? activeGameScreenshot.url : ""}
                                busy={cloudBusy || gameSearchBusy}
                                onLoadScreenshots={() => loadGameScreenshots(entry)}
                                onToggleScreenshot={(screenshot) => toggleSourceScreenshot(selectedSection.id, entry.id, screenshot)}
                                onMoveScreenshot={(screenshotId, offset) => moveGameScreenshot(selectedSection.id, entry.id, screenshotId, offset)}
                                onRemoveScreenshot={(screenshot) => removeGameScreenshot(selectedSection.id, entry.id, screenshot)}
                                onUploadScreenshot={(event) => uploadImage(event, { type: "gameScreenshot", sectionId: selectedSection.id, id: entry.id })}
                                onFeatureScreenshot={(screenshotId) => {
                                  updateCollectionEntry(selectedSection.id, entry.id, "featuredScreenshotId", screenshotId);
                                  const screenshot = entry.screenshots?.find((item) => item.id === screenshotId);
                                  if (screenshot) setActiveGameScreenshot({ entryId: entry.id, url: screenshot.url });
                                }}
                                onPreviewScreenshot={(url) => setActiveGameScreenshot({ entryId: entry.id, url })}
                                onScreenshotVisibilityChange={(visible) => toggleCollectionMetadata(selectedSection.id, entry.id, "screenshots", visible)}
                              />
                            )}
                              </>
                            )}
                          </fieldset>
                        );
                      })}
                      </div>
                    </>
                  )}
                  {(selectedSection.kind === "shows") && (
                    <>
                      <div className="collection-editor-heading">
                        <span>COLLECTION ENTRIES / {selectedSection.entries?.length ?? 0}</span>
                        <button type="button" className="button button-outline" onClick={() => addCollectionEntry(selectedSection.id)}>＋ ADD MANUAL ENTRY</button>
                      </div>
                      {(selectedSection.entries ?? []).map((entry, entryIndex) => {
                        const metadataFields = [["mediaType", "MEDIA TYPE"], ["year", "RELEASE YEAR / RANGE"], ["genre", "GENRE"], ["status", "WATCH STATUS"], ["rating", "PERSONAL RATING"], ["externalUrl", "OFFICIAL / EXTERNAL URL"]];
                        return (
                          <fieldset className="collection-editor-entry" key={entry.id}>
                            <legend>{String(entryIndex + 1).padStart(2, "0")} / {entry.title || "SHOW"}</legend>
                            <div className="collection-entry-actions">
                              <button type="button" disabled={entryIndex === 0} aria-label="Move entry up" onClick={() => moveCollectionEntry(selectedSection.id, entry.id, -1)}>↑</button>
                              <button type="button" disabled={entryIndex === (selectedSection.entries?.length ?? 0) - 1} aria-label="Move entry down" onClick={() => moveCollectionEntry(selectedSection.id, entry.id, 1)}>↓</button>
                              <button type="button" className="text-link text-link-danger" onClick={() => removeCollectionEntry(selectedSection.id, entry.id)}>REMOVE ENTRY</button>
                            </div>
                            <label className="toggle-control">
                              <input type="checkbox" checked={entry.visible !== false} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, "visible", event.target.checked)} />
                              <span>SHOW THIS ENTRY</span>
                            </label>
                            <label className="field-label" htmlFor={`collection-title-${entry.id}`}>TITLE</label>
                            <input id={`collection-title-${entry.id}`} value={entry.title ?? ""} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, "title", event.target.value)} />
                            <label className="toggle-control">
                              <input type="checkbox" checked={entry.metadataVisibility?.title !== false} onChange={(event) => toggleCollectionMetadata(selectedSection.id, entry.id, "title", event.target.checked)} />
                              <span>SHOW TITLE</span>
                            </label>
                            <label className="field-label" htmlFor={`collection-cover-${entry.id}`}>COVER / POSTER</label>
                            <input id={`collection-cover-${entry.id}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={cloudBusy} onChange={(event) => uploadImage(event, { type: "entry", sectionId: selectedSection.id, id: entry.id })} />
                            <label className="toggle-control">
                              <input type="checkbox" checked={entry.metadataVisibility?.cover !== false} onChange={(event) => toggleCollectionMetadata(selectedSection.id, entry.id, "cover", event.target.checked)} />
                              <span>SHOW COVER / POSTER</span>
                            </label>
                            {entry.image && <button type="button" className="text-link text-link-danger" onClick={() => removeImage({ type: "entry", sectionId: selectedSection.id, id: entry.id }, entry.image)}>REMOVE COVER</button>}
                            <label className="field-label" htmlFor={`collection-note-${entry.id}`}>PERSONAL NOTE</label>
                            <textarea id={`collection-note-${entry.id}`} rows={2} value={entry.note ?? ""} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, "note", event.target.value)} />
                            <label className="toggle-control">
                              <input type="checkbox" checked={entry.metadataVisibility?.note !== false} onChange={(event) => toggleCollectionMetadata(selectedSection.id, entry.id, "note", event.target.checked)} />
                              <span>SHOW PERSONAL NOTE</span>
                            </label>
                            {metadataFields.map(([key, label]) => (
                              <div className="collection-meta-control" key={key}>
                                <label className="field-label" htmlFor={`collection-${key}-${entry.id}`}>{label}</label>
                                {key === "status" || key === "mediaType" ? (
                                  <select id={`collection-${key}-${entry.id}`} value={entry[key] ?? ""} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, key, event.target.value)}>
                                    <option value="">NOT SET</option>
                                    {(key === "status" ? ["Watching", "Completed", "On Hold", "Plan to Watch"] : ["Anime", "TV Series", "Animated Show", "Movie"]).map((option) => <option key={option} value={option}>{option}</option>)}
                                  </select>
                                ) : (
                                  <input id={`collection-${key}-${entry.id}`} value={entry[key] ?? ""} onChange={(event) => updateCollectionEntry(selectedSection.id, entry.id, key, event.target.value)} />
                                )}
                                <label className="toggle-control">
                                  <input type="checkbox" checked={entry.metadataVisibility?.[key] !== false} onChange={(event) => toggleCollectionMetadata(selectedSection.id, entry.id, key, event.target.checked)} />
                                  <span>SHOW THIS DETAIL</span>
                                </label>
                              </div>
                            ))}
                          </fieldset>
                        );
                      })}
                    </>
                  )}
                  <CustomTextControl label="HEADING" id="section-title" value={selectedSection.title} onChange={(value) => updateSelectedSection("title", value)} visible={selectedSection.copyVisibility?.title !== false} onVisibilityChange={(value) => setSelectedTextVisibility("title", value)} onReset={() => resetSelectedText("title")} maxLength={80} />
                  <CustomTextControl label="PANEL TEXT" id="section-copy" value={selectedSection.body} onChange={(value) => updateSelectedSection("body", value)} visible={selectedSection.copyVisibility?.body !== false} onVisibilityChange={(value) => setSelectedTextVisibility("body", value)} onReset={() => resetSelectedText("body")} multiline maxLength={420} />
                  <CustomTextControl label={selectedSection.kind === "music" ? "MUSIC LABEL / SMALL HEADING" : "IMAGE / SECTION CAPTION"} id="section-caption" value={selectedSection.caption} onChange={(value) => updateSelectedSection("caption", value)} visible={selectedSection.copyVisibility?.caption !== false} onVisibilityChange={(value) => setSelectedTextVisibility("caption", value)} onReset={() => resetSelectedText("caption")} maxLength={80} />
                  {selectedSection.kind !== "music" && selectedSection.kind !== "games" && selectedSection.kind !== "shows" && (
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
                      <label className="field-label" htmlFor="spotify-height">PLAYER HEIGHT / PX</label>
                      <input id="spotify-height" type="number" min="80" max="352" value={selectedSection.layout?.embedHeight ?? 152} onChange={(event) => updateSectionLayout("embedHeight", Number(event.target.value))} />
                    </>
                  )}
                </>
              ) : <p className="panel-hint">Add a panel to begin editing.</p>}
            </fieldset>
            {selectedSection && (
              <fieldset className="property-group">
                <legend>SECTION LAYOUT / PANEL</legend>
                <label className="field-label" htmlFor="section-width">WIDTH PRESET</label>
                <select id="section-width" value={selectedSection.layout?.width ?? "half"} onChange={(event) => updateSectionLayout("width", event.target.value)}>
                  <option value="full">FULL WIDTH</option><option value="half">HALF WIDTH</option><option value="third">ONE THIRD</option><option value="compact">COMPACT</option><option value="custom">CUSTOM</option>
                </select>
                {selectedSection.layout?.width === "custom" && (
                  <>
                    <label className="field-label" htmlFor="section-custom-width">CUSTOM WIDTH / %</label>
                    <input id="section-custom-width" type="number" min="20" max="100" value={selectedSection.layout?.customWidth ?? 50} onChange={(event) => updateSectionLayout("customWidth", Number(event.target.value))} />
                  </>
                )}
                <label className="field-label" htmlFor="section-height">HEIGHT</label>
                <select id="section-height" value={selectedSection.layout?.height ?? "auto"} onChange={(event) => updateSectionLayout("height", event.target.value)}>
                  <option value="auto">AUTO</option><option value="short">SHORT</option><option value="tall">TALL</option><option value="custom">CUSTOM</option>
                </select>
                {selectedSection.layout?.height === "custom" && (
                  <>
                    <label className="field-label" htmlFor="section-custom-height">CUSTOM HEIGHT / PX</label>
                    <input id="section-custom-height" type="number" min="90" max="900" value={selectedSection.layout?.customHeight ?? 240} onChange={(event) => updateSectionLayout("customHeight", Number(event.target.value))} />
                  </>
                )}
                <label className="field-label" htmlFor="section-align">ALIGNMENT</label>
                <select id="section-align" value={selectedSection.layout?.align ?? "stretch"} onChange={(event) => updateSectionLayout("align", event.target.value)}>
                  <option value="stretch">STRETCH</option><option value="start">TOP</option><option value="center">CENTER</option><option value="end">BOTTOM</option>
                </select>
                <label className="field-label" htmlFor="section-horizontal-align">HORIZONTAL ALIGNMENT</label>
                <select id="section-horizontal-align" value={selectedSection.layout?.horizontalAlign ?? "stretch"} onChange={(event) => updateSectionLayout("horizontalAlign", event.target.value)}>
                  <option value="stretch">STRETCH</option><option value="start">LEFT</option><option value="center">CENTER</option><option value="end">RIGHT</option>
                </select>
                <label className="field-label" htmlFor="section-padding">PADDING / PX</label>
                <input id="section-padding" type="number" min="0" max="48" value={selectedSection.layout?.padding ?? 10} onChange={(event) => updateSectionLayout("padding", Number(event.target.value))} />
                <label className="field-label" htmlFor="section-background">PANEL BACKGROUND</label>
                <input id="section-background" type="color" value={selectedSection.layout?.background ?? "#fffefa"} onChange={(event) => updateSectionLayout("background", event.target.value)} />
                <label className="field-label" htmlFor="section-background-opacity">BACKGROUND MIX / %</label>
                <input id="section-background-opacity" type="range" min="0" max="100" value={selectedSection.layout?.backgroundOpacity ?? 100} onChange={(event) => updateSectionLayout("backgroundOpacity", Number(event.target.value))} />
                <label className="field-label" htmlFor="section-texture">PAPER TEXTURE</label>
                <select id="section-texture" value={selectedSection.layout?.texture ?? "none"} onChange={(event) => updateSectionLayout("texture", event.target.value)}>
                  <option value="none">NONE</option><option value="halftone">HALFTONE</option><option value="speed-lines">SPEED LINES</option>
                </select>
                <label className="field-label" htmlFor="section-background-image">BACKGROUND IMAGE URL (HTTPS)</label>
                <input id="section-background-image" type="url" value={selectedSection.layout?.backgroundImage ?? ""} onChange={(event) => updateSectionLayout("backgroundImage", event.target.value)} placeholder="https://…" />
                <label className="field-label" htmlFor="section-background-upload">OR UPLOAD A BACKGROUND IMAGE</label>
                <div className="asset-controls">
                  <input id="section-background-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={cloudBusy} onChange={(event) => uploadImage(event, { type: "sectionBackground", id: selectedSection.id })} />
                  <button className="text-link text-link-danger" type="button" disabled={!selectedSection.layout?.backgroundImage || cloudBusy} onClick={() => removeImage({ type: "sectionBackground", id: selectedSection.id }, selectedSection.layout.backgroundImage)}>REMOVE BACKGROUND</button>
                </div>
                <label className="field-label" htmlFor="section-border">BORDER STYLE</label>
                <select id="section-border" value={selectedSection.layout?.borderStyle ?? "solid"} onChange={(event) => updateSectionLayout("borderStyle", event.target.value)}>
                  <option value="solid">SOLID INK</option><option value="dashed">HAND-DRAWN / DASHED</option><option value="dotted">DOTTED</option><option value="double">DOUBLE</option>
                </select>
                <label className="field-label" htmlFor="section-border-width">BORDER WIDTH / PX</label>
                <input id="section-border-width" type="number" min="0" max="8" value={selectedSection.layout?.borderWidth ?? 2} onChange={(event) => updateSectionLayout("borderWidth", Number(event.target.value))} />
                <label className="field-label" htmlFor="section-radius">CORNER RADIUS / PX</label>
                <input id="section-radius" type="number" min="0" max="32" value={selectedSection.layout?.radius ?? 0} onChange={(event) => updateSectionLayout("radius", Number(event.target.value))} />
                <label className="toggle-control">
                  <input type="checkbox" checked={selectedSection.layout?.shadow === true} onChange={(event) => updateSectionLayout("shadow", event.target.checked)} />
                  <span>INK DROP SHADOW</span>
                </label>
                {selectedSection.image && (
                  <>
                    <label className="field-label" htmlFor="section-image-height">IMAGE HEIGHT / PX</label>
                    <input id="section-image-height" type="number" min="70" max="700" value={selectedSection.layout?.imageHeight ?? 150} onChange={(event) => updateSectionLayout("imageHeight", Number(event.target.value))} />
                    <label className="field-label" htmlFor="section-image-fit">IMAGE CROP</label>
                    <select id="section-image-fit" value={selectedSection.layout?.imageFit ?? "cover"} onChange={(event) => updateSectionLayout("imageFit", event.target.value)}>
                      <option value="cover">FILL PANEL</option><option value="contain">SHOW WHOLE IMAGE</option>
                    </select>
                    <label className="field-label" htmlFor="section-image-position">IMAGE POSITION</label>
                    <select id="section-image-position" value={selectedSection.layout?.imagePosition ?? "center"} onChange={(event) => updateSectionLayout("imagePosition", event.target.value)}>
                      <option value="center">CENTER</option><option value="top">TOP</option><option value="bottom">BOTTOM</option><option value="left">LEFT</option><option value="right">RIGHT</option>
                    </select>
                    <label className="field-label" htmlFor="section-image-rotation">IMAGE ROTATION</label>
                    <input id="section-image-rotation" type="number" min="-20" max="20" value={selectedSection.layout?.imageRotation ?? 0} onChange={(event) => updateSectionLayout("imageRotation", Number(event.target.value))} />
                  </>
                )}
                <button className="text-link" type="button" onClick={() => updateSelectedSection("layout", { width: ["music", "games", "shows"].includes(selectedSection.kind) ? "full" : "half", height: "auto", align: "stretch", horizontalAlign: "stretch", padding: 10, background: "", backgroundOpacity: 100, backgroundImage: "", texture: "none", borderStyle: "solid", borderWidth: 2, radius: 0, shadow: false, imageHeight: 150, imageFit: "cover", imagePosition: "center", imageRotation: 0, embedHeight: 152 })}>RESET PANEL LAYOUT</button>
              </fieldset>
            )}
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

function CustomTextControl({
  label,
  id,
  value,
  onChange,
  visible,
  onVisibilityChange,
  onReset,
  multiline = false,
  maxLength
}) {
  const Control = multiline ? "textarea" : "input";
  return (
    <div className="custom-text-control">
      <label className="field-label" htmlFor={id}>{label}</label>
      <Control
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        rows={multiline ? 3 : undefined}
      />
      <div className="copy-control-actions">
        <label className="toggle-control">
          <input type="checkbox" checked={visible} onChange={(event) => onVisibilityChange(event.target.checked)} />
          <span>SHOW</span>
        </label>
        <button className="text-link" type="button" onClick={onReset}>RESTORE DEFAULT</button>
      </div>
    </div>
  );
}

function GameScreenshotsEditor({
  entry,
  availableScreenshots,
  screenshotStatus,
  activeScreenshot,
  busy,
  onLoadScreenshots,
  onToggleScreenshot,
  onMoveScreenshot,
  onRemoveScreenshot,
  onUploadScreenshot,
  onFeatureScreenshot,
  onPreviewScreenshot,
  onScreenshotVisibilityChange
}) {
  const selectedScreenshots = entry.screenshots ?? [];
  const featuredScreenshot = selectedScreenshots.find((item) => item.id === entry.featuredScreenshotId)
    ?? selectedScreenshots[0];
  const previewUrl = activeScreenshot
    || featuredScreenshot?.url
    || availableScreenshots[0]?.url
    || "";

  return (
    <div className="game-screenshots-editor">
      <div className="game-screenshot-heading">
        <span>GAMEPLAY PANELS / {selectedScreenshots.length} SELECTED</span>
        {entry.dataSource === "igdb" && (
          <button type="button" className="text-link" onClick={onLoadScreenshots} disabled={busy}>
            LOAD IGDB SCREENSHOTS
          </button>
        )}
      </div>
      {screenshotStatus && <p className="panel-hint" role="status">{screenshotStatus}</p>}
      {previewUrl ? (
        <button className="game-screenshot-large-preview" type="button" onClick={() => onPreviewScreenshot(previewUrl)} aria-label="Open screenshot preview">
          <img src={previewUrl} alt={`Screenshot preview for ${entry.title || "game"}`} loading="lazy" />
          <span>PREVIEW SELECTED PANEL ↗</span>
        </button>
      ) : (
        <p className="game-screenshot-empty">NO GAMEPLAY PANELS SELECTED / Upload a screenshot or search IGDB.</p>
      )}

      {availableScreenshots.length > 0 && (
        <>
          <p className="field-label">IGDB SCREENSHOT SELECTION / CHECK TO KEEP</p>
          <div className="source-screenshot-gallery" aria-label={`IGDB screenshot choices for ${entry.title || "game"}`}>
            {availableScreenshots.map((screenshot, index) => {
              const checked = selectedScreenshots.some((item) => item.id === screenshot.id);
              return (
                <label className={`source-screenshot-option ${checked ? "is-selected" : ""}`} key={screenshot.id}>
                  <input type="checkbox" checked={checked} onChange={() => onToggleScreenshot(screenshot)} />
                  <img
                    src={screenshot.url}
                    alt={`IGDB screenshot ${index + 1}`}
                    loading="lazy"
                    onClick={(event) => {
                      event.preventDefault();
                      onPreviewScreenshot(screenshot.url);
                    }}
                  />
                  <span>{checked ? "SELECTED" : "ADD PANEL"}</span>
                </label>
              );
            })}
          </div>
        </>
      )}

      <label className="field-label" htmlFor={`game-screenshot-upload-${entry.id}`}>UPLOAD A PERSONAL SCREENSHOT</label>
      <input
        id={`game-screenshot-upload-${entry.id}`}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        disabled={busy}
        onChange={onUploadScreenshot}
      />
      <p className="panel-hint">PNG, JPEG, WebP, GIF, or AVIF; maximum 8 MiB. Uploaded shots use your existing private-owner upload workflow and public display URLs.</p>

      {selectedScreenshots.length > 0 && (
        <>
          <label className="field-label" htmlFor={`featured-screenshot-${entry.id}`}>FEATURED GAMEPLAY PANEL</label>
          <select
            id={`featured-screenshot-${entry.id}`}
            value={entry.featuredScreenshotId || featuredScreenshot?.id || ""}
            onChange={(event) => onFeatureScreenshot(event.target.value)}
          >
            {selectedScreenshots.map((screenshot, index) => (
              <option value={screenshot.id} key={screenshot.id}>{String(index + 1).padStart(2, "0")} / {screenshot.source === "upload" ? "UPLOADED" : screenshot.source === "rawg" ? "LEGACY RAWG" : "IGDB"}</option>
            ))}
          </select>
          <ol className="selected-screenshot-list" aria-label="Selected screenshot order">
            {selectedScreenshots.map((screenshot, index) => (
              <li key={screenshot.id}>
                <button type="button" className="selected-screenshot-thumb" onClick={() => onPreviewScreenshot(screenshot.url)} aria-label={`Preview screenshot ${index + 1}`}>
                  <img src={screenshot.url} alt="" loading="lazy" />
                </button>
                <span>{String(index + 1).padStart(2, "0")} / {screenshot.source === "upload" ? "UPLOAD" : screenshot.source === "rawg" ? "LEGACY RAWG" : "IGDB"}</span>
                <button type="button" disabled={index === 0} onClick={() => onMoveScreenshot(screenshot.id, -1)} aria-label={`Move screenshot ${index + 1} up`}>↑</button>
                <button type="button" disabled={index === selectedScreenshots.length - 1} onClick={() => onMoveScreenshot(screenshot.id, 1)} aria-label={`Move screenshot ${index + 1} down`}>↓</button>
                <button type="button" className="text-link text-link-danger" onClick={() => onRemoveScreenshot(screenshot)}>REMOVE</button>
              </li>
            ))}
          </ol>
        </>
      )}
      <label className="toggle-control">
        <input type="checkbox" checked={entry.metadataVisibility?.screenshots !== false} onChange={(event) => onScreenshotVisibilityChange(event.target.checked)} />
        <span>SHOW SCREENSHOT PANELS PUBLICLY</span>
      </label>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<ProfileStudio />);
