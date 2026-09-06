-- The Squibb Way to Spanish: shared league backend
-- Designed for Supabase Anonymous Auth + PostgREST/RPC.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  club_name text not null default 'Player FC',
  course_pct integer not null default 0 check (course_pct between 0 and 100),
  current_week integer not null default 1 check (current_week between 1 and 26),
  points integer not null default 0,
  streak integer not null default 0,
  stars integer not null default 0,
  goals integer not null default 0,
  match_wins integer not null default 0,
  last_active date not null default current_date,
  updated_at timestamptz not null default now()
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table if not exists public.activity_feed (
  id bigint generated always as identity primary key,
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null default 'progress',
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_league_members_user on public.league_members(user_id);
create index if not exists idx_activity_league_created on public.activity_feed(league_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.activity_feed enable row level security;

-- A user can always see and update their own profile.
drop policy if exists profiles_select_shared on public.profiles;
create policy profiles_select_shared on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1
    from public.league_members mine
    join public.league_members theirs on theirs.league_id = mine.league_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- League records are visible to members only.
drop policy if exists leagues_select_member on public.leagues;
create policy leagues_select_member on public.leagues for select to authenticated using (
  owner_id = auth.uid() or exists (
    select 1 from public.league_members lm where lm.league_id = leagues.id and lm.user_id = auth.uid()
  )
);

drop policy if exists leagues_insert_owner on public.leagues;
create policy leagues_insert_owner on public.leagues for insert to authenticated with check (owner_id = auth.uid());

-- Members can see the membership rows for leagues they belong to.
drop policy if exists members_select_shared on public.league_members;
create policy members_select_shared on public.league_members for select to authenticated using (
  exists (
    select 1 from public.league_members mine where mine.league_id = league_members.league_id and mine.user_id = auth.uid()
  )
);

-- Activity feed is visible to league members; users can post their own activity.
drop policy if exists activity_select_member on public.activity_feed;
create policy activity_select_member on public.activity_feed for select to authenticated using (
  exists (
    select 1 from public.league_members lm where lm.league_id = activity_feed.league_id and lm.user_id = auth.uid()
  )
);

drop policy if exists activity_insert_own on public.activity_feed;
create policy activity_insert_own on public.activity_feed for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.league_members lm where lm.league_id = activity_feed.league_id and lm.user_id = auth.uid()
  )
);

create or replace function public.make_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  code text;
begin
  loop
    code := 'SQUIBB-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 6));
    exit when not exists (select 1 from public.leagues where invite_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.create_squibb_league(p_name text)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  row_out public.leagues;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.leagues(name, invite_code, owner_id)
  values (coalesce(nullif(trim(p_name), ''), 'Squibb League'), public.make_invite_code(), auth.uid())
  returning * into row_out;

  insert into public.league_members(league_id, user_id)
  values (row_out.id, auth.uid())
  on conflict do nothing;

  return row_out;
end;
$$;

create or replace function public.join_squibb_league(p_code text)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  row_out public.leagues;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into row_out
  from public.leagues
  where upper(invite_code) = upper(trim(p_code));

  if row_out.id is null then raise exception 'League code not found'; end if;

  insert into public.league_members(league_id, user_id)
  values (row_out.id, auth.uid())
  on conflict do nothing;

  return row_out;
end;
$$;

create or replace function public.my_leagues()
returns table(id uuid, name text, invite_code text, owner_id uuid, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select l.id, l.name, l.invite_code, l.owner_id, l.created_at
  from public.leagues l
  join public.league_members lm on lm.league_id = l.id
  where lm.user_id = auth.uid()
  order by l.created_at;
$$;

create or replace function public.league_table(p_league_id uuid)
returns table(
  player_id uuid,
  display_name text,
  club_name text,
  course_pct integer,
  current_week integer,
  points integer,
  streak integer,
  stars integer,
  goals integer,
  match_wins integer,
  last_active date
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.club_name, p.course_pct, p.current_week,
         p.points, p.streak, p.stars, p.goals, p.match_wins, p.last_active
  from public.profiles p
  join public.league_members lm on lm.user_id = p.id
  where lm.league_id = p_league_id
    and exists (
      select 1 from public.league_members mine
      where mine.league_id = p_league_id and mine.user_id = auth.uid()
    )
  order by p.points desc, p.course_pct desc, p.streak desc, p.updated_at asc;
$$;

grant execute on function public.create_squibb_league(text) to authenticated;
grant execute on function public.join_squibb_league(text) to authenticated;
grant execute on function public.my_leagues() to authenticated;
grant execute on function public.league_table(uuid) to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.leagues to authenticated;
grant select on public.league_members to authenticated;
grant select, insert on public.activity_feed to authenticated;
