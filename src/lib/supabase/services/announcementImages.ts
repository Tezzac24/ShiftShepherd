/**
 * Announcement image storage service - the second Supabase Storage slice.
 *
 * All Storage reads/writes for announcement images live here so screens and
 * AppDataContext never talk to buckets themselves. The backend pieces come
 * from `20260710114621_add_announcement_image_storage.sql`:
 *
 *  - a **private** `announcement-images` bucket (5 MB cap, JPEG/PNG/WebP
 *    only);
 *  - object policies keyed off the path `announcements/<announcementId>/…`:
 *    anyone who can read the announcement can read its image, and only the
 *    users allowed to manage that announcement (per the existing 002 rules)
 *    can add/replace/delete objects for it; anon has no access.
 *
 * The path is stored in the existing `announcements.image_url` column - in
 * live mode it holds the storage *path* (`announcements/<id>/<file>`), never
 * a URL. Repointing goes through the existing announcements service update
 * (the announcements UPDATE policy + grants already scope it to authorised
 * editors), so there is no RPC and no new write permission. Display goes
 * through short-lived signed URLs; an expired or unsignable path simply
 * renders no image. Until the migration is pushed, uploads fail with the
 * friendly "not switched on yet" message and nothing else is affected.
 *
 * Replace keeps the old image until the new one is fully in place: upload
 * new object → repoint the announcement → best-effort delete the old object.
 * A failed cleanup never blocks success (an orphaned object is invisible; a
 * future cleanup job can sweep them). Demo mode never reaches this service.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import { Announcement } from '../../../types';
import { getSupabase } from '../client';
import * as announcementsService from './announcements';

export const ANNOUNCEMENT_IMAGE_BUCKET = 'announcement-images';
// Keep in step with the bucket's file_size_limit.
export const ANNOUNCEMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const ANNOUNCEMENT_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Friendly, non-technical messages — shown directly in the UI. */
export const IMAGE_TYPE_ERROR = 'Please choose a JPEG, PNG, or WebP image.';
export const IMAGE_SIZE_ERROR = 'This image is too large. Please choose one under 5 MB.';
const UPLOAD_ERROR = 'We couldn’t upload the image. Check your connection and try again.';
const REMOVE_ERROR = 'We couldn’t remove the image right now. Please try again.';
const SETUP_ERROR = 'Announcement images aren’t switched on yet. Please try again soon.';
const OFFLINE_ERROR =
  'We couldn’t reach the server. Please check your connection and try again.';

/** mime type → file extension for generated object names. */
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** What the image picker hands over: content plus enough metadata to validate. */
export interface PickedAnnouncementImage {
  /** Raw file content, base64-encoded (no data-URL prefix). */
  base64: string;
  /** e.g. "image/jpeg". "image/jpg" is normalised for convenience. */
  mimeType: string;
  /** Byte size when the picker knows it; estimated from base64 otherwise. */
  fileSize: number | null;
}

/**
 * True when a stored `image_url` value is an announcement-images storage
 * path this slice manages. Legacy values (the old `'placeholder'` marker) and
 * anything else render no image rather than being signed or deleted.
 */
export function isAnnouncementImagePath(
  value: string | null | undefined,
): value is string {
  return !!value && value.startsWith('announcements/');
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
  IMAGE_TYPE_ERROR,
  IMAGE_SIZE_ERROR,
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
  return /bucket not found/i.test(e?.message ?? '');
}

/** Log the technical error, throw the friendly one. */
function fail(operation: string, error: unknown, fallback: string): never {
  console.warn(`[announcementImages] ${operation} failed`, error);
  if (error instanceof Error && FRIENDLY_MESSAGES.has(error.message)) throw error;
  if (isStorageNotSetUp(error)) throw new Error(SETUP_ERROR);
  if (isNetworkError(error)) throw new Error(OFFLINE_ERROR);
  throw new Error(fallback);
}

/** Demo/mock ids must never reach the live bucket or table. */
function requireLiveAnnouncementId(id: string, friendlyError: string): string {
  if (id.startsWith('ann-')) {
    console.warn(`[announcementImages] refusing mock announcement id "${id}"`);
    throw new Error(friendlyError);
  }
  return id;
}

/** Normalise picker mime variants ("image/jpg") onto the canonical types. */
function normaliseMimeType(mimeType: string): string {
  const lower = mimeType.trim().toLowerCase();
  return lower === 'image/jpg' ? 'image/jpeg' : lower;
}

