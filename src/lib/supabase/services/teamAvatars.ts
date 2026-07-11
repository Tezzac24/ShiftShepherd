/** Private team-avatar Storage service for live Supabase sessions. */
import { SupabaseClient } from '@supabase/supabase-js';

import { getSupabase } from '../client';

export const TEAM_AVATAR_BUCKET = 'team-avatars';
export const TEAM_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const TEAM_AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const TEAM_AVATAR_TYPE_ERROR = 'Please choose a JPEG, PNG, or WebP image.';
export const TEAM_AVATAR_SIZE_ERROR = 'This image is too large. Please choose one under 5 MB.';
const UPLOAD_ERROR = "We couldn't upload the team photo. Check your connection and try again.";
const REMOVE_ERROR = "We couldn't remove the team photo right now. Please try again.";
const PERMISSION_ERROR = 'You do not have permission to change this team photo.';
const OFFLINE_ERROR = "We couldn't reach the server. Please check your connection and try again.";
const SETUP_ERROR = 'Team photos are not switched on yet. Please try again after the next update.';

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface PickedTeamAvatarFile {
  base64: string;
  mimeType: string;
  fileSize: number | null;
}

function requireClient(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new Error(OFFLINE_ERROR);
  return supabase;
}

function normaliseMimeType(value: string): string {
  const lower = value.trim().toLowerCase();
  return lower === 'image/jpg' ? 'image/jpeg' : lower;
}

function imageSize(file: PickedTeamAvatarFile): number {
  return file.fileSize ?? Math.floor(file.base64.replace(/\s/g, '').length * 0.75);
}

export function validateTeamAvatarFile(file: PickedTeamAvatarFile): string {
  const mimeType = normaliseMimeType(file.mimeType);
  if (!ALLOWED_IMAGE_TYPES[mimeType]) throw new Error(TEAM_AVATAR_TYPE_ERROR);
  const size = imageSize(file);
  if (size < 1 || size > TEAM_AVATAR_MAX_BYTES) throw new Error(TEAM_AVATAR_SIZE_ERROR);
  return mimeType;
}

export function buildTeamAvatarPath(
  teamId: string,
  mimeType: string,
  timestamp = Date.now(),
): string {
  const extension = ALLOWED_IMAGE_TYPES[normaliseMimeType(mimeType)];
  if (!extension) throw new Error(TEAM_AVATAR_TYPE_ERROR);
  return `teams/${teamId}/avatar-${timestamp}.${extension}`;
}

export function isTeamAvatarPathForTeam(path: string, teamId: string): boolean {
  return path.startsWith(`teams/${teamId}/`) && path.slice(`teams/${teamId}/`.length).length > 0;
}

function base64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s/g, '');
  const atobFn = (globalThis as { atob?: (data: string) => string }).atob;
  if (atobFn) {
    const binary = atobFn(cleaned);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const stripped = cleaned.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((stripped.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const character of stripped) {
    const value = alphabet.indexOf(character);
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

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message ?? '');
}

function isFriendly(message: string): boolean {
  return [
    TEAM_AVATAR_TYPE_ERROR,
    TEAM_AVATAR_SIZE_ERROR,
    UPLOAD_ERROR,
    REMOVE_ERROR,
    PERMISSION_ERROR,
    OFFLINE_ERROR,
    SETUP_ERROR,
  ].includes(message);
}

function fail(operation: 'upload' | 'remove', error: unknown): never {
  const message = messageOf(error);
  console.warn(`[teamAvatars] ${operation} failed`, {
    code: (error as { code?: string })?.code,
  });
  if (error instanceof Error && isFriendly(error.message)) throw error;
  if (/fetch|network|timeout/i.test(message)) throw new Error(OFFLINE_ERROR);
  if (/permission|row-level security|not allowed/i.test(message)) throw new Error(PERMISSION_ERROR);
  if (/bucket not found|could not find the function|function .* does not exist/i.test(message)) {
    throw new Error(SETUP_ERROR);
  }
  throw new Error(operation === 'upload' ? UPLOAD_ERROR : REMOVE_ERROR);
}

/** Best-effort cleanup. A failed cleanup never reverses a successful update. */
export async function deleteTeamAvatarObject(path: string, teamId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !isTeamAvatarPathForTeam(path, teamId)) return;
  try {
    const { error } = await supabase.storage.from(TEAM_AVATAR_BUCKET).remove([path]);
    if (error) throw error;
  } catch (error) {
    console.warn('[teamAvatars] non-fatal cleanup failed', {
      code: (error as { code?: string })?.code,
    });
  }
}

export async function uploadTeamAvatar(
  teamId: string,
  previousPath: string | null,
  file: PickedTeamAvatarFile,
): Promise<string> {
  let newPath: string | null = null;
  try {
    if (teamId.startsWith('team-')) throw new Error(PERMISSION_ERROR);
    const mimeType = validateTeamAvatarFile(file);
    const supabase = requireClient();
    newPath = buildTeamAvatarPath(teamId, mimeType);
    const { error: uploadError } = await supabase.storage
      .from(TEAM_AVATAR_BUCKET)
      .upload(newPath, base64ToBytes(file.base64), {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { error: rpcError } = await supabase.rpc('set_team_avatar_path', {
      p_team_id: teamId,
      p_avatar_path: newPath,
    });
    if (rpcError) {
      await deleteTeamAvatarObject(newPath, teamId);
      newPath = null;
      throw rpcError;
    }

    if (previousPath && previousPath !== newPath) {
      await deleteTeamAvatarObject(previousPath, teamId);
    }
    return newPath;
  } catch (error) {
    if (newPath) await deleteTeamAvatarObject(newPath, teamId);
    fail('upload', error);
  }
}

export async function removeTeamAvatar(teamId: string, currentPath: string | null): Promise<void> {
  try {
    if (teamId.startsWith('team-')) throw new Error(PERMISSION_ERROR);
    const supabase = requireClient();
    const { error } = await supabase.rpc('set_team_avatar_path', {
      p_team_id: teamId,
      p_avatar_path: null,
    });
    if (error) throw error;
    if (currentPath) await deleteTeamAvatarObject(currentPath, teamId);
  } catch (error) {
    fail('remove', error);
  }
}

export async function createTeamAvatarSignedUrls(
  paths: string[],
): Promise<Record<string, string> | null> {
  const supabase = getSupabase();
  if (!supabase || paths.length === 0) return null;
  try {
    const { data, error } = await supabase.storage
      .from(TEAM_AVATAR_BUCKET)
      .createSignedUrls(paths, TEAM_AVATAR_SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    const byPath: Record<string, string> = {};
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl && !entry.error) byPath[entry.path] = entry.signedUrl;
    }
    return byPath;
  } catch (error) {
    console.warn('[teamAvatars] signing failed', { code: (error as { code?: string })?.code });
    return null;
  }
}
