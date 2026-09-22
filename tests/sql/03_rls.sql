-- tests/sql/03_rls.sql
-- Je vérifie qu'un utilisateur non authentifié (rôle anon) ne peut rien
-- lire ni écrire sur les tables métier.

begin;
select plan(2);

set local role anon;

select is_empty(
  $$ select * from lots $$,
  'anon ne doit rien pouvoir lire dans lots'
);

select throws_ok(
  $$ insert into buildings (name) values ('Intrusion') $$,
  null,
  null,
  'anon ne doit rien pouvoir écrire dans buildings'
);

reset role;
select * from finish();
rollback;
