-- ============================================================================
-- Shift Shepherd - announcement image storage (Storage slice 2)
--
-- Second Supabase Storage slice: a private `announcement-images` bucket and
-- object policies tied to the existing announcement RLS rules. One optional
-- image per announcement; the path is stored in the existing
-- `announcements.image_url` column (present since 001), so there is no table
-- change and no new RPC - the existing announcements UPDATE policy + grants
-- (002/006) already let exactly the authorised editors repoint it.
--
-- Object path convention (enforced by the policies):
--   announcements/<announcementId>/<fileName>
--     e.g. announcements/70000000-.../image-1760....jpg
--
-- In live mode `announcements.image_url` holds this storage *path*, not a
-- URL - the private bucket means display always goes through short-lived
-- signed URLs generated client-side.
--
-- Access rules (mirroring the announcements policies in 002):
--   read   - anyone who can see the announcement can see its image;
--   write  - anyone who may manage the announcement (church admins /
--            announcement managers for church-wide, the team's leader or an
--            admin for team announcements) may add/replace/delete its image;
--   delete - additionally, the original uploader may delete their own
--            objects (`owner_id`), so best-effort cleanup still works right
--            after the announcement row itself has been deleted;
--   anon   - nothing (no policy).
--
-- Deliberately out of scope: chat attachments, multi-image galleries,
-- document uploads, team avatars, anon access, public buckets, backfill.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Bucket: private, images only, 5 MB cap (the app validates the same limits
-- client-side with friendly copy; the bucket is the enforcement backstop)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-images',
  'announcement-images',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- Object policies (RLS is already enabled on storage.objects; anon gets no
-- policy, so anonymous users can read/write nothing).
--
-- The announcement id is taken from the object path and matched as text
-- (`a.id::text = ...`), so a malformed path simply matches nothing instead of
-- failing a uuid cast. Visibility/management re-state the announcements
-- policies from 002 explicitly via the same security-definer helpers.
-- ----------------------------------------------------------------------------

create policy "members can view announcement images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'announcement-images'
    and (storage.foldername(name))[1] = 'announcements'
    and exists (
      select 1 from public.announcements a
      where a.id::text = (storage.foldername(name))[2]
        and public.is_org_member(a.organisation_id)
        and (a.team_id is null or public.can_access_team(a.team_id))
    )
  );

create policy "announcement editors upload announcement images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'announcement-images'
    and (storage.foldername(name))[1] = 'announcements'
    and exists (
      select 1 from public.announcements a
      where a.id::text = (storage.foldername(name))[2]
        and (
          (a.team_id is null
            and (public.is_church_admin(a.organisation_id)
              or public.has_org_role(a.organisation_id, 'announcement_manager')))
          or (a.team_id is not null and public.can_manage_team(a.team_id))
        )
    )
  );

create policy "announcement editors update announcement image objects"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'announcement-images'
    and (storage.foldername(name))[1] = 'announcements'
    and exists (
      select 1 from public.announcements a
      where a.id::text = (storage.foldername(name))[2]
        and (
          (a.team_id is null
            and (public.is_church_admin(a.organisation_id)
              or public.has_org_role(a.organisation_id, 'announcement_manager')))
          or (a.team_id is not null and public.can_manage_team(a.team_id))
        )
    )
  )
  with check (
    bucket_id = 'announcement-images'
    and (storage.foldername(name))[1] = 'announcements'
    and exists (
      select 1 from public.announcements a
      where a.id::text = (storage.foldername(name))[2]
        and (
          (a.team_id is null
            and (public.is_church_admin(a.organisation_id)
              or public.has_org_role(a.organisation_id, 'announcement_manager')))
          or (a.team_id is not null and public.can_manage_team(a.team_id))
        )
    )
  );

-- Delete: announcement editors, plus the uploader themselves - the app
-- best-effort deletes the image object right after deleting an announcement,
-- at which point the row (and with it the editor check) is already gone.
create policy "announcement editors delete announcement image objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'announcement-images'
    and (storage.foldername(name))[1] = 'announcements'
    and (
      owner_id = (select auth.uid()::text)
      or exists (
        select 1 from public.announcements a
        where a.id::text = (storage.foldername(name))[2]
          and (
            (a.team_id is null
              and (public.is_church_admin(a.organisation_id)
                or public.has_org_role(a.organisation_id, 'announcement_manager')))
            or (a.team_id is not null and public.can_manage_team(a.team_id))
          )
      )
    )
  );

commit;
