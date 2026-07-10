/**
 * One pending chat image, held locally until Send. Live mode only: the chat
 * screen hides this action in demo mode, so no local/demo Storage call exists.
 */
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { useToast } from '../../components/Toast';
import {
  PickedChatImage,
  validateChatImage,
} from '../../lib/supabase/services/chatAttachments';

const PERMISSION_ERROR =
  'To add an image, please allow photo access for Shift Shepherd in your device settings.';
const PICK_ERROR = "We couldn't open your photos. Please try again.";
const READ_ERROR = "We couldn't read that image. Please try a different one.";

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

function toPickedFile(asset: ImagePicker.ImagePickerAsset): PickedChatImage | null {
  const dataUrl = asset.uri ? parseDataUrl(asset.uri) : null;
  const base64 = asset.base64 ?? dataUrl?.base64 ?? null;
  if (!base64) return null;
  const extension = (asset.fileName ?? asset.uri ?? '').split('.').pop()?.toLowerCase() ?? '';
  const mimeType = asset.mimeType ?? dataUrl?.mimeType ?? EXTENSION_MIME_TYPES[extension] ?? '';
  return {
    base64,
    mimeType,
    fileSize: asset.fileSize ?? null,
    fileName: asset.fileName ?? null,
  };
}

export interface PendingChatImage {
  file: PickedChatImage;
  previewUri: string;
}

export function useChatImageDraft() {
  const showToast = useToast();
  const [pendingImage, setPendingImage] = useState<PendingChatImage | null>(null);
  const [picking, setPicking] = useState(false);

  const pickImage = useCallback(async () => {
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
      const file = toPickedFile(asset);
      if (!file) {
        showToast(READ_ERROR, 'error');
        return;
      }
      const validationError = validateChatImage(file);
      if (validationError) {
        showToast(validationError, 'error');
        return;
      }
      setPendingImage({
        file,
        previewUri: `data:${file.mimeType};base64,${file.base64}`,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : PICK_ERROR, 'error');
    } finally {
      setPicking(false);
    }
  }, [picking, showToast]);

  const removeImage = useCallback(() => setPendingImage(null), []);

  return { pendingImage, picking, pickImage, removeImage };
}
