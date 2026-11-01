-- Group bets: anyone in the crew can join. Losers are decided either by options
-- (everyone picks one; wrong picks lose) or by checking off losers at the end.
-- When settled, each loser owes each winner `stakes` anytimers.

create type public.group_bet_status as enum ('open', 'locked', 'pending_result', 'settled', 'void');

create table public.group_bets (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  creator uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 1 and 280),
  options text[] not null default '{}',          -- empty = losers are checked off at the end
  stakes int not null default 1 check (stakes between 1 and 5),
  status public.group_bet_status not null default 'open',
  claimed_outcome text check (claimed_outcome in ('result', 'void')),
  claimed_option int,
  claimed_losers uuid[],
  claimed_by uuid references public.profiles (id),
  winning_option int,
  settlement_note text not null default '' check (char_length(settlement_note) <= 500),
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  settled_at timestamptz
);
create index group_bets_crew_idx on public.group_bets (crew_id, created_at desc);

create table public.group_bet_players (
  group_bet_id uuid not null references public.group_bets (id) on delete cascade,
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  pick int,                -- index into options, null when the bet has no options
  is_loser boolean,        -- filled in when settled
  joined_at timestamptz not null default now(),
  primary key (group_bet_id, user_id)
);
create index group_bet_players_crew_idx on public.group_bet_players (crew_id);

-- Anytimers can now come from a 1-on-1 bet or a group bet.
alter table public.anytimers
  alter column bet_id drop not null,
  add column group_bet_id uuid references public.group_bets (id) on delete cascade,
  add constraint anytimers_one_source check ((bet_id is null) <> (group_bet_id is null));
create index anytimers_group_idx on public.anytimers (group_bet_id);

alter table public.group_bets enable row level security;
alter table public.group_bet_players enable row level security;
create policy "group_bets: members read" on public.group_bets
  for select to authenticated using (public.is_crew_member(crew_id));
create policy "group_bet_players: members read" on public.group_bet_players
  for select to authenticated using (public.is_crew_member(crew_id));
grant select on public.group_bets, public.group_bet_players to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.gb_is_player(p_bet uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_bet_players where group_bet_id = p_bet and user_id = auth.uid());
$$;

