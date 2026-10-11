-- SAE / 10 profile backend foundation.
-- This file is a review draft. Do not run it until the owner UUID has been
-- verified in Supabase Authentication > Users and this migration is approved.

-- Run as one transaction: any error rolls back all objects created below.
begin;

-- This is a one-time migration. Abort before DDL if any expected object already
-- exists, including leftovers from an earlier/manual attempt.
do $migration$
begin
  if to_regnamespace('bio_private') is not null
    or to_regclass('public.profile_drafts') is not null
    or to_regclass('public.published_profiles') is not null
    or to_regprocedure('bio_private.is_authorized_profile_owner()') is not null
    or to_regprocedure('public.is_profile_owner()') is not null
    or to_regprocedure('bio_private.protect_draft_owner_id()') is not null
    or to_regprocedure('public.publish_profile(timestamptz)') is not null
    or exists (
      select 1
      from storage.buckets
      where id = 'bio-media'
    )
    or exists (
      select 1
      from pg_policies
      where (schemaname = 'public'
          and tablename in ('profile_drafts', 'published_profiles'))
        or (schemaname = 'storage'
          and tablename = 'objects'
          and policyname in (
            'Public reads profile media',
            'Profile owner uploads media',
            'Profile owner replaces media',
            'Profile owner deletes media'
          ))
    )
    or exists (
      select 1
      from pg_trigger
      where tgname = 'profile_drafts_protect_owner'
        and not tgisinternal
    )
  then
    raise exception 'Profile backend objects already exist. Inspect the database and Storage policies before applying or adapting this one-time migration.';
  end if;
end;
$migration$;

create schema bio_private;

revoke all on schema bio_private from public, anon, authenticated;
grant usage on schema bio_private to anon, authenticated;

create table bio_private.authorized_profile_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users (id) on delete restrict
);

alter table bio_private.authorized_profile_owner enable row level security;
revoke all on bio_private.authorized_profile_owner from public, anon, authenticated;

create function bio_private.is_authorized_profile_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from bio_private.authorized_profile_owner as owner_record
      where owner_record.user_id = (select auth.uid())
    );
$$;

revoke all on function bio_private.is_authorized_profile_owner() from public;
grant execute on function bio_private.is_authorized_profile_owner() to anon, authenticated;

create function public.is_profile_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select bio_private.is_authorized_profile_owner();
$$;

revoke all on function public.is_profile_owner() from public, anon;
grant execute on function public.is_profile_owner() to authenticated;

