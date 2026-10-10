import React, { useState } from 'react';

import { AnimatedDisclosure } from '../../components/AnimatedDisclosure';

/** Optional fields reveal inline and keep their draft when collapsed. */
export function AnnouncementOptions({ summary, disabled, children }: {
  summary: string; disabled: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <AnimatedDisclosure title="More options" summary={summary} disabled={disabled}
    open={open} onToggle={() => setOpen((value) => !value)} panelTestID="announcement-options-panel">
    {children}
  </AnimatedDisclosure>;
}