create function public.gb_player_count(p_bet uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.group_bet_players where group_bet_id = p_bet;
$$;

-- Loads a group bet the caller's crew can see, locked for update.
create function public.gb_load(p_bet uuid) returns public.group_bets
language plpgsql security definer set search_path = public as $$
declare g public.group_bets;
begin
  select * into g from public.group_bets where id = p_bet for update;
  if g.id is null or not public.is_crew_member(g.crew_id) then raise exception 'Group bet not found'; end if;
  return g;
end $$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

create function public.create_group_bet(p_crew uuid, p_title text, p_options text[], p_stakes int, p_my_pick int)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_opts text[]; v_id uuid;
begin
  if not public.is_crew_member(p_crew) then raise exception 'You are not in this crew'; end if;
  if (select count(*) from public.crew_members where crew_id = p_crew) < 2 then
    raise exception 'Invite someone to the crew first';
  end if;

  select coalesce(array_agg(trim(o) order by ord), '{}') into v_opts
    from unnest(coalesce(p_options, '{}')) with ordinality as t(o, ord)
   where trim(o) <> '';
  if cardinality(v_opts) = 1 or cardinality(v_opts) > 6 then raise exception 'Give 2 to 6 options, or none'; end if;
  if exists (select 1 from unnest(v_opts) o where char_length(o) > 60) then raise exception 'Keep each option under 60 characters'; end if;
  if (select count(distinct lower(o)) from unnest(v_opts) o) <> cardinality(v_opts) then raise exception 'Each option needs to be different'; end if;
  if cardinality(v_opts) > 0 and (p_my_pick is null or p_my_pick < 0 or p_my_pick >= cardinality(v_opts)) then
    raise exception 'Pick your option';
  end if;

  insert into public.group_bets (crew_id, creator, title, options, stakes)
  values (p_crew, auth.uid(), trim(p_title), v_opts, p_stakes)
  returning id into v_id;
  insert into public.group_bet_players (group_bet_id, crew_id, user_id, pick)
  values (v_id, p_crew, auth.uid(), case when cardinality(v_opts) > 0 then p_my_pick end);
  return v_id;
end $$;

-- Join, or change your pick, while the bet is open.
create function public.join_group_bet(p_bet uuid, p_pick int) returns void
language plpgsql security definer set search_path = public as $$
declare g public.group_bets; v_pick int;
begin
  g := public.gb_load(p_bet);
  if g.status <> 'open' then raise exception 'This group bet is locked. No more joining or switching.'; end if;
  if cardinality(g.options) > 0 then
    if p_pick is null or p_pick < 0 or p_pick >= cardinality(g.options) then raise exception 'Pick an option'; end if;
    v_pick := p_pick;
  end if;
  if not public.gb_is_player(p_bet) and public.gb_player_count(p_bet) >= 30 then raise exception 'This group bet is full (30 players)'; end if;
  insert into public.group_bet_players (group_bet_id, crew_id, user_id, pick)
  values (p_bet, g.crew_id, auth.uid(), v_pick)
  on conflict (group_bet_id, user_id) do update set pick = excluded.pick;
end $$;

create function public.leave_group_bet(p_bet uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g public.group_bets;
begin
  g := public.gb_load(p_bet);
  if g.status <> 'open' then raise exception 'This group bet is locked. You''re in.'; end if;
  delete from public.group_bet_players where group_bet_id = p_bet and user_id = auth.uid();
end $$;

-- Creator or crew admin closes joining (e.g. when the game starts).
create function public.lock_group_bet(p_bet uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g public.group_bets;
begin
  g := public.gb_load(p_bet);
  if auth.uid() <> g.creator and not public.is_crew_admin(g.crew_id) then raise exception 'Only the person who made it (or the admin) can lock it'; end if;
  if g.status <> 'open' then raise exception 'This group bet is already locked'; end if;
  if public.gb_player_count(p_bet) < 2 then raise exception 'You need at least 2 players to lock it'; end if;
  update public.group_bets set status = 'locked', locked_at = now() where id = p_bet;
end $$;

-- Creator or crew admin calls it off before it's settled.
create function public.void_group_bet(p_bet uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g public.group_bets;
begin
  g := public.gb_load(p_bet);
  if auth.uid() <> g.creator and not public.is_crew_admin(g.crew_id) then raise exception 'Only the person who made it (or the admin) can call it off'; end if;
  if g.status in ('settled', 'void') then raise exception 'This group bet is already finished'; end if;
  update public.group_bets set status = 'void', settled_at = now() where id = p_bet;
end $$;

-- A player (or the creator/admin) reports the result; another player confirms it.
-- p_outcome 'result': pass p_option (bets with options) or p_losers (bets without). 'void': call it off.
create function public.claim_group_result(p_bet uuid, p_outcome text, p_option int, p_losers uuid[], p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare g public.group_bets; v_players int;
begin
  g := public.gb_load(p_bet);
  if not public.gb_is_player(p_bet) and auth.uid() <> g.creator and not public.is_crew_admin(g.crew_id) then
    raise exception 'Only players can report the result';
  end if;
  if g.status not in ('open', 'locked') then raise exception 'This group bet can''t take a result right now'; end if;
  v_players := public.gb_player_count(p_bet);
  if p_outcome not in ('result', 'void') then raise exception 'Unknown result'; end if;

  if p_outcome = 'result' then
    if v_players < 2 then raise exception 'You need at least 2 players'; end if;
    if cardinality(g.options) > 0 then
      if p_option is null or p_option < 0 or p_option >= cardinality(g.options) then raise exception 'Pick which option won'; end if;
    else
      if p_losers is null or cardinality(p_losers) = 0 then raise exception 'Check off who lost'; end if;
      if exists (select 1 from unnest(p_losers) l where l not in (select user_id from public.group_bet_players where group_bet_id = p_bet)) then
        raise exception 'Losers have to be players in this bet';
      end if;
      if (select count(distinct l) from unnest(p_losers) l) >= v_players then raise exception 'Somebody has to win'; end if;
    end if;
  end if;

  update public.group_bets
     set status = 'pending_result',
         locked_at = coalesce(locked_at, now()),
         claimed_outcome = p_outcome,
         claimed_option = case when p_outcome = 'result' and cardinality(g.options) > 0 then p_option end,
         claimed_losers = case when p_outcome = 'result' and cardinality(g.options) = 0
                               then (select array_agg(distinct l) from unnest(p_losers) l) end,
         claimed_by = auth.uid(),
         settlement_note = left(coalesce(trim(p_note), ''), 500)
   where id = p_bet;
end $$;

-- Another player agrees (settles it and issues anytimers) or disputes (back to locked).
-- The crew admin can confirm any claim, including their own, so a bet never gets stuck.
create function public.confirm_group_result(p_bet uuid, p_agree boolean) returns void
language plpgsql security definer set search_path = public as $$
declare g public.group_bets; v_admin boolean;
begin
  g := public.gb_load(p_bet);
  if g.status <> 'pending_result' then raise exception 'There is no result waiting on this group bet'; end if;
  v_admin := public.is_crew_admin(g.crew_id);
  if not public.gb_is_player(p_bet) and not v_admin and auth.uid() <> g.claimed_by then
    raise exception 'Only players can confirm the result';
  end if;

  if not p_agree then
    update public.group_bets
       set status = 'locked', claimed_outcome = null, claimed_option = null, claimed_losers = null, claimed_by = null
     where id = p_bet;
    return;
  end if;

  if auth.uid() = g.claimed_by and not v_admin then raise exception 'Someone else in the bet has to confirm this result'; end if;

  if g.claimed_outcome = 'void' then
    update public.group_bets set status = 'void', settled_at = now() where id = p_bet;
    return;
  end if;

  if cardinality(g.options) > 0 then
    update public.group_bet_players set is_loser = (pick is distinct from g.claimed_option) where group_bet_id = p_bet;
  else
    update public.group_bet_players set is_loser = (user_id = any (g.claimed_losers)) where group_bet_id = p_bet;
  end if;

  update public.group_bets set status = 'settled', winning_option = g.claimed_option, settled_at = now() where id = p_bet;

  -- Each loser owes each winner `stakes` anytimers. If nobody lost or nobody won, nobody owes.
  insert into public.anytimers (crew_id, group_bet_id, holder, owes)
  select g.crew_id, g.id, w.user_id, l.user_id
    from public.group_bet_players w
    join public.group_bet_players l on l.group_bet_id = w.group_bet_id and l.is_loser and not w.is_loser
    cross join generate_series(1, g.stakes)
   where w.group_bet_id = p_bet;
end $$;

-- Crew admin deletes a group bet (and the anytimers and photo records it created).
create function public.delete_group_bet(p_bet uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare g public.group_bets; v_paths text[];
begin
  g := public.gb_load(p_bet);
  if not public.is_crew_admin(g.crew_id) then raise exception 'Only the crew admin can delete bets'; end if;
  select coalesce(array_agg(p.path), '{}') into v_paths
    from public.drink_photos p join public.anytimers a on a.id = p.anytimer_id
   where a.group_bet_id = p_bet;
  delete from public.group_bets where id = p_bet;
  return v_paths;
end $$;

revoke execute on function
  public.gb_is_player(uuid), public.gb_player_count(uuid), public.gb_load(uuid),
  public.create_group_bet(uuid, text, text[], int, int), public.join_group_bet(uuid, int), public.leave_group_bet(uuid),
  public.lock_group_bet(uuid), public.void_group_bet(uuid),
  public.claim_group_result(uuid, text, int, uuid[], text), public.confirm_group_result(uuid, boolean),
  public.delete_group_bet(uuid)
from public, anon;
grant execute on function
  public.gb_is_player(uuid), public.gb_player_count(uuid),
  public.create_group_bet(uuid, text, text[], int, int), public.join_group_bet(uuid, int), public.leave_group_bet(uuid),
  public.lock_group_bet(uuid), public.void_group_bet(uuid),
  public.claim_group_result(uuid, text, int, uuid[], text), public.confirm_group_result(uuid, boolean),
  public.delete_group_bet(uuid)
to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.group_bets, public.group_bet_players;
  end if;
end $$;
