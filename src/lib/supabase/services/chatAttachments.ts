/**
 * Chat image attachment service - the third Supabase Storage slice.
 *
 * V1 supports one optional JPEG/PNG/WebP image (up to 5 MB) per immutable
 * chat message. Objects live in the private `chat-attachments` bucket under
 * `teams/<teamId>/messages/<messageId>/<file>`. The database stores only the
 * path and image metadata; display uses short-lived signed URLs.
 *
 * Send order is deliberate:
 *  1. ask the database for a UUID (no row is created),
 *  2. upload to the final message-scoped path,
 *  3. atomically insert chat_messages + chat_attachments via a narrow,
 *     SECURITY INVOKER RPC,
 *  4. best-effort delete the upload if step 3 fails.
 *
 * This keeps image-only messages safe without message update/delete grants.
 * Demo mode never reaches this service.
 */
import { SupabaseClient } from '@supabase/supabase-js';

import { ChatAttachment, ChatMessage } from '../../../types';
import { getSupabase } from '../client';

export const CHAT_ATTACHMENT_BUCKET = 'chat-attachments';
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const CHAT_IMAGE_TYPE_ERROR = 'Please choose a JPEG, PNG, or WebP image.';
export const CHAT_IMAGE_SIZE_ERROR =
  'This image is too large. Please choose one under 5 MB.';
export const CHAT_IMAGE_SETUP_ERROR =
  'Chat images need storage setup to be applied. Text messages still work normally.';
const UPLOAD_ERROR =
  "We couldn't upload that image. Check your connection and try again.";
const SEND_ERROR = "We couldn't send that image. Please try again.";
const PERMISSION_ERROR = 'You do not have permission to share images in this chat.';
const OFFLINE_ERROR =
  "We couldn't reach the server. Please check your connection and try again.";

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface PickedChatImage {
  /** Raw file content, base64-encoded (no data-URL prefix). */
  base64: string;
  mimeType: string;
  fileSize: number | null;
  /** Original picker filename, stored as metadata only (never used as a path). */
  fileName: string | null;
}

interface ChatMessageRow {
  id: string;
  organisation_id: string;
  team_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new Error(OFFLINE_ERROR);
  return supabase;
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
}

function isNetworkError(error: unknown): boolean {
  return /fetch|network|timeout/i.test(messageOf(error));
}

function isPermissionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return e?.code === '42501' || /row-level security|permission denied/i.test(e?.message ?? '');
}

function isSetupError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return (
    e?.code === 'PGRST202' ||
    e?.code === 'PGRST204' ||
    /bucket not found|new_chat_message_id|send_chat_image_message|chat_attachments|file_size_bytes/i.test(
      e?.message ?? '',
    )
  );
}

const FRIENDLY_MESSAGES = new Set([
  CHAT_IMAGE_TYPE_ERROR,
  CHAT_IMAGE_SIZE_ERROR,
  CHAT_IMAGE_SETUP_ERROR,
  UPLOAD_ERROR,
  SEND_ERROR,
  PERMISSION_ERROR,
  OFFLINE_ERROR,
]);

function fail(operation: string, error: unknown, fallback: string): never {
  console.warn(`[chatAttachments] ${operation} failed`, error);
  if (error instanceof Error && FRIENDLY_MESSAGES.has(error.message)) throw error;
  if (isSetupError(error)) throw new Error(CHAT_IMAGE_SETUP_ERROR);
  if (isPermissionError(error)) throw new Error(PERMISSION_ERROR);
  if (isNetworkError(error)) throw new Error(OFFLINE_ERROR);
  throw new Error(fallback);
}

function requireLiveId(id: string, mockPrefix: string): string {
  if (id.startsWith(mockPrefix)) {
    console.warn(`[chatAttachments] refusing mock id "${id}"`);
    throw new Error(SEND_ERROR);
  }
  return id;
}

function normaliseMimeType(mimeType: string): string {
  const lower = mimeType.trim().toLowerCase();
  return lower === 'image/jpg' ? 'image/jpeg' : lower;
}

function imageSize(file: PickedChatImage): number {
  return file.fileSize ?? Math.floor((file.base64.replace(/\s/g, '').length * 3) / 4);
}

