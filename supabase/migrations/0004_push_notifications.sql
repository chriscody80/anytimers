-- Push notifications: one row per phone/browser that turned notifications on.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "push: see own devices" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
grant select on public.push_subscriptions to authenticated;

-- Save this device for the signed-in person (a shared phone moves to whoever signed in last).
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_endpoint !~ '^https://' then raise exception 'That notification address is not valid'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create function public.remove_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

-- Devices to notify: only crewmates of the caller, never the caller's own devices.
create function public.push_targets(p_crew uuid, p_users uuid[])
returns table (endpoint text, p256dh text, auth text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_crew_member(p_crew) then return; end if;
  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.crew_members m on m.user_id = s.user_id and m.crew_id = p_crew
    where s.user_id = any (p_users) and s.user_id <> auth.uid();
end $$;

-- Phones that uninstalled or turned notifications off: the server drops them after a failed send.
create function public.drop_dead_subscription(p_crew uuid, p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crew_member(p_crew) then return; end if;
  delete from public.push_subscriptions s
  using public.crew_members m
  where s.endpoint = p_endpoint and m.user_id = s.user_id and m.crew_id = p_crew;
end $$;

revoke execute on function
  public.save_push_subscription(text, text, text), public.remove_push_subscription(text),
  public.push_targets(uuid, uuid[]), public.drop_dead_subscription(uuid, text)
from public, anon;
grant execute on function
  public.save_push_subscription(text, text, text), public.remove_push_subscription(text),
  public.push_targets(uuid, uuid[]), public.drop_dead_subscription(uuid, text)
to authenticated;
