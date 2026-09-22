-- One-way connections + ephemeral dreams.
-- Run in the same Dream About Me Supabase project after dream-about-me.sql.
-- Then run supabase/dream-lifecycle.sql (reveal, streak, one dream per night).

alter table public.profiles
  add column if not exists timezone text;

create unique index if not exists profiles_dream_code_unique
  on public.profiles (dream_code)
  where dream_code is not null;

create or replace function public.lookup_invite(code text)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name
  from public.profiles p
  where p.dream_code = lower(trim(code))
  limit 1;
$$;

revoke all on function public.lookup_invite(text) from public;
grant execute on function public.lookup_invite(text) to authenticated;
grant execute on function public.lookup_invite(text) to anon;

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (from_id, to_id),
  check (from_id <> to_id)
);

create index if not exists connections_from_id_idx on public.connections (from_id);
create index if not exists connections_to_id_idx on public.connections (to_id);

alter table public.connections enable row level security;

drop policy if exists "connections_select_own" on public.connections;
create policy "connections_select_own"
  on public.connections
  for select
  to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "connections_insert_to_self" on public.connections;
create policy "connections_insert_to_self"
  on public.connections
  for insert
  to authenticated
  with check (to_id = auth.uid() and from_id <> auth.uid());

drop policy if exists "connections_update_to_self" on public.connections;
create policy "connections_update_to_self"
  on public.connections
  for update
  to authenticated
  using (to_id = auth.uid())
  with check (to_id = auth.uid());

grant select, insert, update on public.connections to authenticated;

drop policy if exists "profiles_select_connected" on public.profiles;
create policy "profiles_select_connected"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.connections c
      where c.from_id = profiles.id
        and c.to_id = auth.uid()
    )
    or exists (
      select 1
      from public.connections c
      where c.from_id = auth.uid()
        and c.to_id = profiles.id
        and c.status = 'accepted'
    )
  );

create table if not exists public.dreams (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('image', 'quote', 'video')),
  quote text,
  video_url text,
  image_path text,
  thumb_path text,
  night_date date not null,
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  expires_at timestamptz not null
);

create index if not exists dreams_recipient_night_idx
  on public.dreams (recipient_id, night_date);

create index if not exists dreams_expires_at_idx
  on public.dreams (expires_at);

alter table public.dreams enable row level security;

drop policy if exists "dreams_select_own" on public.dreams;
create policy "dreams_select_own"
  on public.dreams
  for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- Inserts, updates, and deletes go through send_dream / reveal_dream
-- (supabase/dream-lifecycle.sql). Direct writes stay closed if this file is re-run.
drop policy if exists "dreams_insert_sender" on public.dreams;
drop policy if exists "dreams_update_own" on public.dreams;
drop policy if exists "dreams_delete_sender" on public.dreams;

revoke insert, update, delete on public.dreams from authenticated;
grant select on public.dreams to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dreams',
  'dreams',
  false,
  2097152,
  array['image/jpeg', 'image/webp', 'image/png']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dreams_storage_insert_own" on storage.objects;
create policy "dreams_storage_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'dreams'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "dreams_storage_select_related" on storage.objects;
create policy "dreams_storage_select_related"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'dreams'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1
        from public.dreams d
        where d.recipient_id = auth.uid()
          and (d.image_path = name or d.thumb_path = name)
          and d.expires_at > now()
      )
    )
  );

drop policy if exists "dreams_storage_delete_own" on storage.objects;
create policy "dreams_storage_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'dreams'
    and split_part(name, '/', 1) = auth.uid()::text
  );
