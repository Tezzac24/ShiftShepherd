import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageTeamAvatar } from '../../lib/permissions';
import { PickedTeamAvatarFile } from '../../lib/supabase/services/teamAvatars';
import { Team } from '../../types';

const PERMISSION_ERROR =
  'To add a team photo, please allow photo access for Shift Shepherd in your device settings.';
const PICK_ERROR = "We couldn't open your photos. Please try again.";
const READ_ERROR = "We couldn't read that image. Please try a different photo.";

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

function toPickedFile(asset: ImagePicker.ImagePickerAsset): PickedTeamAvatarFile | null {
  const dataUrl = asset.uri ? parseDataUrl(asset.uri) : null;
  const base64 = asset.base64 ?? dataUrl?.base64 ?? null;
  if (!base64) return null;
  const extension = (asset.fileName ?? asset.uri ?? '').split('.').pop()?.toLowerCase() ?? '';
  const mimeType = asset.mimeType ?? dataUrl?.mimeType ?? EXTENSION_MIME_TYPES[extension] ?? '';
  return { base64, mimeType, fileSize: asset.fileSize ?? null };
}

export type TeamAvatarBusy = 'uploading' | 'removing' | null;

export function useTeamAvatar(team: Team) {
  const user = useRequiredUser();
  const { authMode } = useAuth();
  const data = useAppData();
  const showToast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<TeamAvatarBusy>(null);

  const canManage =
    authMode === 'supabase' && canManageTeamAvatar(user, team.id) && !team.id.startsWith('team-');
  const hasPhoto = !!team.avatar_url;
  const avatarUri = data.getTeamAvatarUri(team);

  const changePhoto = useCallback(async () => {
    if (busy || !canManage) return;
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
      await data.setTeamAvatar(team.id, file);
      showToast('Team photo updated.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : PICK_ERROR, 'error');
    } finally {
      setBusy(null);
    }
  }, [busy, canManage, data, showToast, team.id]);

  const removePhoto = useCallback(async () => {
    if (busy || !canManage) return;
    const ok = await confirm({
      title: 'Remove team photo',
      message: `${team.name} will show its initials instead.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      setBusy('removing');
      await data.removeTeamAvatar(team.id);
      showToast('Team photo removed.');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "We couldn't remove the team photo.",
        'error',
      );
    } finally {
      setBusy(null);
    }
  }, [busy, canManage, confirm, data, showToast, team.id, team.name]);

  return { canManage, hasPhoto, avatarUri, busy, changePhoto, removePhoto };
}
