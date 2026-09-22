-- ============================================================================
-- GOLIATH — Migration 0004 : statistiques et KPI
-- Chaque fonction prend des paramètres explicites (p_lot_id, p_date_debut,
-- p_date_fin) — jamais une période implicite déduite du contexte. Toutes
-- les formules sont documentées en commentaire juste au-dessus de leur
-- implémentation, comme demandé.
--
-- effectif_moyen = (effectif_debut_periode + effectif_fin_periode) / 2
-- effectif_debut_periode / effectif_fin_periode = actual_count du dernier
-- daily_record connu à la date demandée ou avant (le suivi n'est pas
-- forcément saisi exactement à la date pivot).
-- ============================================================================

create or replace function fn_effectif_a_date(p_lot_id uuid, p_date date)
returns integer
language sql
stable
as $$
  select actual_count
  from daily_records
  where lot_id = p_lot_id
    and record_date <= p_date
  order by record_date desc
  limit 1
$$;

-- effectif_moyen = (effectif_debut_periode + effectif_fin_periode) / 2
create or replace function fn_effectif_moyen(p_lot_id uuid, p_date_debut date, p_date_fin date)
returns numeric
language sql
stable
as $$
  select
    case
      when fn_effectif_a_date(p_lot_id, p_date_debut) is null
        or fn_effectif_a_date(p_lot_id, p_date_fin) is null
      then null
      else (fn_effectif_a_date(p_lot_id, p_date_debut) + fn_effectif_a_date(p_lot_id, p_date_fin))::numeric / 2
    end
$$;

-- Taux de mortalité (%) = morts sur la période / effectif_moyen × 100
create or replace function fn_taux_mortalite(p_lot_id uuid, p_date_debut date, p_date_fin date)
returns numeric
language sql
stable
as $$
  select
    case
      when fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) is null
        or fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) = 0
      then null
      else (
        (select coalesce(sum(deaths), 0) from daily_records
         where lot_id = p_lot_id and record_date between p_date_debut and p_date_fin)
        / fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) * 100
      )
    end
$$;

-- Taux de survie (%) = 100 − taux de mortalité
create or replace function fn_taux_survie(p_lot_id uuid, p_date_debut date, p_date_fin date)
returns numeric
language sql
stable
as $$
  select
    case
      when fn_taux_mortalite(p_lot_id, p_date_debut, p_date_fin) is null then null
      else 100 - fn_taux_mortalite(p_lot_id, p_date_debut, p_date_fin)
    end
$$;

-- Consommation d'aliment par sujet = aliment distribué sur la période (kg) / effectif_moyen
create or replace function fn_conso_aliment_par_sujet(p_lot_id uuid, p_date_debut date, p_date_fin date)
returns numeric
language sql
stable
as $$
  select
    case
      when fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) is null
        or fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) = 0
      then null
      else (
        (select coalesce(sum(fr.quantity_distributed), 0)
         from feed_records fr
         join daily_records dr on dr.id = fr.daily_record_id
         where dr.lot_id = p_lot_id and dr.record_date between p_date_debut and p_date_fin)
        / fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin)
      )
    end
$$;

-- Consommation d'eau par sujet = eau consommée sur la période (L) / effectif_moyen
create or replace function fn_conso_eau_par_sujet(p_lot_id uuid, p_date_debut date, p_date_fin date)
returns numeric
language sql
stable
as $$
  select
    case
      when fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) is null
        or fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) = 0
      then null
      else (
        (select coalesce(sum(wr.estimated_consumption), 0)
         from water_records wr
         join daily_records dr on dr.id = wr.daily_record_id
         where dr.lot_id = p_lot_id and dr.record_date between p_date_debut and p_date_fin)
        / fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin)
      )
    end
$$;

-- Taux de ponte (%) = œufs produits sur la période / (effectif_moyen de pondeuses × nombre de jours) × 100
-- "œufs produits" = somme des bons + cassés + sales (toute la production, pas seulement les bons).
create or replace function fn_taux_ponte(p_lot_id uuid, p_date_debut date, p_date_fin date)
returns numeric
language sql
stable
as $$
  select
    case
      when fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) is null
        or fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) = 0
        or (p_date_fin - p_date_debut + 1) <= 0
      then null
      else (
        (select coalesce(sum(er.good_eggs + er.broken_eggs + er.dirty_eggs), 0)
         from egg_records er
         join daily_records dr on dr.id = er.daily_record_id
         where dr.lot_id = p_lot_id and dr.record_date between p_date_debut and p_date_fin)
        / (fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) * (p_date_fin - p_date_debut + 1))
        * 100
      )
    end
$$;

-- Coût d'aliment par sujet = coût total des achats sur la période / effectif_moyen
-- Le périmètre des achats retenus est celui du bâtiment du lot (achats liés
-- à ce building_id) plus les achats globaux non affectés à un bâtiment
-- (building_id is null), puisque feed_purchases est indépendante des lots.
create or replace function fn_cout_aliment_par_sujet(p_lot_id uuid, p_date_debut date, p_date_fin date)
returns numeric
language sql
stable
as $$
  select
    case
      when fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) is null
        or fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin) = 0
      then null
      else (
        (select coalesce(sum(fp.total_cost), 0)
         from feed_purchases fp
         where fp.purchase_date between p_date_debut and p_date_fin
           and (
             fp.building_id is null
             or fp.building_id = (select building_id from lots where id = p_lot_id)
           ))
        / fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin)
      )
    end
