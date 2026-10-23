-- Use the first name from Google (or other sign-in providers) as the starting display name.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(
    nullif(split_part(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ' ', 1), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Player'
  );
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(v_name, 40))
  on conflict (id) do nothing;
  return new;
end $$;
