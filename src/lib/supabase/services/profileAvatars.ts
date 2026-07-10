/**
 * Profile avatar storage service - the first Supabase Storage slice.
 *
 * All Storage reads/writes for profile photos live here so screens and
 * AppDataContext never talk to buckets themselves. The backend pieces come
 * from `20260710105140_add_profile_avatar_storage.sql`:
 *
 *  - a **private** `profile-avatars` bucket (5 MB cap, JPEG/PNG/WebP only);
 *  - object policies: org members may read an avatar exactly when they can
 *    see its profile row; each user may write/delete only inside their own
 *    `profiles/<profileId>/` folder; anon has no access;
 *  - `set_own_profile_avatar_path(text)` - a narrow security-definer RPC
 *    that points the caller's own `profiles.avatar_url` at an uploaded
 *    object path (or null to remove). There is no table-level UPDATE grant
 *    on profiles.
 *
 * `profiles.avatar_url` stores the storage *path* (`profiles/<id>/<file>`),
 * never a URL: the bucket is private, so display goes through short-lived
 * signed URLs (`createAvatarSignedUrls`), and expired links simply fall back
 * to initials. Until that migration is pushed, uploads fail with the
 * friendly "not switched on yet" message and nothing else is affected.
 *
 * Replace keeps the old photo until the new one is fully in place: upload
 * new object → repoint the profile → best-effort delete the old object. A
 * failed cleanup never blocks success (an orphaned object is invisible; a
 * future cleanup job can sweep them). Demo mode never reaches this service.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import { getSupabase } from '../client';

export const AVATAR_BUCKET = 'profile-avatars';
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // keep in step with the bucket's file_size_limit
export const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Friendly, non-technical messages — shown directly in the UI. */
export const AVATAR_TYPE_ERROR = 'Please choose a JPEG, PNG, or WebP image.';
export const AVATAR_SIZE_ERROR = 'This image is too large. Please choose one under 5 MB.';
const UPLOAD_ERROR = 'We couldn’t upload your photo. Check your connection and try again.';
const REMOVE_ERROR = 'We couldn’t remove your photo right now. Please try again.';
const SETUP_ERROR = 'Profile photos aren’t switched on yet. Please try again soon.';
const OFFLINE_ERROR =
  'We couldn’t reach the server. Please check your connection and try again.';

/** mime type → file extension for generated object names. */
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** What the image picker hands over: content plus enough metadata to validate. */
export interface PickedAvatarFile {
  /** Raw file content, base64-encoded (no data-URL prefix). */
  base64: string;
  /** e.g. "image/jpeg". "image/jpg" is normalised for convenience. */
  mimeType: string;
  /** Byte size when the picker knows it; estimated from base64 otherwise. */
  fileSize: number | null;
}

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) {
    // Callers only reach this service in live mode, so this is a programming
    // error — but fail with a calm message rather than crashing.
    throw new Error(OFFLINE_ERROR);
  }
  return supabase;
}

const FRIENDLY_MESSAGES = new Set([
  AVATAR_TYPE_ERROR,
  AVATAR_SIZE_ERROR,
  UPLOAD_ERROR,
  REMOVE_ERROR,
  SETUP_ERROR,
  OFFLINE_ERROR,
]);

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
}

function isNetworkError(error: unknown): boolean {
  return /fetch|network|timeout/i.test(messageOf(error));
}

/** The storage foundation migration hasn't been applied yet. */
function isStorageNotSetUp(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  // "Bucket not found" = missing bucket; PGRST202 = missing RPC.
  return e?.code === 'PGRST202' || /bucket not found/i.test(e?.message ?? '');
}

/** Log the technical error, throw the friendly one. */
function fail(operation: string, error: unknown, fallback: string): never {
  console.warn(`[profileAvatars] ${operation} failed`, error);
  if (error instanceof Error && FRIENDLY_MESSAGES.has(error.message)) throw error;
  if (isStorageNotSetUp(error)) throw new Error(SETUP_ERROR);
  if (isNetworkError(error)) throw new Error(OFFLINE_ERROR);
  throw new Error(fallback);
}

function requireLiveProfileId(id: string): string {
  if (id.startsWith('user-')) {
    console.warn(`[profileAvatars] refusing mock profile id "${id}"`);
    throw new Error(UPLOAD_ERROR);
  }
  return id;
}

/** The folder all of one profile's avatar objects live under. */
function avatarFolder(profileId: string): string {
  return `profiles/${profileId}/`;
}

