-- Rootling v16: optional backup of pet drawings (pet-art.js).
-- Off by default on the device; nothing is uploaded unless the user turns on
-- "Back up my drawings" and is signed in to Connected accounts, and never
-- while Privacy Mode is on. Each person can only see and change their own rows
-- and files (row level security + storage folder = auth.uid()).

create table if not exists public.pet_artworks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   text not null,                      -- the id the device made, so re-sync is idempotent
  species     text not null default '' check (char_length(species) <= 40),
  label       text not null default '' check (char_length(label) <= 40),
  source      text not null default 'drawn' check (source in ('drawn', 'upload')),
  mime        text not null check (mime in ('image/webp', 'image/png')),
  bytes       integer not null check (bytes > 0 and bytes <= 614400),       -- 600 KB
  thumb_bytes integer not null check (thumb_bytes > 0 and thumb_bytes <= 122880), -- 120 KB
  width       integer not null default 512 check (width = 512),
  height      integer not null default 512 check (height = 512),
  path        text not null,
  thumb_path  text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, client_id)
);

create index if not exists pet_artworks_user_created on public.pet_artworks (user_id, created_at desc);

alter table public.pet_artworks enable row level security;

drop policy if exists "own art: read"   on public.pet_artworks;
drop policy if exists "own art: insert" on public.pet_artworks;
drop policy if exists "own art: update" on public.pet_artworks;
drop policy if exists "own art: delete" on public.pet_artworks;
create policy "own art: read"   on public.pet_artworks for select using (user_id = auth.uid());
create policy "own art: insert" on public.pet_artworks for insert with check (user_id = auth.uid());
create policy "own art: update" on public.pet_artworks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own art: delete" on public.pet_artworks for delete using (user_id = auth.uid());

-- At most 48 drawings per person (matches FORMAT.maxItems in pet-art.js).
create or replace function public.pet_artworks_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.pet_artworks where user_id = new.user_id) >= 48 then
    raise exception 'art shelf full' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists pet_artworks_cap on public.pet_artworks;
create trigger pet_artworks_cap before insert on public.pet_artworks
  for each row execute function public.pet_artworks_cap();

-- Private bucket. Files live at <user id>/<client id>.webp and -sm.webp.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-art', 'pet-art', false, 614400, array['image/webp', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 614400, allowed_mime_types = array['image/webp', 'image/png'];

drop policy if exists "pet-art own folder: read"   on storage.objects;
drop policy if exists "pet-art own folder: write"  on storage.objects;
drop policy if exists "pet-art own folder: update" on storage.objects;
drop policy if exists "pet-art own folder: delete" on storage.objects;
create policy "pet-art own folder: read" on storage.objects for select
  using (bucket_id = 'pet-art' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pet-art own folder: write" on storage.objects for insert
  with check (bucket_id = 'pet-art' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pet-art own folder: update" on storage.objects for update
  using (bucket_id = 'pet-art' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pet-art own folder: delete" on storage.objects for delete
  using (bucket_id = 'pet-art' and (storage.foldername(name))[1] = auth.uid()::text);
