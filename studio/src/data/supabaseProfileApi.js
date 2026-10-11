export const PROFILE_ID = "sae";
export const PROFILE_MEDIA_BUCKET = "bio-media";
export const PROFILE_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const PUBLISHED_PROFILE_CACHE_KEY = "sae-bio-published-profile-v1";

export function isProfileSnapshot(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.profile &&
    typeof value.profile === "object" &&
    value.theme &&
    typeof value.theme === "object" &&
    Array.isArray(value.sections)
  );
}

export async function fetchDraft(client) {
  const { data, error } = await client
    .from("profile_drafts")
    .select("content, updated_at")
    .eq("profile_id", PROFILE_ID)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function verifyProfileOwner(client) {
  const { data, error } = await client.rpc("is_profile_owner");
  if (error) throw error;
  return data === true;
}

export async function saveDraft(client, userId, content, existingDraft) {
  const query = existingDraft
    ? client
        .from("profile_drafts")
        .update({ content })
        .eq("profile_id", PROFILE_ID)
        .eq("owner_id", userId)
        .eq("updated_at", existingDraft.updated_at)
    : client
        .from("profile_drafts")
        .insert({ profile_id: PROFILE_ID, owner_id: userId, content });
  const { data, error } = await query.select("content, updated_at").maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("The cloud draft changed in another tab or session. Reload it before saving so you do not overwrite newer work.");
  }
  return data;
}

export async function publishDraft(client, expectedUpdatedAt) {
  const { data, error } = await client.rpc("publish_profile", {
    expected_updated_at: expectedUpdatedAt
  });
  if (error) throw error;
  return data;
}

export async function fetchPublishedProfile(client) {
  const { data, error } = await client
    .from("published_profiles")
    .select("content, published_at")
    .eq("profile_id", PROFILE_ID)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function uploadProfileImage(client, file) {
  const extensions = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  const extension = extensions[file.type];
  if (!extension) {
    throw new Error("Choose a PNG, JPEG, WebP, GIF, or AVIF image.");
  }
  if (file.size > PROFILE_MEDIA_MAX_BYTES) {
    throw new Error("Choose an image smaller than 8 MiB.");
  }

  const path = `sae/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await client.storage
    .from(PROFILE_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw error;
  const { data: { publicUrl } } = client.storage
    .from(PROFILE_MEDIA_BUCKET)
    .getPublicUrl(data.path);
  return publicUrl;
}

function hasImageReference(value, imageUrl) {
  if (value === imageUrl) return true;
  if (Array.isArray(value)) return value.some((item) => hasImageReference(item, imageUrl));
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => hasImageReference(item, imageUrl));
  }
  return false;
}

export async function deleteUnusedProfileImage(client, imageUrl, retainedDraft) {
  const marker = `/storage/v1/object/public/${PROFILE_MEDIA_BUCKET}/`;
  const markerIndex = imageUrl.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("Only images uploaded to this profile's bio-media bucket can be deleted here.");
  }

  const path = decodeURIComponent(imageUrl.slice(markerIndex + marker.length));
  if (!path.startsWith("sae/")) {
    throw new Error("This image is outside the profile's sae/ storage folder.");
  }
  if (hasImageReference(retainedDraft, imageUrl)) {
    throw new Error("Remove this image from every draft field that uses it before deleting the stored file.");
  }

  const publication = await fetchPublishedProfile(client);
  if (publication && hasImageReference(publication.content, imageUrl)) {
    throw new Error("The published profile still uses this image. Publish a replacement before deleting the stored file.");
  }

  const { error } = await client.storage.from(PROFILE_MEDIA_BUCKET).remove([path]);
  if (error) throw error;
}

export function loadCachedPublishedProfile() {
  try {
    const cache = localStorage.getItem(PUBLISHED_PROFILE_CACHE_KEY);
    if (!cache) return null;
    const parsed = JSON.parse(cache);
    return isProfileSnapshot(parsed?.content) ? parsed : null;
  } catch {
    return null;
  }
}

export function cachePublishedProfile(publication) {
  try {
    localStorage.setItem(PUBLISHED_PROFILE_CACHE_KEY, JSON.stringify(publication));
  } catch {
    // Public profile availability does not depend on browser cache storage.
  }
}
