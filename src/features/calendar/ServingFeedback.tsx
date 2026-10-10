import React from 'react';

import { StatePanel } from '../../components/StatePanel';
import { useAppData } from '../../lib/appData/AppDataContext';

/** Independent dependencies keep an unavailable directory from looking like no duties. */
export function ServingFeedback({ hasContent, compact = false }: { hasContent: boolean; compact?: boolean }) {
  const data = useAppData();
  return <>
    {data.teamsError ? <StatePanel compact={compact} kind="error" title="Couldn’t load your teams"
      message={data.teamsError} action={{ label: 'Retry teams', onPress: () => void data.refreshTeams() }} /> : null}
    {data.rotasError ? <StatePanel compact={compact} kind="error" title="Couldn’t load your serving dates"
      message={data.rotasError} action={{ label: 'Retry serving', onPress: () => void data.refreshRotas() }} /> : null}
    {!hasContent && (data.teamsLoading || data.rotasLoading) ? (
      <StatePanel compact={compact} kind="loading" title="Loading your serving dates…" />
    ) : null}
  </>;
}
