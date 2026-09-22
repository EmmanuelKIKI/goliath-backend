-- ============================================================================
-- GOLIATH — Migration 0002 : Row Level Security
-- J'active RLS sur toutes les tables, sans exception. Le rôle anon n'a accès
-- à rien : seule une session authentifiée (mon utilisateur unique, ouverte
-- via l'Edge Function auth-login) peut lire ou écrire.
--
-- La policy est volontairement écrite comme si elle filtrait par
-- propriétaire, avec une colonne owner_id commentée en réserve pour une
-- évolution multi-utilisateurs future — aujourd'hui elle se contente de
-- vérifier qu'une session existe (auth.uid() IS NOT NULL), puisque je suis
-- le seul utilisateur de l'application.
-- ============================================================================

-- Colonne owner_id réservée pour une évolution multi-utilisateurs :
-- alter table <table> add column owner_id uuid references auth.users(id) default auth.uid();
-- Non activée pour l'instant : un seul utilisateur possède toute la ferme.

do $$
declare
  t text;
  tables text[] := array[
    'buildings', 'lots', 'daily_records', 'feed_records', 'feed_purchases',
    'water_records', 'health_records', 'treatments', 'vaccinations',
    'vitamins', 'weight_records', 'hygiene_checklist', 'egg_records',
    'incidents', 'ai_analyses', 'farm_settings'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);

    execute format(
      'create policy %I on %I for select using (auth.uid() is not null)',
      t || '_select_owner', t
    );
    execute format(
      'create policy %I on %I for insert with check (auth.uid() is not null)',
      t || '_insert_owner', t
    );
    execute format(
      'create policy %I on %I for update using (auth.uid() is not null) with check (auth.uid() is not null)',
      t || '_update_owner', t
    );
    execute format(
      'create policy %I on %I for delete using (auth.uid() is not null)',
      t || '_delete_owner', t
    );
  end loop;
end;
$$;

-- Le rôle anon n'a explicitement aucun droit : je ne lui accorde jamais de
-- grant, et les policies ci-dessus exigent de toute façon une session
-- (auth.uid()) qu'un rôle anon n'a jamais.
revoke all on all tables in schema public from anon;
