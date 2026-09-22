-- ============================================================================
-- GOLIATH — Migration 0003 : stockage sécurisé des photos
-- Bucket privé, aucune URL publique. Le chemin imposé {lot_id}/{uuid}.jpg
-- (ou sans-lot/{uuid}.jpg) est vérifié par policy, pas seulement par
-- convention côté frontend.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-photos',
  'ai-photos',
  false, -- jamais public
  5242880, -- 5 Mo, la compression a lieu côté client avant upload
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- Le chemin doit obligatoirement commencer par un uuid de lot existant suivi
-- d'un slash, ou par "sans-lot/". Je vérifie la forme du nom de fichier
-- directement dans la policy plutôt que de faire confiance au frontend.
create or replace function storage_path_is_valid(object_name text)
returns boolean
language sql
immutable
as $$
  select
    object_name ~ '^sans-lot/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$'
    or (
      object_name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$'
      and exists (
        select 1 from public.lots
        where id = (split_part(object_name, '/', 1))::uuid
      )
    )
$$;

create policy "ai_photos_select_owner"
  on storage.objects for select
  using (
    bucket_id = 'ai-photos'
    and auth.uid() is not null
  );

create policy "ai_photos_insert_owner"
  on storage.objects for insert
  with check (
    bucket_id = 'ai-photos'
    and auth.uid() is not null
    and storage_path_is_valid(name)
  );

create policy "ai_photos_delete_owner"
  on storage.objects for delete
  using (
    bucket_id = 'ai-photos'
    and auth.uid() is not null
  );

-- Pas de policy update : une photo se remplace par suppression + nouvel
-- upload, jamais par écrasement en place.
