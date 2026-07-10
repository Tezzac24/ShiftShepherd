/**
 * Profile photo management for the Profile screen (live Supabase mode only).
 *
 * Owns the whole flow: ask for photo-library permission (only when the user
 * taps, never at startup), open the system picker, normalise the picked
 * image into the avatar service's shape, and hand it to AppData — which
 * uploads to the private `profile-avatars` bucket and repoints the profile.
 * Successes toast; failures toast the service's friendly message. Demo mode
 * never sees these controls (`canManagePhoto` is false), so demo behaviour
 * is untouched.
 */
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { PickedAvatarFile } from '../../lib/supabase/services/profileAvatars';

const PERMISSION_ERROR =
  'To add a photo, please allow photo access for Shift Shepherd in your device settings.';
const PICK_ERROR = 'We couldn’t open your photos. Please try again.';
const READ_ERROR = 'We couldn’t read that image. Please try a different photo.';
const REMOVE_ERROR = 'We couldn’t remove your photo right now. Please try again.';

const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function parseDataUrl(uri: string): { mimeType: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(uri);
  return match ? { mimeType: match[1], base64: match[2] } : null;
}

/**
 * Normalise a picked asset into the service's file shape. The picker usually
 * provides base64 + mimeType directly; on web the uri may be a data URL, and
 * a missing mime type falls back to the file extension. Null when the image
 * content simply isn't readable.
 */
function toPickedFile(asset: ImagePicker.ImagePickerAsset): PickedAvatarFile | null {
  const dataUrl = asset.uri ? parseDataUrl(asset.uri) : null;
  const base64 = asset.base64 ?? dataUrl?.base64 ?? null;
  if (!base64) return null;
  const extension = (asset.fileName ?? asset.uri ?? '').split('.').pop()?.toLowerCase() ?? '';
  const mimeType = asset.mimeType ?? dataUrl?.mimeType ?? EXTENSION_MIME_TYPES[extension] ?? '';
  return { base64, mimeType, fileSize: asset.fileSize ?? null };
}

export type AvatarBusy = 'uploading' | 'removing' | null;

export function useProfileAvatar() {
  const user = useRequiredUser();
  const { authMode } = useAuth();
  const data = useAppData();
  const showToast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<AvatarBusy>(null);

  // Photo management is a live-Supabase feature: demo mode keeps its
  // initials-only profile card and never calls Supabase Storage.
  const canManagePhoto = authMode === 'supabase' && !!user.supabaseProfileId;
  const hasPhoto = !!user.profile.avatar_url;
  const avatarUri = data.getAvatarUri(user.profile);

  const changePhoto = useCallback(async () => {
    if (busy) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast(PERMISSION_ERROR, 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
        selectionLimit: 1,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      const file = toPickedFile(asset);
      if (!file) {
        showToast(READ_ERROR, 'error');
        return;
      }
      setBusy('uploading');
      // Type/size validation (JPEG/PNG/WebP, under 5 MB) happens in the
      // avatar service, which rejects with the matching friendly copy.
      await data.setOwnAvatar(file);
      showToast('Profile photo updated.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : PICK_ERROR, 'error');
    } finally {
      setBusy(null);
    }
  }, [busy, data, showToast]);

  const removePhoto = useCallback(async () => {
    if (busy) return;
    const ok = await confirm({
      title: 'Remove photo',
      message: 'Your profile will show your initials instead.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      setBusy('removing');
      await data.removeOwnAvatar();
      showToast('Profile photo removed.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : REMOVE_ERROR, 'error');
    } finally {
      setBusy(null);
    }
  }, [busy, confirm, data, showToast]);

  return { canManagePhoto, hasPhoto, avatarUri, busy, changePhoto, removePhoto };
}
