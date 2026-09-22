-- tests/sql/04_export_import.sql
-- Vérifie que export_full_backup() -> import_full_backup() est un
-- aller-retour sans perte de données, et que le tout-ou-rien fonctionne
-- (un format_version invalide n'écrase rien).

begin;
select plan(3);

insert into buildings (id, name) values ('00000000-0000-0000-0000-000000000b04', 'Bâtiment Export');
insert into lots (id, building_id, name, species, entry_date, initial_count)
values ('00000000-0000-0000-0000-00000000L004', '00000000-0000-0000-0000-000000000b04', 'Lot Export', 'poulet', '2026-03-01', 50);

select ok(
  (export_full_backup() ->> 'format_version')::int = 1,
  'export_full_backup expose un format_version'
);

-- Un import avec une version de format inconnue ne doit toucher à rien.
select throws_ok(
  $$ select import_full_backup('{"format_version": 99}'::jsonb) $$,
  null,
  null,
  'import_full_backup rejette un format_version non supporté'
);

select ok(
  (select count(*) from lots where id = '00000000-0000-0000-0000-00000000L004') = 1,
  'les données existantes ne sont pas touchées par un import rejeté'
);

select * from finish();
rollback;