$$;

-- Taux de résolution des incidents (%) = incidents résolus sur la période / total incidents de la période × 100
create or replace function fn_taux_resolution_incidents(p_lot_id uuid, p_date_debut date, p_date_fin date)
returns numeric
language sql
stable
as $$
  select
    case
      when (select count(*) from incidents
            where (lot_id = p_lot_id or building_id = (select building_id from lots where id = p_lot_id))
              and incident_date between p_date_debut and p_date_fin) = 0
      then null
      else (
        (select count(*) filter (where resolved) from incidents
         where (lot_id = p_lot_id or building_id = (select building_id from lots where id = p_lot_id))
           and incident_date between p_date_debut and p_date_fin)::numeric
        / (select count(*) from incidents
           where (lot_id = p_lot_id or building_id = (select building_id from lots where id = p_lot_id))
             and incident_date between p_date_debut and p_date_fin)
        * 100
      )
    end
$$;

-- Écart moyen d'effectif = moyenne des |effectif_reel − effectif_theorique| sur la période
create or replace function fn_ecart_moyen_effectif(p_lot_id uuid, p_date_debut date, p_date_fin date)
returns numeric
language sql
stable
as $$
  select avg(abs(count_difference))
  from daily_records
  where lot_id = p_lot_id and record_date between p_date_debut and p_date_fin
$$;

-- FCR (indice de conversion réel) — calculé uniquement si au moins deux
-- pesées existent pour le lot sur la période. Sinon la fonction renvoie
-- explicitement null, jamais une valeur inventée ou une division par une
-- estimation.
-- FCR = aliment total consommé sur la période (kg)
--       / (gain de poids total du lot sur la période, en kg)
-- gain de poids total ≈ (poids_moyen_fin - poids_moyen_debut) × effectif_survivant_fin
create or replace function fn_fcr(p_lot_id uuid, p_date_debut date, p_date_fin date)
returns numeric
language plpgsql
stable
as $$
declare
  v_nb_pesees integer;
  v_poids_debut numeric;
  v_poids_fin numeric;
  v_effectif_fin integer;
  v_gain_kg numeric;
  v_aliment_kg numeric;
begin
  select count(*) into v_nb_pesees
  from weight_records
  where lot_id = p_lot_id and weigh_date between p_date_debut and p_date_fin;

  if v_nb_pesees < 2 then
    return null;
  end if;

  select average_weight_g into v_poids_debut
  from weight_records
  where lot_id = p_lot_id and weigh_date between p_date_debut and p_date_fin
  order by weigh_date asc
  limit 1;

  select average_weight_g into v_poids_fin
  from weight_records
  where lot_id = p_lot_id and weigh_date between p_date_debut and p_date_fin
  order by weigh_date desc
  limit 1;

  v_effectif_fin := fn_effectif_a_date(p_lot_id, p_date_fin);

  if v_effectif_fin is null then
    return null;
  end if;

  -- gain de poids total en kg (les poids sont stockés en grammes)
  v_gain_kg := ((v_poids_fin - v_poids_debut) * v_effectif_fin) / 1000.0;

  if v_gain_kg <= 0 then
    return null; -- pas de division par une valeur nulle ou négative
  end if;

  select coalesce(sum(fr.quantity_distributed), 0) into v_aliment_kg
  from feed_records fr
  join daily_records dr on dr.id = fr.daily_record_id
  where dr.lot_id = p_lot_id and dr.record_date between p_date_debut and p_date_fin;

  return round(v_aliment_kg / v_gain_kg, 3);
end;
$$;

-- Fonction de synthèse : regroupe tous les KPI d'un lot sur une période en
-- un seul jsonb, pour un appel unique côté frontend.
create or replace function get_lot_kpis(p_lot_id uuid, p_date_debut date, p_date_fin date)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'lot_id', p_lot_id,
    'date_debut', p_date_debut,
    'date_fin', p_date_fin,
    'effectif_moyen', fn_effectif_moyen(p_lot_id, p_date_debut, p_date_fin),
    'taux_mortalite', fn_taux_mortalite(p_lot_id, p_date_debut, p_date_fin),
    'taux_survie', fn_taux_survie(p_lot_id, p_date_debut, p_date_fin),
    'conso_aliment_par_sujet', fn_conso_aliment_par_sujet(p_lot_id, p_date_debut, p_date_fin),
    'conso_eau_par_sujet', fn_conso_eau_par_sujet(p_lot_id, p_date_debut, p_date_fin),
    'taux_ponte', fn_taux_ponte(p_lot_id, p_date_debut, p_date_fin),
    'cout_aliment_par_sujet', fn_cout_aliment_par_sujet(p_lot_id, p_date_debut, p_date_fin),
    'taux_resolution_incidents', fn_taux_resolution_incidents(p_lot_id, p_date_debut, p_date_fin),
    'ecart_moyen_effectif', fn_ecart_moyen_effectif(p_lot_id, p_date_debut, p_date_fin),
    'fcr', fn_fcr(p_lot_id, p_date_debut, p_date_fin)
  )
$$;
