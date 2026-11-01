-- Sides on bets, and bets sent to the whole crew (first person to take it becomes the opponent).

alter table public.bets
  alter column opponent drop not null,
  add column open_to_crew boolean not null default false,
  add column proposer_side text check (char_length(proposer_side) <= 80),
  add column opponent_side text check (char_length(opponent_side) <= 80),
  add constraint bets_opponent_or_open
    check (opponent is not null or (open_to_crew and status in ('proposed', 'void')));

-- New way to make a bet. Pass a null opponent to send it to the whole crew.
create function public.create_bet(
  p_crew uuid, p_opponent uuid, p_wager text, p_stakes int, p_my_side text, p_their_side text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_crew_member(p_crew) then raise exception 'You are not in this crew'; end if;
  if p_opponent is not null then
    if p_opponent = auth.uid() then raise exception 'You cannot bet against yourself'; end if;
    if not exists (select 1 from public.crew_members where crew_id = p_crew and user_id = p_opponent) then
      raise exception 'That person is not in this crew';
    end if;
  elsif (select count(*) from public.crew_members where crew_id = p_crew) < 2 then
    raise exception 'Invite someone to the crew first';
  end if;
  insert into public.bets (crew_id, proposer, opponent, open_to_crew, wager, stakes, proposer_side, opponent_side)
  values (
    p_crew, auth.uid(), p_opponent, p_opponent is null, trim(p_wager), p_stakes,
    nullif(trim(coalesce(p_my_side, '')), ''), nullif(trim(coalesce(p_their_side, '')), '')
  )
  returning id into v_id;
  return v_id;
end $$;

-- Accept / pass / withdraw. For a whole-crew bet, the first crewmate to accept takes it.
create or replace function public.respond_bet(p_bet uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bets;
begin
  select * into b from public.bets where id = p_bet for update;
  if b.id is null or not public.is_crew_member(b.crew_id) then raise exception 'Bet not found'; end if;

  if b.status <> 'proposed' then
    if b.open_to_crew and b.opponent is not null and b.opponent <> auth.uid() then
      raise exception '% already took this bet', (select display_name from public.profiles where id = b.opponent);
    end if;
    raise exception 'This bet was already answered';
  end if;

  if b.opponent is null then
    if auth.uid() = b.proposer then
      if p_accept then raise exception 'You cannot take your own bet'; end if;
      update public.bets set status = 'void', settled_at = now() where id = p_bet;
    else
      if not p_accept then raise exception 'Bets sent to the whole crew cannot be passed on. Just leave it for someone else.'; end if;
      update public.bets set opponent = auth.uid(), status = 'open', accepted_at = now() where id = p_bet;
    end if;
    return;
  end if;

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

revoke execute on function public.create_bet(uuid, uuid, text, int, text, text) from public, anon;
grant execute on function public.create_bet(uuid, uuid, text, int, text, text) to authenticated;
