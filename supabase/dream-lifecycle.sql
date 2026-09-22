-- Dream night, reveal, and one incoming dream per recipient per night.
-- A second send the same night is refused, whether or not the first was opened.
-- A dream to yourself is refused. That lasting dream lives in solo_dreams
-- (supabase/solo-dream.sql) and does not take this night's slot.
-- Run once in the Dream About Me Supabase SQL editor. Safe to re-run.
-- Does not drop tables, truncate, or delete dream rows.
--
-- Dream night is 4:47 AM in the recipient's IANA timezone, stored on
-- profiles.timezone (written by that person's own client). No new column.
-- If that timezone is missing or invalid, send_dream refuses the send.
-- Push delivery can still use a subscription timezone when the profile
-- timezone is empty; sending does not, so the sender's client and this
-- function agree on profiles.timezone.

alter table public.profiles
  add column if not exists timezone text;

alter table public.profiles
  add column if not exists last_ritual_night date;

create or replace function public.dream_night(tz text, at timestamptz default now())
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  local_ts timestamp;
begin
  if tz is null or btrim(tz) = '' then
    return null;
  end if;
  begin
    local_ts := timezone(btrim(tz), at);
  exception
    when invalid_parameter_value then
      return null;
  end;
  return (local_ts - interval '4 hours 47 minutes')::date;
end;
$$;

revoke all on function public.dream_night(text, timestamptz) from public;

-- Profile timezone wins. A push subscription timezone is only a fallback so a
-- person who turned on notis before profiles.timezone was filled can still
-- receive. Callers cannot pass a timezone in.
create or replace function public.dream_zone(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select nullif(btrim(p.timezone), '')
      from public.profiles p
      where p.id = p_user
        and public.dream_night(nullif(btrim(p.timezone), ''), now()) is not null
    ),
    (
      select nullif(btrim(s.timezone), '')
      from public.push_subscriptions s
      where s.user_id = p_user
        and public.dream_night(nullif(btrim(s.timezone), ''), now()) is not null
      order by s.created_at desc
      limit 1
    )
  );
$$;

revoke all on function public.dream_zone(uuid) from public;

create or replace function public.connected_dream_nights(p_ids uuid[])
returns table (user_id uuid, night_date date)
language sql
stable
security definer
set search_path = public
as $$
  select ids.id, public.dream_night(public.dream_zone(ids.id), now())
  from unnest(coalesce(p_ids, '{}'::uuid[])) as ids(id)
  where ids.id = auth.uid()
     or exists (
       select 1
       from public.connections c
       where (
           (c.from_id = auth.uid() and c.to_id = ids.id)
           or (c.to_id = auth.uid() and c.from_id = ids.id)
         )
     );
$$;

revoke all on function public.connected_dream_nights(uuid[]) from public;
grant execute on function public.connected_dream_nights(uuid[]) to authenticated;

do $$
declare
  dupes integer;
begin
  select count(*) into dupes
  from (
    select 1
    from public.dreams
    group by recipient_id, night_date
    having count(*) > 1
  ) d;
  if dupes > 0 then
    raise exception
      'found % recipient/night pairs with more than one dream. Not deleting them. Inspect with: select recipient_id, night_date, count(*) from public.dreams group by 1, 2 having count(*) > 1',
      dupes;
  end if;
end $$;

create unique index if not exists dreams_recipient_night_key
  on public.dreams (recipient_id, night_date);

drop index if exists public.dreams_recipient_night_idx;

create or replace function public.protect_profile_streak()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.streak, 0) <> 0
       and current_setting('dream.allow_streak', true) is distinct from '1' then
      raise exception 'streak is server-controlled' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.streak is distinct from old.streak
     and current_setting('dream.allow_streak', true) is distinct from '1' then
    raise exception 'streak is server-controlled' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_streak on public.profiles;
create trigger profiles_protect_streak
before insert or update on public.profiles
for each row execute function public.protect_profile_streak();

create or replace function public.protect_dream_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('dream.allow_send', true) = '1' then
      return new;
    end if;
    raise exception 'dream insert is not allowed' using errcode = '42501';
  end if;

  if current_setting('dream.allow_reveal', true) = '1' then
    if new.id is distinct from old.id
       or new.sender_id is distinct from old.sender_id
       or new.recipient_id is distinct from old.recipient_id
       or new.kind is distinct from old.kind
       or new.quote is distinct from old.quote
       or new.video_url is distinct from old.video_url
       or new.image_path is distinct from old.image_path
       or new.thumb_path is distinct from old.thumb_path
       or new.night_date is distinct from old.night_date
       or new.created_at is distinct from old.created_at
       or old.revealed_at is not null
       or new.revealed_at is null
    then
      raise exception 'reveal cannot change dream content' using errcode = '42501';
    end if;
    return new;
  end if;

  if current_setting('dream.allow_send', true) = '1' then
    if old.revealed_at is not null or new.revealed_at is not null then
      raise exception 'opened dream cannot be replaced' using errcode = '42501';
    end if;
    if new.id is distinct from old.id
       or new.recipient_id is distinct from old.recipient_id
       or new.night_date is distinct from old.night_date
    then
      raise exception 'dream identity cannot change' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'dream update is not allowed' using errcode = '42501';
end;
$$;

drop trigger if exists dreams_protect_write on public.dreams;
create trigger dreams_protect_write
before insert or update on public.dreams
for each row execute function public.protect_dream_write();

create or replace function public.protect_dream_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_jwt_role text;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or current_setting('dream.allow_send', true) = '1' then
    return old;
  end if;
  begin
    v_jwt_role := coalesce(auth.role(), '');
  exception
    when undefined_function then
      v_jwt_role := '';
  end;
  if v_jwt_role = 'service_role' then
    return old;
  end if;
  raise exception 'dream delete is not allowed' using errcode = '42501';
end;
$$;

drop trigger if exists dreams_protect_delete on public.dreams;
create trigger dreams_protect_delete
before delete on public.dreams
for each row execute function public.protect_dream_delete();

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

drop policy if exists "dreams_insert_sender" on public.dreams;
drop policy if exists "dreams_update_own" on public.dreams;
drop policy if exists "dreams_delete_sender" on public.dreams;

revoke insert, update, delete on table public.dreams from authenticated, anon;
grant select on table public.dreams to authenticated;

revoke update on table public.profiles from authenticated, anon;
grant update (bedtime, dream_code, timezone) on table public.profiles to authenticated;

notify pgrst, 'reload schema';
