-- tests/sql/01_calculs_base.sql
-- Je teste ici les calculs de base (section 8) sur un jeu de données connu.
-- À exécuter avec pgTAP (recommandé) ou en lecture manuelle des résultats
-- si pgTAP n'est pas installé sur l'environnement de test.

begin;
select plan(6);

insert into buildings (id, name) values ('00000000-0000-0000-0000-000000000b01', 'Bâtiment Test');
insert into lots (id, building_id, name, species, entry_date, initial_count)
values ('00000000-0000-0000-0000-00000000L001', '00000000-0000-0000-0000-000000000b01', 'Lot Test', 'poulet', '2026-01-01', 100);

-- effectif_theorique = effectif_precedent + entrees - morts - sorties
insert into daily_records (id, lot_id, record_date, starting_count, entries, deaths, exits, actual_count)
values ('00000000-0000-0000-0000-00000000D001', '00000000-0000-0000-0000-00000000L001', '2026-01-01', 100, 0, 2, 1, 96);

select is(
  (select theoretical_count from daily_records where id = '00000000-0000-0000-0000-00000000D001'),
  97,
  'effectif_theorique = 100 + 0 - 2 - 1 = 97'
);

select is(
  (select count_difference from daily_records where id = '00000000-0000-0000-0000-00000000D001'),
  -1,
  'ecart = effectif_reel(96) - effectif_theorique(97) = -1'
);

-- stock_theorique = stock_debut + quantite_recue - quantite_distribuee
insert into feed_records (id, daily_record_id, feed_type, stock_start, quantity_received, quantity_distributed, actual_stock)
values ('00000000-0000-0000-0000-00000000F001', '00000000-0000-0000-0000-00000000D001', 'demarrage', 50, 20, 15, 54);

select is(
  (select theoretical_stock from feed_records where id = '00000000-0000-0000-0000-00000000F001'),
  55.00,
  'stock_theorique = 50 + 20 - 15 = 55'
);

select is(
  (select stock_difference from feed_records where id = '00000000-0000-0000-0000-00000000F001'),
  -1.00,
  'ecart_stock = stock_reel(54) - stock_theorique(55) = -1'
);

-- Contrainte CHECK des incidents : lot_id ou building_id obligatoire
select throws_ok(
  $$ insert into incidents (incident_date, type) values (current_date, 'test') $$,
  '23514',
  null,
  'un incident sans lot_id ni building_id doit être rejeté'
);

insert into incidents (lot_id, incident_date, type)
values ('00000000-0000-0000-0000-00000000L001', current_date, 'test');

select ok(
  (select count(*) from incidents where lot_id = '00000000-0000-0000-0000-00000000L001') = 1,
  'un incident avec lot_id renseigné est accepté'
);

select * from finish();
rollback;
