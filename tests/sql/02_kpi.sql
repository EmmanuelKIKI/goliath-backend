-- tests/sql/02_kpi.sql
-- Je teste chaque formule de KPI de la section 9 sur un jeu de données connu,
-- et je vérifie explicitement que le FCR retourne null tant qu'il n'y a pas
-- au moins deux pesées sur la période.

begin;
select plan(6);

insert into buildings (id, name) values ('00000000-0000-0000-0000-000000000b02', 'Bâtiment KPI');
insert into lots (id, building_id, name, species, entry_date, initial_count)
values ('00000000-0000-0000-0000-00000000L002', '00000000-0000-0000-0000-000000000b02', 'Lot KPI', 'poulet', '2026-01-01', 100);

-- effectif début période = 100 (jour 1), effectif fin période = 90 (jour 10)
insert into daily_records (id, lot_id, record_date, starting_count, entries, deaths, exits, actual_count)
values
  ('00000000-0000-0000-0000-00000000D010', '00000000-0000-0000-0000-00000000L002', '2026-02-01', 100, 0, 0, 0, 100),
  ('00000000-0000-0000-0000-00000000D011', '00000000-0000-0000-0000-00000000L002', '2026-02-05', 97, 0, 3, 0, 97),
  ('00000000-0000-0000-0000-00000000D012', '00000000-0000-0000-0000-00000000L002', '2026-02-10', 90, 0, 3, 0, 90);

-- effectif_moyen = (100 + 90) / 2 = 95
select is(
  fn_effectif_moyen('00000000-0000-0000-0000-00000000L002', '2026-02-01', '2026-02-10'),
  95.0,
  'effectif_moyen = (100 + 90) / 2 = 95'
);

-- Taux de mortalité = 6 morts / 95 * 100 ≈ 6.3157...
select ok(
  abs(fn_taux_mortalite('00000000-0000-0000-0000-00000000L002', '2026-02-01', '2026-02-10') - (6.0 / 95 * 100)) < 0.0001,
  'taux_mortalite = morts / effectif_moyen * 100'
);

-- Taux de survie = 100 - taux de mortalité
select ok(
  abs(fn_taux_survie('00000000-0000-0000-0000-00000000L002', '2026-02-01', '2026-02-10') - (100 - (6.0 / 95 * 100))) < 0.0001,
  'taux_survie = 100 - taux_mortalite'
);

insert into feed_records (id, daily_record_id, feed_type, stock_start, quantity_received, quantity_distributed, actual_stock)
values
  ('00000000-0000-0000-0000-00000000F010', '00000000-0000-0000-0000-00000000D010', 'croissance', 0, 100, 40, 60),
  ('00000000-0000-0000-0000-00000000F011', '00000000-0000-0000-0000-00000000D011', 'croissance', 60, 0, 40, 20),
  ('00000000-0000-0000-0000-00000000F012', '00000000-0000-0000-0000-00000000D012', 'croissance', 20, 0, 20, 0);

-- aliment distribué total = 100kg, effectif_moyen = 95 -> 100/95
select ok(
  abs(fn_conso_aliment_par_sujet('00000000-0000-0000-0000-00000000L002', '2026-02-01', '2026-02-10') - (100.0 / 95)) < 0.0001,
  'consommation_aliment_par_sujet = aliment distribue / effectif_moyen'
);

-- FCR : une seule pesée -> doit retourner null
insert into weight_records (lot_id, weigh_date, average_weight_g, sample_size)
values ('00000000-0000-0000-0000-00000000L002', '2026-02-01', 500, 10);

select ok(
  fn_fcr('00000000-0000-0000-0000-00000000L002', '2026-02-01', '2026-02-10') is null,
  'FCR retourne null avec une seule pesee'
);

-- Deuxième pesée : FCR doit maintenant être calculable
insert into weight_records (lot_id, weigh_date, average_weight_g, sample_size)
values ('00000000-0000-0000-0000-00000000L002', '2026-02-10', 1200, 10);

select ok(
  fn_fcr('00000000-0000-0000-0000-00000000L002', '2026-02-01', '2026-02-10') is not null,
  'FCR devient calculable avec deux pesees'
);

select * from finish();
rollback;
