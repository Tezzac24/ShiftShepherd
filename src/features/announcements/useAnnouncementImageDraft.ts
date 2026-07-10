/**
 * Pending image changes for the announcement form (live Supabase mode only).
 *
 * Nothing uploads while the user is still editing: picking an image (or
 * choosing to remove the current one) is held as a draft, previewed locally
 * from the picked data, and only applied by the form's save flow after the
 * announcement row itself has been saved. Cancel simply discards the draft.
 * Permission is requested only when the user taps, images only, no cropping
 * or camera. Demo mode never shows these controls, so demo behaviour is
 * untouched.
 */
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { useToast } from '../../components/Toast';
import {
  PickedAnnouncementImage,
  validateAnnouncementImage,
} from '../../lib/supabase/services/announcementImages';

const PERMISSION_ERROR =
  'To add an image, please allow photo access for Shift Shepherd in your device settings.';
const PICK_ERROR = 'We couldn’t open your photos. Please try again.';
const READ_ERROR = 'We couldn’t read that image. Please try a different one.';

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
function toPickedFile(asset: ImagePicker.ImagePickerAsset): PickedAnnouncementImage | null {
  const dataUrl = asset.uri ? parseDataUrl(asset.uri) : null;
  const base64 = asset.base64 ?? dataUrl?.base64 ?? null;
  if (!base64) return null;
  const extension = (asset.fileName ?? asset.uri ?? '').split('.').pop()?.toLowerCase() ?? '';
  const mimeType = asset.mimeType ?? dataUrl?.mimeType ?? EXTENSION_MIME_TYPES[extension] ?? '';
  return { base64, mimeType, fileSize: asset.fileSize ?? null };
}

/** What the user wants to happen to the announcement's image on save. */
export type AnnouncementImageDraft =
  | { kind: 'unchanged' }
  | { kind: 'replace'; file: PickedAnnouncementImage; previewUri: string }
  | { kind: 'remove' };

export function useAnnouncementImageDraft() {
  const showToast = useToast();
  const [draft, setDraft] = useState<AnnouncementImageDraft>({ kind: 'unchanged' });
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
      // Type/size problems (JPEG/PNG/WebP, under 5 MB) surface now, with the
      // service's friendly copy — not later at save time.
      const validationError = validateAnnouncementImage(file);
      if (validationError) {
        showToast(validationError, 'error');
        return;
      }
      setDraft({
        kind: 'replace',
        file,
        previewUri: `data:${file.mimeType};base64,${file.base64}`,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : PICK_ERROR, 'error');
    } finally {
      setPicking(false);
    }
  }, [picking, showToast]);

  /** The saved announcement should end up with no image. */
  const markRemoved = useCallback(() => setDraft({ kind: 'remove' }), []);

  return { draft, picking, pickImage, markRemoved };
}
