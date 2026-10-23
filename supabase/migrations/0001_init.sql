-- Anytimers: schema, row-level security and game logic.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
-- All changes to bets and anytimers go through the functions at the bottom,
-- so the rules of the game are enforced by the database, not the browser.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  rules text not null default '' check (char_length(rules) <= 4000),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

create type public.bet_status as enum (
  'proposed',        -- waiting for the opponent to accept
  'open',            -- accepted, game on
  'pending_result',  -- one side reported a result, waiting for the other to confirm
  'settled',         -- someone won; anytimers were issued
  'push',            -- tie, nobody owes
  'void',            -- called off
  'declined'         -- opponent said no
);

create table public.bets (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  proposer uuid not null references public.profiles (id),
  opponent uuid not null references public.profiles (id),
  wager text not null check (char_length(wager) between 1 and 280),
  stakes int not null default 1 check (stakes between 1 and 10),
  status public.bet_status not null default 'proposed',
  claimed_outcome text check (claimed_outcome in ('win', 'push', 'void')),
  claimed_winner uuid references public.profiles (id),
  claimed_by uuid references public.profiles (id),
  winner uuid references public.profiles (id),
  settlement_note text not null default '' check (char_length(settlement_note) <= 500),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  settled_at timestamptz,
  check (proposer <> opponent)
);
create index bets_crew_idx on public.bets (crew_id, created_at desc);

create type public.anytimer_status as enum ('outstanding', 'called', 'redeemed');

create table public.anytimers (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  bet_id uuid not null references public.bets (id) on delete cascade,
  holder uuid not null references public.profiles (id),
  owes uuid not null references public.profiles (id),
  status public.anytimer_status not null default 'outstanding',
  created_at timestamptz not null default now(),
  called_at timestamptz,
  redeemed_at timestamptz
);
create index anytimers_crew_idx on public.anytimers (crew_id, status);

-- ---------------------------------------------------------------------------
-- New sign-ups get a profile automatically
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(split_part(new.email, '@', 1), ''), 'Player'), 40))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.is_crew_member(p_crew uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crew_members
    where crew_id = p_crew and user_id = auth.uid()
  );
$$;

create function public.shares_crew(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.crew_members a
    join public.crew_members b on a.crew_id = b.crew_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: you only ever see your own crews
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.bets enable row level security;
alter table public.anytimers enable row level security;

create policy "profiles: see self and crewmates" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_crew(id));
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "crews: members read" on public.crews
  for select to authenticated using (public.is_crew_member(id));

create policy "crew_members: members read" on public.crew_members
  for select to authenticated using (public.is_crew_member(crew_id));

create policy "bets: members read" on public.bets
  for select to authenticated using (public.is_crew_member(crew_id));

create policy "anytimers: members read" on public.anytimers
  for select to authenticated using (public.is_crew_member(crew_id));

-- Explicit grants (newer Supabase projects no longer grant these by default).
revoke all on all tables in schema public from anon;
grant select on public.profiles, public.crews, public.crew_members, public.bets, public.anytimers to authenticated;
grant update (display_name, onboarded) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Game logic. Every function checks who is calling and what state things are in.
-- ---------------------------------------------------------------------------

