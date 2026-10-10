/**
 * Promise-based confirmation for consequential actions. Every way out resolves:
 * explicit buttons, platform back/Escape, replacement, and provider unmount.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { FocusRef, ModalSurface } from './ModalSurface';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Existing caller default remains true; routine actions can opt out. */
  destructive?: boolean;
  returnFocusRef?: FocusRef;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const opener = useRef<FocusRef | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const pending = resolver.current;
      resolver.current = null;
      pending?.(false);
    };
  }, []);

  const confirm = useCallback<ConfirmFn>((opts) => {
    if (!mounted.current) return Promise.resolve(false);
    resolver.current?.(false);
    opener.current = opts.returnFocusRef;
    setOptions(opts);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const close = useCallback((result: boolean) => {
    const pending = resolver.current;
    resolver.current = null;
    setOptions(null);
    pending?.(result);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      <View
        style={styles.content}
        accessibilityElementsHidden={options !== null}
        importantForAccessibility={options ? 'no-hide-descendants' : 'auto'}
        aria-hidden={options !== null}
      >
        {children}
      </View>
      <ModalSurface
        visible={options !== null}
        title={options?.title ?? ''}
        presentation="dialog"
        onClose={() => close(false)}
        returnFocusRef={opener.current}
        footer={options ? (
          <>
            <Button
              title={options.confirmLabel ?? 'Delete'}
              variant={options.destructive === false ? 'primary' : 'destructive'}
              onPress={() => close(true)}
            />
            <Button title={options.cancelLabel ?? 'Cancel'} variant="secondary" onPress={() => close(false)} />
          </>
        ) : null}
      >
        {options ? <AppText tone="secondary">{options.message}</AppText> : null}
      </ModalSurface>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

const styles = StyleSheet.create({ content: { flex: 1 } });
