-- Crew admins can delete bets. Deleting a bet also removes the anytimers it created
-- and their photo records; the app then deletes the photo files themselves.

create function public.is_crew_admin(p_crew uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crew_members
    where crew_id = p_crew and user_id = auth.uid() and role = 'admin'
  );
$$;

-- Returns the storage paths of photos that belonged to the bet, so the app can delete the files.
create function public.delete_bet(p_bet uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare v_crew uuid; v_paths text[];
begin
  select crew_id into v_crew from public.bets where id = p_bet;
  if v_crew is null or not public.is_crew_member(v_crew) then raise exception 'Bet not found'; end if;
  if not public.is_crew_admin(v_crew) then raise exception 'Only the crew admin can delete bets'; end if;
  select coalesce(array_agg(p.path), '{}') into v_paths
    from public.drink_photos p
    join public.anytimers a on a.id = p.anytimer_id
   where a.bet_id = p_bet;
  delete from public.bets where id = p_bet; -- anytimers and photo records go with it
  return v_paths;
end $$;

-- Lets a crew admin delete photo files in their crew's folder (used when a bet is deleted).
create function public.photo_path_admin(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(p_name, '/');
begin
  if parts is null or array_length(parts, 1) <> 3
     or parts[1] !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return public.is_crew_admin(parts[1]::uuid);
end $$;

create policy "drink photos: crew admin can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'drink-photos' and public.photo_path_admin(name));

revoke execute on function public.is_crew_admin(uuid), public.delete_bet(uuid), public.photo_path_admin(text) from public, anon;
grant execute on function public.is_crew_admin(uuid), public.delete_bet(uuid), public.photo_path_admin(text) to authenticated;