create table public.profile_drafts (
  profile_id text primary key check (profile_id = 'sae'),
  owner_id uuid not null references auth.users (id) on delete restrict,
  content jsonb not null check (
    jsonb_typeof(content) = 'object'
    and content ?& array['schemaVersion', 'profile', 'theme', 'sections', 'media']
    and jsonb_typeof(content -> 'profile') = 'object'
    and jsonb_typeof(content -> 'theme') = 'object'
    and jsonb_typeof(content -> 'sections') = 'array'
    and jsonb_typeof(content -> 'media') = 'object'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function bio_private.protect_draft_owner_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Draft ownership cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profile_drafts_protect_owner
before update on public.profile_drafts
for each row execute function bio_private.protect_draft_owner_id();

alter table public.profile_drafts enable row level security;
revoke all on public.profile_drafts from public, anon, authenticated;
grant select, insert, update on public.profile_drafts to authenticated;

create policy "Profile owner reads draft"
on public.profile_drafts
for select
to authenticated
using (
  profile_id = 'sae'
  and owner_id = (select auth.uid())
  and (select bio_private.is_authorized_profile_owner())
);

create policy "Profile owner creates draft"
on public.profile_drafts
for insert
to authenticated
with check (
  profile_id = 'sae'
  and owner_id = (select auth.uid())
  and (select bio_private.is_authorized_profile_owner())
);

create policy "Profile owner edits draft"
on public.profile_drafts
for update
to authenticated
using (
  profile_id = 'sae'
  and owner_id = (select auth.uid())
  and (select bio_private.is_authorized_profile_owner())
)
with check (
  profile_id = 'sae'
  and owner_id = (select auth.uid())
  and (select bio_private.is_authorized_profile_owner())
);

create table public.published_profiles (
  profile_id text primary key check (profile_id = 'sae'),
  content jsonb not null check (
    jsonb_typeof(content) = 'object'
    and content ?& array['schemaVersion', 'profile', 'theme', 'sections', 'media']
    and jsonb_typeof(content -> 'profile') = 'object'
    and jsonb_typeof(content -> 'theme') = 'object'
    and jsonb_typeof(content -> 'sections') = 'array'
    and jsonb_typeof(content -> 'media') = 'object'
  ),
  published_at timestamptz not null default now()
);

alter table public.published_profiles enable row level security;
revoke all on public.published_profiles from public, anon, authenticated;
grant select on public.published_profiles to anon, authenticated;

create policy "Anyone reads published profile"
on public.published_profiles
for select
to anon, authenticated
using (profile_id = 'sae');

create function public.publish_profile(expected_updated_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_content jsonb;
  draft_updated_at timestamptz;
  publication_time timestamptz;
begin
  if auth.uid() is null or not bio_private.is_authorized_profile_owner() then
    raise exception 'Only the authorized profile owner may publish'
      using errcode = '42501';
  end if;

  select jsonb_set(
    draft.content,
    '{sections}',
    coalesce(
      (
        select jsonb_agg(section.value order by section.ordinality)
        from jsonb_array_elements(draft.content -> 'sections')
          with ordinality as section(value, ordinality)
        where section.value -> 'visible' = 'true'::jsonb
      ),
      '[]'::jsonb
    ),
    true
  ),
  draft.updated_at
  into draft_content, draft_updated_at
  from public.profile_drafts as draft
  where draft.profile_id = 'sae'
    and draft.owner_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Save a profile draft before publishing';
  end if;

  if draft_updated_at is distinct from expected_updated_at then
    raise exception 'The cloud draft changed since it was loaded; reload it before publishing';
  end if;

  insert into public.published_profiles (profile_id, content, published_at)
  values ('sae', draft_content, now())
  on conflict (profile_id) do update
    set content = excluded.content,
        published_at = excluded.published_at
  returning published_at into publication_time;

  return publication_time;
end;
$$;

revoke all on function public.publish_profile(timestamptz) from public, anon;
grant execute on function public.publish_profile(timestamptz) to authenticated;

-- Verify this value against the existing owner's Auth user UUID before running.
-- This singleton row and the lack of client write grants prevent browser users
-- (including the owner) from changing who is authorized.
do $$
declare
  owner_user_id uuid := '59cb4f9e-d062-4cc4-b407-c4d31c82c477';
begin
  if owner_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace the owner UUID placeholder before running this migration';
  end if;

  if not exists (select 1 from auth.users where id = owner_user_id) then
    raise exception 'The selected owner UUID does not exist in Supabase Auth';
  end if;

  insert into bio_private.authorized_profile_owner (singleton, user_id)
  values (true, owner_user_id);
end;
$$;

-- Create a dedicated public image bucket; existing buckets are never changed.
do $$
begin
  insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
  )
  values (
    'bio-media',
    'bio-media',
    true,
    8388608,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
  );
end;
$$;

create policy "Public reads profile media"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'bio-media'
  and (storage.foldername(name))[1] = 'sae'
);

create policy "Profile owner uploads media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'bio-media'
  and (storage.foldername(name))[1] = 'sae'
  and (select bio_private.is_authorized_profile_owner())
);

create policy "Profile owner replaces media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'bio-media'
  and (storage.foldername(name))[1] = 'sae'
  and (select bio_private.is_authorized_profile_owner())
)
with check (
  bucket_id = 'bio-media'
  and (storage.foldername(name))[1] = 'sae'
  and (select bio_private.is_authorized_profile_owner())
);

create policy "Profile owner deletes media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'bio-media'
  and (storage.foldername(name))[1] = 'sae'
  and (select bio_private.is_authorized_profile_owner())
);

commit;
