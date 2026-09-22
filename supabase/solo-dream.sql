-- The dream you set for yourself stays. It does not expire, and it does not
-- take the one nightly slot. A dream someone else sends still uses that slot,
-- is what you see that night, and then follows the usual lifecycle. After it
-- is gone, yours is still there.
--
-- Run once in the Dream About Me Supabase SQL editor, after dream-lifecycle.sql.
-- Safe to re-run. Moves a dream you sent yourself into solo_dreams, then
-- deletes those rows so the night is free for someone else. Does not delete
-- storage files. Does not delete dreams sent between two people.
--
-- Also replaces send_dream and reveal_dream so this file is enough on a
-- database that already ran an older dream-lifecycle.sql. Those two functions
-- match supabase/dream-lifecycle.sql.

alter table public.profiles
  add column if not exists last_ritual_night date;

create table if not exists public.solo_dreams (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('image', 'quote', 'video')),
  quote text,
  video_url text,
  image_path text,
  thumb_path text,
  updated_at timestamptz not null default now()
);

alter table public.solo_dreams enable row level security;

drop policy if exists "solo_dreams_select_own" on public.solo_dreams;
create policy "solo_dreams_select_own"
  on public.solo_dreams
  for select
  to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on table public.solo_dreams from authenticated, anon;
grant select on table public.solo_dreams to authenticated;

create or replace function public.protect_solo_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('service_role', 'postgres', 'supabase_admin')
       or current_setting('dream.allow_solo', true) = '1' then
      return old;
    end if;
    raise exception 'solo dream delete is not allowed' using errcode = '42501';
  end if;

  if current_setting('dream.allow_solo', true) = '1' then
    return new;
  end if;
  raise exception 'solo dream write is not allowed' using errcode = '42501';
end;
$$;

drop trigger if exists solo_dreams_protect_write on public.solo_dreams;
create trigger solo_dreams_protect_write
before insert or update or delete on public.solo_dreams
for each row execute function public.protect_solo_write();

do $$
begin
  perform set_config('dream.allow_solo', '1', true);
  perform set_config('dream.allow_send', '1', true);

  insert into public.solo_dreams (
    user_id, kind, quote, video_url, image_path, thumb_path, updated_at
  )
  select distinct on (recipient_id)
    recipient_id,
    kind,
    quote,
    video_url,
    image_path,
    thumb_path,
    created_at
  from public.dreams
  where sender_id = recipient_id
  order by recipient_id, created_at desc
  on conflict (user_id) do nothing;

  delete from public.dreams where sender_id = recipient_id;
end $$;

