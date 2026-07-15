import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { useToast } from '../../components/Toast';
import { PickedTeamAvatarFile } from '../../lib/supabase/services/teamAvatars';

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

function pickedFile(asset: ImagePicker.ImagePickerAsset): PickedTeamAvatarFile | null {
  const dataUrl = asset.uri ? parseDataUrl(asset.uri) : null;
  const base64 = asset.base64 ?? dataUrl?.base64 ?? null;
  if (!base64) return null;
  const extension = (asset.fileName ?? asset.uri ?? '').split('.').pop()?.toLowerCase() ?? '';
  const mimeType = asset.mimeType ?? dataUrl?.mimeType ?? EXTENSION_MIME_TYPES[extension] ?? '';
  return { base64, mimeType, fileSize: asset.fileSize ?? null };
}

export interface TeamAvatarDraft {
  file: PickedTeamAvatarFile;
  previewUri: string;
}

export function useTeamAvatarDraft() {
  const showToast = useToast();
  const [draft, setDraft] = useState<TeamAvatarDraft | null>(null);
  const [picking, setPicking] = useState(false);

  const pick = useCallback(async () => {
    if (picking) return;
    setPicking(true);
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
      const file = pickedFile(asset);
      if (!file) {
        showToast(READ_ERROR, 'error');
        return;
      }
      setDraft({ file, previewUri: asset.uri });
    } catch {
      showToast(PICK_ERROR, 'error');
    } finally {
      setPicking(false);
    }
  }, [picking, showToast]);

  return { draft, picking, pick, clear: () => setDraft(null) };
}
