-- Group bets without options: mark winners as well as losers. Anyone unmarked gets nothing
-- (no win, no loss). Players: is_loser true = lost, false = won, null = nothing.

alter table public.group_bets add column claimed_winners uuid[];  -- null = everyone who didn't lose won

drop function public.claim_group_result(uuid, text, int, uuid[], text);

create function public.claim_group_result(
  p_bet uuid, p_outcome text, p_option int, p_losers uuid[], p_note text, p_winners uuid[] default null
) returns void
language plpgsql security definer set search_path = public as $$
declare g public.group_bets; v_players int; v_losers uuid[]; v_winners uuid[];
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
      select array_agg(distinct l) into v_losers from unnest(coalesce(p_losers, '{}')) l;
      if v_losers is null then raise exception 'Mark at least one loser'; end if;
      if p_winners is not null then
        select array_agg(distinct w) into v_winners from unnest(p_winners) w;
        if v_winners is null then raise exception 'Mark at least one winner'; end if;
        if v_winners && v_losers then raise exception 'Someone can''t be a winner and a loser'; end if;
      end if;
      if exists (
        select 1 from unnest(v_losers || coalesce(v_winners, '{}')) x
         where x not in (select user_id from public.group_bet_players where group_bet_id = p_bet)
      ) then
        raise exception 'Winners and losers have to be players in this bet';
      end if;
      if v_winners is null and cardinality(v_losers) >= v_players then raise exception 'Somebody has to win'; end if;
    end if;
  end if;

  update public.group_bets
     set status = 'pending_result',
         locked_at = coalesce(locked_at, now()),
         claimed_outcome = p_outcome,
         claimed_option = case when p_outcome = 'result' and cardinality(g.options) > 0 then p_option end,
         claimed_losers = case when p_outcome = 'result' and cardinality(g.options) = 0 then v_losers end,
         claimed_winners = case when p_outcome = 'result' and cardinality(g.options) = 0 then v_winners end,
         claimed_by = auth.uid(),
         settlement_note = left(coalesce(trim(p_note), ''), 500)
   where id = p_bet;
end $$;

create or replace function public.confirm_group_result(p_bet uuid, p_agree boolean) returns void
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
       set status = 'locked', claimed_outcome = null, claimed_option = null,
           claimed_losers = null, claimed_winners = null, claimed_by = null
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
    update public.group_bet_players
       set is_loser = case
             when user_id = any (g.claimed_losers) then true
             when g.claimed_winners is null or user_id = any (g.claimed_winners) then false
             else null                                     -- nothing: no win, no loss
           end
     where group_bet_id = p_bet;
  end if;

  update public.group_bets set status = 'settled', winning_option = g.claimed_option, settled_at = now() where id = p_bet;

  -- Each loser owes each winner `stakes` anytimers. Players marked "nothing" are left out.
  insert into public.anytimers (crew_id, group_bet_id, holder, owes)
  select g.crew_id, g.id, w.user_id, l.user_id
    from public.group_bet_players w
    join public.group_bet_players l on l.group_bet_id = w.group_bet_id and l.is_loser is true and w.is_loser is false
    cross join generate_series(1, g.stakes)
   where w.group_bet_id = p_bet;
end $$;

revoke execute on function public.claim_group_result(uuid, text, int, uuid[], text, uuid[]) from public, anon;
grant execute on function public.claim_group_result(uuid, text, int, uuid[], text, uuid[]) to authenticated;