create or replace function public.set_solo_dream(
  p_kind text,
  p_quote text default null,
  p_video_url text default null,
  p_image_path text default null,
  p_thumb_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_quote text;
  v_video text;
  v_image text;
  v_thumb text;
  v_old_image text;
  v_old_thumb text;
  v_replaced jsonb := '[]'::jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_kind not in ('image', 'quote', 'video') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;

  v_quote := case when p_kind = 'quote' then nullif(btrim(p_quote), '') else null end;
  v_video := case when p_kind = 'video' then nullif(btrim(p_video_url), '') else null end;
  v_image := case when p_kind = 'image' then nullif(btrim(p_image_path), '') else null end;
  v_thumb := case when p_kind = 'image' then nullif(btrim(p_thumb_path), '') else null end;

  if p_kind = 'quote' and v_quote is null then
    return jsonb_build_object('ok', false, 'error', 'bad_content');
  end if;
  if p_kind = 'video' and (v_video is null or v_video !~* '^https?://') then
    return jsonb_build_object('ok', false, 'error', 'bad_content');
  end if;
  if p_kind = 'image' and (
    v_image is null
    or split_part(v_image, '/', 1) <> v_user::text
    or v_image like '%..%'
    or (
      v_thumb is not null
      and (
        split_part(v_thumb, '/', 1) <> v_user::text
        or v_thumb like '%..%'
      )
    )
  ) then
    return jsonb_build_object('ok', false, 'error', 'bad_content');
  end if;

  select image_path, thumb_path
    into v_old_image, v_old_thumb
  from public.solo_dreams
  where user_id = v_user
  for update;

  perform set_config('dream.allow_solo', '1', true);
  insert into public.solo_dreams (
    user_id, kind, quote, video_url, image_path, thumb_path, updated_at
  ) values (
    v_user, p_kind, v_quote, v_video, v_image, v_thumb, now()
  )
  on conflict (user_id) do update
  set
    kind = excluded.kind,
    quote = excluded.quote,
    video_url = excluded.video_url,
    image_path = excluded.image_path,
    thumb_path = excluded.thumb_path,
    updated_at = now();

  if v_old_image is not null and v_old_image is distinct from v_image then
    v_replaced := v_replaced || jsonb_build_array(v_old_image);
  end if;
  if v_old_thumb is not null and v_old_thumb is distinct from v_thumb then
    v_replaced := v_replaced || jsonb_build_array(v_old_thumb);
  end if;

  return jsonb_build_object('ok', true, 'replaced_paths', v_replaced);
end;
$$;

revoke all on function public.set_solo_dream(text, text, text, text, text) from public;
grant execute on function public.set_solo_dream(text, text, text, text, text) to authenticated;

create or replace function public.reveal_solo_dream()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_night date;
  v_streak integer;
  v_ritual date;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if not exists (select 1 from public.solo_dreams where user_id = v_user) then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;

  v_night := public.dream_night(public.dream_zone(v_user), now());
  if v_night is null then
    return jsonb_build_object('ok', false, 'error', 'no_timezone');
  end if;

  select streak, last_ritual_night
    into v_streak, v_ritual
  from public.profiles
  where id = v_user
  for update;

  if v_streak is null then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;
  if v_ritual is not distinct from v_night then
    return jsonb_build_object('ok', true, 'opened', false, 'streak', v_streak);
  end if;

  perform set_config('dream.allow_streak', '1', true);
  update public.profiles
  set
    streak = streak + 1,
    last_ritual_night = v_night
  where id = v_user
  returning streak into v_streak;

  return jsonb_build_object('ok', true, 'opened', true, 'streak', v_streak);
end;
$$;

revoke all on function public.reveal_solo_dream() from public;
grant execute on function public.reveal_solo_dream() to authenticated;

create or replace function public.send_dream(
  p_recipient uuid,
  p_kind text,
  p_quote text default null,
  p_video_url text default null,
  p_image_path text default null,
  p_thumb_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_tz text;
  v_night date;
  v_existing public.dreams%rowtype;
  v_id uuid;
  v_quote text;
  v_video text;
  v_image text;
  v_thumb text;
begin
  if v_sender is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_recipient is null or p_recipient = v_sender then
    return jsonb_build_object('ok', false, 'error', 'bad_recipient');
  end if;
  if p_kind not in ('image', 'quote', 'video') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;
  if p_recipient <> v_sender and not exists (
    select 1
    from public.connections c
    where c.from_id = v_sender
      and c.to_id = p_recipient
      and c.status = 'accepted'
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_quote := case when p_kind = 'quote' then nullif(btrim(p_quote), '') else null end;
  v_video := case when p_kind = 'video' then nullif(btrim(p_video_url), '') else null end;
  v_image := case when p_kind = 'image' then nullif(btrim(p_image_path), '') else null end;
  v_thumb := case when p_kind = 'image' then nullif(btrim(p_thumb_path), '') else null end;

  if p_kind = 'quote' and v_quote is null then
    return jsonb_build_object('ok', false, 'error', 'bad_content');
  end if;
  if p_kind = 'video' and (v_video is null or v_video !~* '^https?://') then
    return jsonb_build_object('ok', false, 'error', 'bad_content');
  end if;
  if p_kind = 'image' and (
    v_image is null
    or split_part(v_image, '/', 1) <> v_sender::text
    or v_image like '%..%'
    or (
      v_thumb is not null
      and (
        split_part(v_thumb, '/', 1) <> v_sender::text
        or v_thumb like '%..%'
      )
    )
  ) then
    return jsonb_build_object('ok', false, 'error', 'bad_content');
  end if;

  v_tz := public.dream_zone(p_recipient);
  v_night := public.dream_night(v_tz, now());
  if v_night is null then
    return jsonb_build_object('ok', false, 'error', 'no_timezone');
  end if;

  perform pg_advisory_xact_lock(
    hashtext('dream:' || p_recipient::text),
    hashtext(v_night::text)
  );
  perform set_config('dream.allow_send', '1', true);

  for attempt in 1..2 loop
    select *
      into v_existing
    from public.dreams
    where recipient_id = p_recipient
      and night_date = v_night
    for update;

    if v_existing.id is not null then
      return jsonb_build_object('ok', false, 'error', 'night_used');
    end if;

    begin
      v_id := gen_random_uuid();
      insert into public.dreams (
        id, sender_id, recipient_id, kind, quote, video_url,
        image_path, thumb_path, night_date, expires_at
      ) values (
        v_id, v_sender, p_recipient, p_kind, v_quote, v_video,
        v_image, v_thumb, v_night, now() + interval '2 days'
      );
      exit;
    exception
      when unique_violation then
        if attempt = 2 then
          return jsonb_build_object('ok', false, 'error', 'night_used');
        end if;
    end;
  end loop;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'night_used');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'night_date', v_night,
    'replaced_paths', '[]'::jsonb
  );
end;
$$;

revoke all on function public.send_dream(uuid, text, text, text, text, text) from public;
grant execute on function public.send_dream(uuid, text, text, text, text, text) to authenticated;

create or replace function public.reveal_dream(p_dream_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_dream public.dreams%rowtype;
  v_streak integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select *
    into v_dream
  from public.dreams
  where id = p_dream_id
  for update;

  if v_dream.id is null then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;
  if v_dream.recipient_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select streak
    into v_streak
  from public.profiles
  where id = v_user;

  if v_dream.revealed_at is not null then
    return jsonb_build_object('ok', true, 'opened', false, 'streak', coalesce(v_streak, 0));
  end if;
  if v_dream.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  perform set_config('dream.allow_reveal', '1', true);
  update public.dreams
  set
    revealed_at = now(),
    expires_at = now() + interval '10 minutes'
  where id = v_dream.id
    and revealed_at is null;

  if not found then
    return jsonb_build_object('ok', true, 'opened', false, 'streak', coalesce(v_streak, 0));
  end if;

  perform set_config('dream.allow_streak', '1', true);
  update public.profiles
  set
    streak = case
      when last_ritual_night is distinct from v_dream.night_date then streak + 1
      else streak
    end,
    last_ritual_night = v_dream.night_date
  where id = v_user
  returning streak into v_streak;

  if v_streak is null then
    raise exception 'profile missing for streak';
  end if;

  return jsonb_build_object('ok', true, 'opened', true, 'streak', v_streak);
end;
$$;

revoke all on function public.reveal_dream(uuid) from public;
grant execute on function public.reveal_dream(uuid) to authenticated;

revoke update on table public.profiles from authenticated, anon;
grant update (bedtime, dream_code, timezone) on table public.profiles to authenticated;

notify pgrst, 'reload schema';
