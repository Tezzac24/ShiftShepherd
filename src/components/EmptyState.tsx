import { Ionicons } from '@expo/vector-icons';
import React from 'react';

import { StateAction, StatePanel } from './StatePanel';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  compact?: boolean;
  action?: StateAction;
}

/** Existing API, with a compact summary and an optional practical next step. */
export function EmptyState(props: EmptyStateProps) {
  return <StatePanel kind="empty" {...props} />;
}