/** Normalise picker mime variants ("image/jpg") onto the canonical types. */
function normaliseMimeType(mimeType: string): string {
  const lower = mimeType.trim().toLowerCase();
  return lower === 'image/jpg' ? 'image/jpeg' : lower;
}

/**
 * Validate type and size with friendly errors; returns the canonical mime
 * type. Size falls back to the base64 length when the picker gave none
 * (base64 encodes 3 bytes per 4 characters).
 */
function validateAvatarFile(file: PickedAvatarFile): string {
  const mimeType = normaliseMimeType(file.mimeType);
  if (!ALLOWED_IMAGE_TYPES[mimeType]) throw new Error(AVATAR_TYPE_ERROR);
  const size = file.fileSize ?? Math.floor((file.base64.length * 3) / 4);
  if (size > AVATAR_MAX_BYTES) throw new Error(AVATAR_SIZE_ERROR);
  return mimeType;
}

/** Decode base64 into bytes (native atob where available, pure JS otherwise). */
function base64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s/g, '');
  const atobFn = (globalThis as { atob?: (data: string) => string }).atob;
  if (atobFn) {
    const binary = atobFn(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const stripped = cleaned.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((stripped.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of stripped) {
    const value = alphabet.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.subarray(0, index);
}

/**
 * Best-effort delete of an avatar object. Never throws: profile state is
 * already correct by the time this runs, so a failed cleanup only leaves an
 * unreachable orphan behind (candidate for a future cleanup job).
 */
async function removeAvatarObject(supabase: SupabaseClient, path: string): Promise<void> {
  try {
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    if (error) throw error;
  } catch (error) {
    console.warn(`[profileAvatars] cleanup of "${path}" failed (orphaned object)`, error);
  }
}

/**
 * Upload a new avatar for the signed-in profile and point their profile row
 * at it. The old object (if any) survives until the new one is fully in
 * place, then gets a best-effort delete. Returns the new storage path.
 */
export async function uploadOwnProfileAvatar(
  file: PickedAvatarFile,
  liveProfileId: string,
  previousPath: string | null,
): Promise<string> {
  const supabase = requireClient();
  try {
    const profileId = requireLiveProfileId(liveProfileId);
    const mimeType = validateAvatarFile(file);
    const path = `${avatarFolder(profileId)}avatar-${Date.now()}.${ALLOWED_IMAGE_TYPES[mimeType]}`;

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, base64ToBytes(file.base64), {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { error: rpcError } = await supabase.rpc('set_own_profile_avatar_path', {
      new_avatar_path: path,
    });
    if (rpcError) {
      // The profile still points at the old photo — take the new object back.
      await removeAvatarObject(supabase, path);
      throw rpcError;
    }

    if (previousPath && previousPath !== path) {
      await removeAvatarObject(supabase, previousPath);
    }
    return path;
  } catch (error) {
    fail('upload', error, UPLOAD_ERROR);
  }
}

/**
 * Clear the signed-in profile's avatar. The profile row is the source of
 * truth: only after it is cleared does the object get a best-effort delete.
 */
export async function removeOwnProfileAvatar(
  liveProfileId: string,
  currentPath: string | null,
): Promise<void> {
  const supabase = requireClient();
  try {
    requireLiveProfileId(liveProfileId);
    const { error } = await supabase.rpc('set_own_profile_avatar_path', {
      new_avatar_path: null,
    });
    if (error) throw error;
    if (currentPath) await removeAvatarObject(supabase, currentPath);
  } catch (error) {
    fail('remove', error, REMOVE_ERROR);
  }
}

/**
 * Short-lived signed display URLs for a set of avatar paths (the bucket is
 * private). Returns path → URL for every path that could be signed; null when
 * signing is unavailable entirely — callers fall back to initials, never an
 * error. Signed URLs are session/display state only and are never stored.
 */
export async function createAvatarSignedUrls(
  paths: string[],
): Promise<Record<string, string> | null> {
  const supabase = getSupabase();
  if (!supabase || paths.length === 0) return null;
  try {
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrls(paths, AVATAR_SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    const byPath: Record<string, string> = {};
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl && !entry.error) {
        byPath[entry.path] = entry.signedUrl;
      }
    }
    return byPath;
  } catch (error) {
    console.warn('[profileAvatars] signing avatar URLs failed', error);
    return null;
  }
}