/**
 * Friendly validation message for a picked image, or null when it is fine.
 * Used at pick time so people hear about a wrong type/size straight away,
 * and again inside the upload as the enforcement backstop.
 */
export function validateAnnouncementImage(file: PickedAnnouncementImage): string | null {
  const mimeType = normaliseMimeType(file.mimeType);
  if (!ALLOWED_IMAGE_TYPES[mimeType]) return IMAGE_TYPE_ERROR;
  // base64 encodes 3 bytes per 4 characters when the picker gave no size.
  const size = file.fileSize ?? Math.floor((file.base64.length * 3) / 4);
  if (size > ANNOUNCEMENT_IMAGE_MAX_BYTES) return IMAGE_SIZE_ERROR;
  return null;
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
 * Best-effort delete of an announcement image object. Never throws: the
 * announcement row is already correct by the time this runs, so a failed
 * cleanup only leaves an unreachable orphan behind (candidate for a future
 * cleanup job).
 */
export async function deleteAnnouncementImageObject(path: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !isAnnouncementImagePath(path)) return;
  try {
    const { error } = await supabase.storage
      .from(ANNOUNCEMENT_IMAGE_BUCKET)
      .remove([path]);
    if (error) throw error;
  } catch (error) {
    console.warn(
      `[announcementImages] cleanup of "${path}" failed (orphaned object)`,
      error,
    );
  }
}

/**
 * Upload an image for an existing announcement and point its row at it. The
 * old object (if any) survives until the new one is fully in place, then
 * gets a best-effort delete. Returns the updated announcement.
 */
export async function uploadAnnouncementImage(
  announcementId: string,
  file: PickedAnnouncementImage,
  previousPath: string | null,
): Promise<Announcement> {
  const supabase = requireClient();
  const id = requireLiveAnnouncementId(announcementId, UPLOAD_ERROR);

  const validationError = validateAnnouncementImage(file);
  if (validationError) throw new Error(validationError);
  const mimeType = normaliseMimeType(file.mimeType);
  const path = `announcements/${id}/image-${Date.now()}.${ALLOWED_IMAGE_TYPES[mimeType]}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from(ANNOUNCEMENT_IMAGE_BUCKET)
      .upload(path, base64ToBytes(file.base64), {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) throw uploadError;
  } catch (error) {
    fail('upload', error, UPLOAD_ERROR);
  }

  let updated: Announcement;
  try {
    // The announcements service enforces/maps everything row-related and
    // already speaks friendly errors (permission, missing, offline …).
    updated = await announcementsService.updateAnnouncement(id, { image_url: path });
  } catch (error) {
    // The announcement still shows its old image — take the new object back.
    await deleteAnnouncementImageObject(path);
    throw error;
  }

  if (previousPath && previousPath !== path) {
    await deleteAnnouncementImageObject(previousPath);
  }
  return updated;
}

/**
 * Clear an announcement's image. The announcement row is the source of
 * truth: only after it is cleared does the object get a best-effort delete.
 * Returns the updated announcement.
 */
export async function removeAnnouncementImage(
  announcementId: string,
  currentPath: string | null,
): Promise<Announcement> {
  requireClient();
  const id = requireLiveAnnouncementId(announcementId, REMOVE_ERROR);
  const updated = await announcementsService.updateAnnouncement(id, { image_url: null });
  if (currentPath) await deleteAnnouncementImageObject(currentPath);
  return updated;
}

/**
 * Short-lived signed display URLs for a set of announcement image paths (the
 * bucket is private). Returns path → URL for every path that could be
 * signed; null when signing is unavailable entirely — callers simply render
 * no image, never an error. Signed URLs are session/display state only and
 * are never stored.
 */
export async function createAnnouncementImageSignedUrls(
  paths: string[],
): Promise<Record<string, string> | null> {
  const supabase = getSupabase();
  if (!supabase || paths.length === 0) return null;
  try {
    const { data, error } = await supabase.storage
      .from(ANNOUNCEMENT_IMAGE_BUCKET)
      .createSignedUrls(paths, ANNOUNCEMENT_IMAGE_SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    const byPath: Record<string, string> = {};
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl && !entry.error) {
        byPath[entry.path] = entry.signedUrl;
      }
    }
    return byPath;
  } catch (error) {
    console.warn('[announcementImages] signing image URLs failed', error);
    return null;
  }
}
