-- ============================================================================
-- Shift Shepherd — rota entry cancellation
--
-- Cancelled dates (e.g. a called-off choir rehearsal) are MARKED cancelled
-- rather than deleted, so members still see that the date is not going ahead
-- and history stays understandable. They naturally fall out of "upcoming"
-- lists once the date passes; nothing auto-deletes them.
--
-- Mirrors src/types RotaEntry.status / cancelled_* fields and the
-- canCancelRotaEntry() helper in src/lib/permissions/index.ts.
--
-- No RLS changes needed: cancelling is an UPDATE on rota_entries, which the
-- existing "leaders manage rota entries" policy already restricts to the
-- team's leader or a church admin. Members' availability responses are
-- unaffected.
--
-- Do not apply to a live project as part of this change; this is planning.
-- ============================================================================

create type public.rota_entry_status as enum ('active', 'cancelled');

alter table public.rota_entries
  add column status public.rota_entry_status not null default 'active',
  add column cancelled_at timestamptz,
  -- set null (not restrict): a cancellation outlives the leader who made it
  add column cancelled_by uuid references public.profiles (id) on delete set null,
  add column cancellation_reason text,
  -- active entries carry no cancellation details; cancelled entries must at
  -- least record when (cancelled_by may become null if the profile is removed)
  add constraint rota_entries_cancellation_consistency check (
    (status = 'active'
      and cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null)
    or (status = 'cancelled' and cancelled_at is not null)
  );

comment on column public.rota_entries.status is
  'Cancelled entries stay visible with a "Cancelled" badge instead of being deleted.';