create function public.create_crew(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.crews (name, created_by) values (trim(p_name), auth.uid()) returning id into v_id;
  insert into public.crew_members (crew_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end $$;

create function public.join_crew(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into v_id from public.crews where invite_code = lower(trim(p_code));
  if v_id is null then raise exception 'That invite link is not valid anymore. Ask for a new one.'; end if;
  insert into public.crew_members (crew_id, user_id) values (v_id, auth.uid())
  on conflict do nothing;
  return v_id;
end $$;

create function public.reset_invite(p_crew uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not exists (select 1 from public.crew_members where crew_id = p_crew and user_id = auth.uid() and role = 'admin') then
    raise exception 'Only the crew admin can reset the invite link';
  end if;
  update public.crews set invite_code = encode(gen_random_bytes(6), 'hex') where id = p_crew returning invite_code into v_code;
  return v_code;
end $$;

create function public.set_rules(p_crew uuid, p_rules text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crew_member(p_crew) then raise exception 'You are not in this crew'; end if;
  update public.crews set rules = coalesce(p_rules, '') where id = p_crew;
end $$;

create function public.propose_bet(p_crew uuid, p_opponent uuid, p_wager text, p_stakes int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_crew_member(p_crew) then raise exception 'You are not in this crew'; end if;
  if p_opponent = auth.uid() then raise exception 'You cannot bet against yourself'; end if;
  if not exists (select 1 from public.crew_members where crew_id = p_crew and user_id = p_opponent) then
    raise exception 'That person is not in this crew';
  end if;
  insert into public.bets (crew_id, proposer, opponent, wager, stakes)
  values (p_crew, auth.uid(), p_opponent, trim(p_wager), p_stakes)
  returning id into v_id;
  return v_id;
end $$;

-- Opponent accepts or declines. The proposer can also withdraw while it is still proposed.
create function public.respond_bet(p_bet uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bets;
begin
  select * into b from public.bets where id = p_bet for update;
  if b.id is null or not public.is_crew_member(b.crew_id) then raise exception 'Bet not found'; end if;
  if b.status <> 'proposed' then raise exception 'This bet was already answered'; end if;
  if auth.uid() = b.opponent then
    update public.bets
       set status = case when p_accept then 'open'::public.bet_status else 'declined'::public.bet_status end,
           accepted_at = case when p_accept then now() end,
           settled_at = case when p_accept then null else now() end
     where id = p_bet;
  elsif auth.uid() = b.proposer and not p_accept then
    update public.bets set status = 'void', settled_at = now() where id = p_bet;
  else
    raise exception 'Only % can accept this bet', (select display_name from public.profiles where id = b.opponent);
  end if;
end $$;

-- Either side reports the result; the other side confirms it.
create function public.claim_result(p_bet uuid, p_outcome text, p_winner uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bets;
begin
  select * into b from public.bets where id = p_bet for update;
  if b.id is null or not public.is_crew_member(b.crew_id) then raise exception 'Bet not found'; end if;
  if auth.uid() not in (b.proposer, b.opponent) then raise exception 'Only the two people in the bet can report the result'; end if;
  if b.status <> 'open' then raise exception 'This bet is not open'; end if;
  if p_outcome not in ('win', 'push', 'void') then raise exception 'Unknown result'; end if;
  if p_outcome = 'win' and (p_winner is null or p_winner not in (b.proposer, b.opponent)) then
    raise exception 'Pick who won';
  end if;
  update public.bets
     set status = 'pending_result',
         claimed_outcome = p_outcome,
         claimed_winner = case when p_outcome = 'win' then p_winner end,
         claimed_by = auth.uid(),
         settlement_note = left(coalesce(trim(p_note), ''), 500)
   where id = p_bet;
end $$;

-- The other side agrees (bet is settled, anytimers issued) or disputes (bet reopens).
-- The person who reported can also take their report back.
create function public.confirm_result(p_bet uuid, p_agree boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bets; v_loser uuid;
begin
  select * into b from public.bets where id = p_bet for update;
  if b.id is null or not public.is_crew_member(b.crew_id) then raise exception 'Bet not found'; end if;
  if b.status <> 'pending_result' then raise exception 'There is no result waiting on this bet'; end if;
  if auth.uid() not in (b.proposer, b.opponent) then raise exception 'Only the two people in the bet can confirm the result'; end if;

  if not p_agree then
    update public.bets
       set status = 'open', claimed_outcome = null, claimed_winner = null, claimed_by = null
     where id = p_bet;
    return;
  end if;

  if auth.uid() = b.claimed_by then raise exception 'The other person has to confirm this result'; end if;

  if b.claimed_outcome = 'win' then
    v_loser := case when b.claimed_winner = b.proposer then b.opponent else b.proposer end;
    update public.bets set status = 'settled', winner = b.claimed_winner, settled_at = now() where id = p_bet;
    insert into public.anytimers (crew_id, bet_id, holder, owes)
    select b.crew_id, b.id, b.claimed_winner, v_loser from generate_series(1, b.stakes);
  else
    update public.bets set status = b.claimed_outcome::public.bet_status, settled_at = now() where id = p_bet;
  end if;
end $$;

-- Holder calls one in; the person who owes confirms they drank it.
-- The holder can also mark it done directly (you were standing right there) or take the call back.
create function public.call_anytimer(p_anytimer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.anytimers;
begin
  select * into a from public.anytimers where id = p_anytimer for update;
  if a.id is null or not public.is_crew_member(a.crew_id) then raise exception 'Anytimer not found'; end if;
  if auth.uid() <> a.holder then raise exception 'Only the holder can call this in'; end if;
  if a.status <> 'outstanding' then raise exception 'This one is already called in'; end if;
  update public.anytimers set status = 'called', called_at = now() where id = p_anytimer;
end $$;

create function public.cancel_call(p_anytimer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.anytimers;
begin
  select * into a from public.anytimers where id = p_anytimer for update;
  if a.id is null or not public.is_crew_member(a.crew_id) then raise exception 'Anytimer not found'; end if;
  if auth.uid() <> a.holder then raise exception 'Only the holder can take this back'; end if;
  if a.status <> 'called' then raise exception 'This one is not called in'; end if;
  update public.anytimers set status = 'outstanding', called_at = null where id = p_anytimer;
end $$;

create function public.mark_drank(p_anytimer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.anytimers;
begin
  select * into a from public.anytimers where id = p_anytimer for update;
  if a.id is null or not public.is_crew_member(a.crew_id) then raise exception 'Anytimer not found'; end if;
  if auth.uid() not in (a.holder, a.owes) then raise exception 'Only the two people involved can mark this done'; end if;
  if a.status = 'redeemed' then raise exception 'This one is already done'; end if;
  if auth.uid() = a.owes and a.status <> 'called' then raise exception 'It has not been called in yet'; end if;
  update public.anytimers
     set status = 'redeemed', redeemed_at = now(), called_at = coalesce(called_at, now())
   where id = p_anytimer;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_crew(text), public.join_crew(text), public.reset_invite(uuid), public.set_rules(uuid, text),
  public.propose_bet(uuid, uuid, text, int), public.respond_bet(uuid, boolean),
  public.claim_result(uuid, text, uuid, text), public.confirm_result(uuid, boolean),
  public.call_anytimer(uuid), public.cancel_call(uuid), public.mark_drank(uuid),
  public.is_crew_member(uuid), public.shares_crew(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Live updates
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bets, public.anytimers, public.crews, public.crew_members;
  end if;
end $$;
