-- ============================================================================
-- GOLIATH — Migration 0005 : export / import JSON complet
-- L'export et l'import sont de simples fonctions SQL appelées en RPC direct
-- depuis le frontend (supabase-js .rpc()), pas des Edge Functions : ce n'est
-- que du CRUD élargi, protégé par RLS comme le reste (section 4 et 13).
--
-- Export CSV (fait côté frontend à partir des lectures directes) : pour la
-- consultation seulement. Cet export JSON ici est le seul pensé pour une
-- restauration complète (sauvegarde/restauration), avec un numéro de
-- version de format explicite.
-- ============================================================================

create or replace function export_full_backup()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'format_version', 1,
    'exported_at', now(),
    'farm_settings', (select coalesce(jsonb_agg(t), '[]'::jsonb) from farm_settings t),
    'buildings', (select coalesce(jsonb_agg(t), '[]'::jsonb) from buildings t),
    'lots', (select coalesce(jsonb_agg(t), '[]'::jsonb) from lots t),
    'daily_records', (select coalesce(jsonb_agg(t), '[]'::jsonb) from daily_records t),
    'feed_records', (select coalesce(jsonb_agg(t), '[]'::jsonb) from feed_records t),
    'feed_purchases', (select coalesce(jsonb_agg(t), '[]'::jsonb) from feed_purchases t),
    'water_records', (select coalesce(jsonb_agg(t), '[]'::jsonb) from water_records t),
    'health_records', (select coalesce(jsonb_agg(t), '[]'::jsonb) from health_records t),
    'treatments', (select coalesce(jsonb_agg(t), '[]'::jsonb) from treatments t),
    'vaccinations', (select coalesce(jsonb_agg(t), '[]'::jsonb) from vaccinations t),
    'vitamins', (select coalesce(jsonb_agg(t), '[]'::jsonb) from vitamins t),
    'weight_records', (select coalesce(jsonb_agg(t), '[]'::jsonb) from weight_records t),
    'hygiene_checklist', (select coalesce(jsonb_agg(t), '[]'::jsonb) from hygiene_checklist t),
    'egg_records', (select coalesce(jsonb_agg(t), '[]'::jsonb) from egg_records t),
    'incidents', (select coalesce(jsonb_agg(t), '[]'::jsonb) from incidents t),
    -- Historique IA sans les fichiers image binaires : je garde image_path
    -- (le chemin dans le bucket) mais jamais le contenu de la photo.
    'ai_analyses', (select coalesce(jsonb_agg(t), '[]'::jsonb) from ai_analyses t)
  )
$$;

-- Import : tout ou rien. Si une table est absente ou mal formée, toute la
-- transaction échoue et rien n'est appliqué partiellement.
create or replace function import_full_backup(p_payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_format_version integer;
  v_table text;
  v_required_tables text[] := array[
    'farm_settings', 'buildings', 'lots', 'daily_records', 'feed_records',
    'feed_purchases', 'water_records', 'health_records', 'treatments',
    'vaccinations', 'vitamins', 'weight_records', 'hygiene_checklist',
    'egg_records', 'incidents', 'ai_analyses'
  ];
begin
  v_format_version := (p_payload ->> 'format_version')::integer;
  if v_format_version is null then
    raise exception 'format_version manquant ou invalide dans le fichier importé';
  end if;
  if v_format_version <> 1 then
    raise exception 'format_version % non supporté par cette version du backend', v_format_version;
  end if;

  foreach v_table in array v_required_tables loop
    if not (p_payload ? v_table) then
      raise exception 'section "%" manquante dans le fichier importé', v_table;
    end if;
    if jsonb_typeof(p_payload -> v_table) <> 'array' then
      raise exception 'section "%" doit être un tableau JSON', v_table;
    end if;
  end loop;

  -- Ordre de suppression respectant les dépendances (des tables filles vers
  -- les tables parentes), puis ordre de ré-insertion inverse.
  delete from ai_analyses;
  delete from incidents;
  delete from egg_records;
  delete from hygiene_checklist;
  delete from weight_records;
  delete from vitamins;
  delete from vaccinations;
  delete from treatments;
  delete from health_records;
  delete from water_records;
  delete from feed_records;
  delete from feed_purchases;
  delete from daily_records;
  delete from lots;
  delete from buildings;
  delete from farm_settings;

  insert into farm_settings select * from jsonb_populate_recordset(null::farm_settings, p_payload -> 'farm_settings');
  insert into buildings select * from jsonb_populate_recordset(null::buildings, p_payload -> 'buildings');
  insert into lots select * from jsonb_populate_recordset(null::lots, p_payload -> 'lots');
  insert into daily_records select * from jsonb_populate_recordset(null::daily_records, p_payload -> 'daily_records');
  insert into feed_records select * from jsonb_populate_recordset(null::feed_records, p_payload -> 'feed_records');
  insert into feed_purchases select * from jsonb_populate_recordset(null::feed_purchases, p_payload -> 'feed_purchases');
  insert into water_records select * from jsonb_populate_recordset(null::water_records, p_payload -> 'water_records');
  insert into health_records select * from jsonb_populate_recordset(null::health_records, p_payload -> 'health_records');
  insert into treatments select * from jsonb_populate_recordset(null::treatments, p_payload -> 'treatments');
  insert into vaccinations select * from jsonb_populate_recordset(null::vaccinations, p_payload -> 'vaccinations');
  insert into vitamins select * from jsonb_populate_recordset(null::vitamins, p_payload -> 'vitamins');
  insert into weight_records select * from jsonb_populate_recordset(null::weight_records, p_payload -> 'weight_records');
  insert into hygiene_checklist select * from jsonb_populate_recordset(null::hygiene_checklist, p_payload -> 'hygiene_checklist');
  insert into egg_records select * from jsonb_populate_recordset(null::egg_records, p_payload -> 'egg_records');
  insert into incidents select * from jsonb_populate_recordset(null::incidents, p_payload -> 'incidents');
  insert into ai_analyses select * from jsonb_populate_recordset(null::ai_analyses, p_payload -> 'ai_analyses');

  return jsonb_build_object('success', true, 'restored_at', now());
exception
  when others then
    -- Toute erreur annule automatiquement la transaction (fonction appelée
    -- dans son propre bloc implicite) : rien n'est appliqué partiellement.
    raise;
end;
$$;
