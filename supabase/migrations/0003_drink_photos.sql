-- Drink photos: proof that an anytimer was paid.
-- Files live in a private storage bucket at <crew id>/<anytimer id>/<file>.jpg.
-- Only crew members can see them; only the two people on that anytimer can add them.

-- ---------------------------------------------------------------------------
-- Storage bucket (private, images only, 5 MB max; the app shrinks photos to well under that)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drink-photos', 'drink-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Checks a storage path like "<crew>/<anytimer>/<file>" without ever failing on a malformed one.
create function public.photo_path_ok(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(p_name, '/');
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if parts is null or array_length(parts, 1) <> 3 or parts[1] !~ uuid_re or parts[2] !~ uuid_re then
    return false;
  end if;
  if not p_write then
    return public.is_crew_member(parts[1]::uuid);
  end if;
  return exists (
    select 1 from public.anytimers a
    where a.id = parts[2]::uuid and a.crew_id = parts[1]::uuid and auth.uid() in (a.holder, a.owes)
  );
end $$;

create policy "drink photos: crew can view" on storage.objects
  for select to authenticated
  using (bucket_id = 'drink-photos' and public.photo_path_ok(name, false));

create policy "drink photos: people on the anytimer can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'drink-photos' and public.photo_path_ok(name, true));

create policy "drink photos: uploader can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'drink-photos' and owner_id = (select auth.uid()::text));

-- ---------------------------------------------------------------------------
-- Photo records (what the app lists and shows)
-- ---------------------------------------------------------------------------

create table public.drink_photos (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  anytimer_id uuid not null references public.anytimers (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  path text not null unique,
  created_at timestamptz not null default now()
);
create index drink_photos_crew_idx on public.drink_photos (crew_id, created_at desc);

alter table public.drink_photos enable row level security;
create policy "drink_photos: members read" on public.drink_photos
  for select to authenticated using (public.is_crew_member(crew_id));
grant select on public.drink_photos to authenticated;

create function public.add_drink_photo(p_anytimer uuid, p_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.anytimers; v_id uuid;
begin
  select * into a from public.anytimers where id = p_anytimer;
  if a.id is null or not public.is_crew_member(a.crew_id) then raise exception 'Anytimer not found'; end if;
  if auth.uid() not in (a.holder, a.owes) then raise exception 'Only the two people on this anytimer can add photos'; end if;
  if p_path not like a.crew_id::text || '/' || a.id::text || '/%' then raise exception 'That photo is in the wrong place'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'drink-photos' and name = p_path) then
    raise exception 'The photo did not finish uploading. Try again.';
  end if;
  if (select count(*) from public.drink_photos where anytimer_id = p_anytimer) >= 4 then
    raise exception 'That one already has 4 photos';
  end if;
  insert into public.drink_photos (crew_id, anytimer_id, uploaded_by, path)
  values (a.crew_id, a.id, auth.uid(), p_path)
  returning id into v_id;
  return v_id;
end $$;

-- Removes the record; the app deletes the file itself first (storage files can't be deleted from SQL).
create function public.delete_drink_photo(p_photo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p public.drink_photos;
begin
  select * into p from public.drink_photos where id = p_photo;
  if p.id is null or not public.is_crew_member(p.crew_id) then raise exception 'Photo not found'; end if;
  if p.uploaded_by <> auth.uid() then raise exception 'Only the person who added a photo can remove it'; end if;
  delete from public.drink_photos where id = p_photo;
  return p.path;
end $$;

revoke execute on function public.photo_path_ok(text, boolean), public.add_drink_photo(uuid, text), public.delete_drink_photo(uuid) from public, anon;
grant execute on function public.photo_path_ok(text, boolean), public.add_drink_photo(uuid, text), public.delete_drink_photo(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.drink_photos;
  end if;
end $$;
