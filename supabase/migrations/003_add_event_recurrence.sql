-- ============================================================================
-- Shift Shepherd - event recurrence fields
--
-- Adds future-friendly recurrence metadata to base event rows. The app expands
-- occurrences client-side for the mock scaffold; Supabase will store the same
-- base series fields when events are wired later.
-- ============================================================================

begin;

alter table public.events
  add column is_recurring boolean not null default false,
  add column recurrence_rule text,
  add column recurrence_label text,
  add column recurrence_end_date date;

alter table public.events
  add constraint events_recurring_requires_rule_and_label
  check (
    not is_recurring
    or (
      recurrence_rule is not null
      and btrim(recurrence_rule) <> ''
      and recurrence_label is not null
      and btrim(recurrence_label) <> ''
    )
  );

alter table public.events
  add constraint events_non_recurring_has_no_recurrence_fields
  check (
    is_recurring
    or (
      recurrence_rule is null
      and recurrence_label is null
      and recurrence_end_date is null
    )
  );

alter table public.events
  add constraint events_recurrence_end_not_before_start
  check (
    recurrence_end_date is null
    or recurrence_end_date >= start_time::date
  );

commit;
