import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';

import { Button } from './Button';
import { useConfirm } from './ConfirmDialog';
import { FocusRef } from './ModalSurface';

/** Compare editable values, excluding identities used only by draft rows. */
export function draftFingerprint(value: unknown): string {
  return JSON.stringify(value, (key, item) => key === 'localId' ? undefined : item);
}

interface DiscardOptions {
  /** null means the form has not hydrated yet. Later refreshes keep its baseline. */
  value?: unknown;
  hasChanges?: boolean;
  extraChanges?: boolean;
  saved?: boolean;
  blocked?: boolean;
  uncertain?: boolean;
  message?: string;
  onDiscard: () => void;
}

/** Shared protection for explicit Cancel and visible Back actions on drafts. */
export function useDiscardChanges({ value = null, hasChanges, extraChanges = false, saved = false,
  blocked = false, uncertain = false, message = 'Your changes will not be saved.', onDiscard }: DiscardOptions) {
  const confirm = useConfirm();
  const fingerprint = value === null ? null : draftFingerprint(value);
  const baseline = useRef(fingerprint);
  const active = useRef(true);
  const pending = useRef(false);
  const exitRef = useRef<View>(null);
  const backRef = useRef<View>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    if (baseline.current === null && fingerprint !== null) baseline.current = fingerprint;
  }, [fingerprint]);
  const requestExit = useCallback((returnFocusRef: FocusRef = exitRef) => {
    if (!active.current || blocked || pending.current) return;
    const changedValue = baseline.current !== null && fingerprint !== null && baseline.current !== fingerprint;
    const dirty = !saved && ((hasChanges ?? changedValue) || extraChanges || uncertain);
    if (!dirty) { onDiscard(); return; }
    pending.current = true;
    void (async () => {
      try {
        const discard = await confirm({
          title: 'Discard changes?',
          message: uncertain ? 'Some changes may already have been saved. Leaving will discard the draft kept on this screen.' : message,
          confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', returnFocusRef,
        });
        if (discard && active.current) onDiscard();
      } finally { pending.current = false; }
    })();
  }, [blocked, saved, hasChanges, extraChanges, fingerprint, onDiscard, confirm, uncertain, message]);
  const headerLeft = () => <Button ref={backRef} title="Back" variant="ghost" icon="chevron-back"
    disabled={blocked} onPress={() => requestExit(backRef)} />;
  return { requestExit, exitRef, headerLeft };
}
