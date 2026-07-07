/**
 * Confirmation dialog used before every destructive action.
 * A custom modal (not Alert.alert) so it works on iOS, Android, AND web.
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../constants/theme';
import { AppText } from './AppText';
import { Button } from './Button';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  /** Destructive styling (red confirm button). Default true. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    resolver.current(result);
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        visible={options !== null}
        transparent
        animationType="fade"
        onRequestClose={() => close(false)}
      >
        {options ? (
          <View style={styles.overlay}>
            <View style={styles.dialog}>
              <AppText variant="subheading" style={styles.center}>
                {options.title}
              </AppText>
              <AppText tone="secondary" style={styles.center}>
                {options.message}
              </AppText>
              <View style={styles.buttons}>
                <Button title="Cancel" variant="secondary" onPress={() => close(false)} />
                <Button
                  title={options.confirmLabel ?? 'Delete'}
                  variant={options.destructive === false ? 'primary' : 'destructive'}
                  onPress={() => close(true)}
                />
              </View>
            </View>
          </View>
        ) : (
          <View />
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    width: '100%',
    maxWidth: 420,
  },
  center: { textAlign: 'center' },
  buttons: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
