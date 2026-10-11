import { defaultProfile } from "./defaultProfile.js";

export const DRAFT_STORAGE_KEY = "sae-bio-profile-draft-v1";

export function loadProfileDraft() {
  try {
    const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!stored) return { profile: structuredClone(defaultProfile), warning: "" };
    const profile = JSON.parse(stored);
    if (!profile || !Array.isArray(profile.sections) || !profile.profile || !profile.theme) {
      throw new Error("The saved draft is not a valid profile.");
    }
    return { profile, warning: "" };
  } catch {
    return {
      profile: structuredClone(defaultProfile),
      warning: "The saved browser draft could not be read. Your current edits can still be saved again."
    };
  }
}