/** Friendly validation message, or null when the selected image is valid. */
export function validateChatImage(file: PickedChatImage): string | null {
  const mimeType = normaliseMimeType(file.mimeType);
  if (!ALLOWED_IMAGE_TYPES[mimeType]) return CHAT_IMAGE_TYPE_ERROR;
  const size = imageSize(file);
  if (size < 1 || size > CHAT_IMAGE_MAX_BYTES) return CHAT_IMAGE_SIZE_ERROR;
  return null;
}

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

export function isChatAttachmentPath(value: string | null | undefined): value is string {
  return !!value && /^teams\/[^/]+\/messages\/[^/]+\/[^/]+$/.test(value);
}

async function fetchOrganisationId(
  supabase: SupabaseClient,
  liveProfileId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('organisation_id')
    .eq('id', liveProfileId)
    .single();
  if (error) throw error;
  return data.organisation_id as string;
}

/** Best-effort rollback/cleanup. Never throws. */
export async function deleteChatAttachmentObject(path: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !isChatAttachmentPath(path)) return;
  try {
    const { error } = await supabase.storage.from(CHAT_ATTACHMENT_BUCKET).remove([path]);
    if (error) throw error;
  } catch (error) {
    console.warn(`[chatAttachments] cleanup of "${path}" failed (orphaned object)`, error);
  }
}

/**
 * Upload and send one image message. Caption text may be empty. The returned
 * message includes the attachment immediately; the next canonical refetch
 * replaces the temporary metadata id with the database-owned row id.
 */
export async function sendChatImageMessage(
  teamId: string,
  body: string,
  liveProfileId: string,
  file: PickedChatImage,
): Promise<ChatMessage> {
  const supabase = requireClient();
  const validationError = validateChatImage(file);
  if (validationError) throw new Error(validationError);

  const liveTeamId = requireLiveId(teamId, 'team-');
  const senderId = requireLiveId(liveProfileId, 'user-');
  const mimeType = normaliseMimeType(file.mimeType);
  const size = imageSize(file);
  let path: string | null = null;
  let uploaded = false;

  try {
    const [organisationId, idResult] = await Promise.all([
      fetchOrganisationId(supabase, senderId),
      supabase.rpc('new_chat_message_id'),
    ]);
    if (idResult.error) throw idResult.error;
    const messageId = idResult.data as string | null;
    if (!messageId) throw new Error(CHAT_IMAGE_SETUP_ERROR);

    const extension = ALLOWED_IMAGE_TYPES[mimeType];
    path = `teams/${liveTeamId}/messages/${messageId}/image-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(CHAT_ATTACHMENT_BUCKET)
      .upload(path, base64ToBytes(file.base64), {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) throw uploadError;
    uploaded = true;

    const originalName = (file.fileName?.trim() || `photo.${extension}`).slice(0, 240);
    const { data, error: sendError } = await supabase.rpc('send_chat_image_message', {
      p_message_id: messageId,
      p_organisation_id: organisationId,
      p_team_id: liveTeamId,
      p_sender_id: senderId,
      p_body: body.trim(),
      p_file_url: path,
      p_file_type: mimeType,
      p_file_name: originalName,
      p_file_size_bytes: size,
    });
    if (sendError) {
      await deleteChatAttachmentObject(path);
      path = null;
      throw sendError;
    }

    const row = (Array.isArray(data) ? data[0] : data) as ChatMessageRow | null;
    if (!row) {
      await deleteChatAttachmentObject(path);
      path = null;
      throw new Error(SEND_ERROR);
    }
    const attachment: ChatAttachment = {
      id: `pending:${messageId}`,
      message_id: messageId,
      file_url: path,
      file_type: mimeType,
      file_name: originalName,
      file_size_bytes: size,
      created_at: row.created_at,
    };
    return { ...row, attachment };
  } catch (error) {
    if (path) await deleteChatAttachmentObject(path);
    fail('send image', error, uploaded ? SEND_ERROR : UPLOAD_ERROR);
  }
}

/** Short-lived path-to-URL map for the private bucket. */
export async function createChatAttachmentSignedUrls(
  paths: string[],
): Promise<Record<string, string> | null> {
  const supabase = getSupabase();
  if (!supabase || paths.length === 0) return null;
  try {
    const { data, error } = await supabase.storage
      .from(CHAT_ATTACHMENT_BUCKET)
      .createSignedUrls(paths, CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    const byPath: Record<string, string> = {};
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl && !entry.error) byPath[entry.path] = entry.signedUrl;
    }
    return byPath;
  } catch (error) {
    console.warn('[chatAttachments] signing image URLs failed', error);
    return null;
  }
}
