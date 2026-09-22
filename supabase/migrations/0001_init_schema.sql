-- ============================================================================
-- GOLIATH — Migration 0001 : schéma initial
-- Je pose ici toutes les tables, contraintes, index et triggers de calcul
-- métier. Rien de ce qui est calculable en base ne doit être recalculé côté
-- client : effectif théorique, stock théorique et écarts sont garantis ici,
-- peu importe que l'écriture vienne du direct ou d'une synchronisation
-- différée après une période hors ligne.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Fonction générique : mise à jour automatique de updated_at
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- BUILDINGS (bâtiments)
-- ============================================================================
create table buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity integer check (capacity is null or capacity >= 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_buildings_updated_at
  before update on buildings
  for each row execute function set_updated_at();

-- ============================================================================
-- LOTS
-- Un lot appartient toujours à un bâtiment (contrainte de base de données,
-- pas juste une convention d'usage).
-- ============================================================================
create table lots (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete restrict,
  name text not null,
  species text not null,
  breed text,
  entry_date date not null,
  initial_count integer not null check (initial_count >= 0),
  housing_type text,
  status text not null default 'actif' check (status in ('actif', 'clos', 'suspendu')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_lots_building_id on lots(building_id);

create trigger trg_lots_updated_at
  before update on lots
  for each row execute function set_updated_at();

-- ============================================================================
-- DAILY_RECORDS (suivis quotidiens)
-- effectif_theorique = effectif_precedent + entrees - morts - sorties
-- ecart = effectif_reel - effectif_theorique
-- Ces deux calculs sont garantis par trigger, jamais laissés au client.
-- ============================================================================
create table daily_records (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  record_date date not null,
  starting_count integer not null check (starting_count >= 0),
  entries integer not null default 0 check (entries >= 0),
  deaths integer not null default 0 check (deaths >= 0),
  exits integer not null default 0 check (exits >= 0),
  theoretical_count integer not null default 0,
  actual_count integer not null check (actual_count >= 0),
  count_difference integer not null default 0,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lot_id, record_date)
);

create index idx_daily_records_lot_id on daily_records(lot_id);
create index idx_daily_records_date on daily_records(record_date);

create or replace function compute_daily_record_counts()
returns trigger
language plpgsql
as $$
begin
  -- effectif_theorique = effectif_precedent + entrees - morts - sorties
  new.theoretical_count := new.starting_count + new.entries - new.deaths - new.exits;
  -- ecart = effectif_reel - effectif_theorique
  new.count_difference := new.actual_count - new.theoretical_count;
  return new;
end;
$$;

create trigger trg_daily_records_counts
  before insert or update on daily_records
  for each row execute function compute_daily_record_counts();

create trigger trg_daily_records_updated_at
  before update on daily_records
  for each row execute function set_updated_at();

-- ============================================================================
-- FEED_RECORDS (aliment)
-- stock_theorique = stock_debut + quantite_recue - quantite_distribuee
-- ecart_stock = stock_reel - stock_theorique
-- ============================================================================
create table feed_records (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references daily_records(id) on delete cascade,
  feed_type text not null,
  stock_start numeric(10,2) not null default 0 check (stock_start >= 0),
  quantity_received numeric(10,2) not null default 0 check (quantity_received >= 0),
  quantity_distributed numeric(10,2) not null default 0 check (quantity_distributed >= 0),
  theoretical_stock numeric(10,2) not null default 0,
  actual_stock numeric(10,2) not null check (actual_stock >= 0),
  stock_difference numeric(10,2) not null default 0,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_feed_records_daily_record_id on feed_records(daily_record_id);

create or replace function compute_feed_record_stock()
returns trigger
language plpgsql
as $$
begin
  new.theoretical_stock := new.stock_start + new.quantity_received - new.quantity_distributed;
  new.stock_difference := new.actual_stock - new.theoretical_stock;
  return new;
end;
$$;

create trigger trg_feed_records_stock
  before insert or update on feed_records
  for each row execute function compute_feed_record_stock();

create trigger trg_feed_records_updated_at
  before update on feed_records
  for each row execute function set_updated_at();

-- ============================================================================
-- FEED_PURCHASES (achats d'aliment) — indépendant des lots
-- ============================================================================
create table feed_purchases (
  id uuid primary key default gen_random_uuid(),
  feed_type text not null,
  quantity_kg numeric(10,2) not null check (quantity_kg > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  total_cost numeric(12,2) not null default 0,
  purchase_date date not null,
  supplier text,
  building_id uuid references buildings(id) on delete set null,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_feed_purchases_building_id on feed_purchases(building_id);
create index idx_feed_purchases_date on feed_purchases(purchase_date);

create or replace function compute_feed_purchase_total()
returns trigger
language plpgsql
as $$
begin
  new.total_cost := round(new.quantity_kg * new.unit_price, 2);
  return new;
end;
$$;

create trigger trg_feed_purchases_total
  before insert or update on feed_purchases
  for each row execute function compute_feed_purchase_total();

create trigger trg_feed_purchases_updated_at
  before update on feed_purchases
  for each row execute function set_updated_at();

-- ============================================================================
-- WATER_RECORDS (eau)
-- ============================================================================
create table water_records (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references daily_records(id) on delete cascade,
  available_quantity numeric(10,2) not null default 0 check (available_quantity >= 0),
  added_quantity numeric(10,2) not null default 0 check (added_quantity >= 0),
  estimated_consumption numeric(10,2) not null default 0 check (estimated_consumption >= 0),
  remaining_quantity numeric(10,2) not null default 0 check (remaining_quantity >= 0),
  water_remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_water_records_daily_record_id on water_records(daily_record_id);

create trigger trg_water_records_updated_at
  before update on water_records
  for each row execute function set_updated_at();

-- ============================================================================
-- HEALTH_RECORDS (santé)
-- ============================================================================
create table health_records (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references daily_records(id) on delete cascade,
  lot_id uuid not null references lots(id) on delete cascade,
  sick_count integer not null default 0 check (sick_count >= 0),
  symptoms text,
  duration text,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_health_records_lot_id on health_records(lot_id);
create index idx_health_records_daily_record_id on health_records(daily_record_id);

create trigger trg_health_records_updated_at
  before update on health_records
  for each row execute function set_updated_at();

-- ============================================================================
-- TREATMENTS (traitements)
-- ============================================================================
create table treatments (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references daily_records(id) on delete cascade,
  lot_id uuid not null references lots(id) on delete cascade,
  product text not null,
  treatment_date date not null,
  treatment_time time,
  subjects_count integer not null default 0 check (subjects_count >= 0),
  dose text,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_treatments_lot_id on treatments(lot_id);

create trigger trg_treatments_updated_at
  before update on treatments
  for each row execute function set_updated_at();

-- ============================================================================
-- VACCINATIONS — rattachées directement au lot
-- ============================================================================
create table vaccinations (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  vaccine_name text not null,
  vaccination_date date not null,
  subjects_count integer not null default 0 check (subjects_count >= 0),
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_vaccinations_lot_id on vaccinations(lot_id);

create trigger trg_vaccinations_updated_at
  before update on vaccinations
  for each row execute function set_updated_at();

-- ============================================================================
-- VITAMINS — rattachées directement au lot
-- ============================================================================
create table vitamins (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  product text not null,
  vitamin_date date not null,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_vitamins_lot_id on vitamins(lot_id);

create trigger trg_vitamins_updated_at
  before update on vitamins
  for each row execute function set_updated_at();

-- ============================================================================
-- WEIGHT_RECORDS (pesées) — nécessaire pour le FCR réel
-- ============================================================================
create table weight_records (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  weigh_date date not null,
  average_weight_g numeric(10,2) not null check (average_weight_g > 0),
  sample_size integer not null check (sample_size > 0),
  min_weight_g numeric(10,2) check (min_weight_g is null or min_weight_g > 0),
  max_weight_g numeric(10,2) check (max_weight_g is null or max_weight_g > 0),
  sampling_method text,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_weight_records_lot_id on weight_records(lot_id);
create index idx_weight_records_date on weight_records(weigh_date);

create trigger trg_weight_records_updated_at
  before update on weight_records
  for each row execute function set_updated_at();

-- ============================================================================
-- HYGIENE_CHECKLIST
-- ============================================================================
create table hygiene_checklist (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references daily_records(id) on delete cascade,
  task_name text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_hygiene_checklist_daily_record_id on hygiene_checklist(daily_record_id);

create trigger trg_hygiene_checklist_updated_at
  before update on hygiene_checklist
  for each row execute function set_updated_at();

-- ============================================================================
-- EGG_RECORDS (œufs)
-- ============================================================================
create table egg_records (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references daily_records(id) on delete cascade,
  period text not null check (period in ('matin', 'soir')),
  good_eggs integer not null default 0 check (good_eggs >= 0),
  broken_eggs integer not null default 0 check (broken_eggs >= 0),
  dirty_eggs integer not null default 0 check (dirty_eggs >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_record_id, period)
);

create index idx_egg_records_daily_record_id on egg_records(daily_record_id);

create trigger trg_egg_records_updated_at
  before update on egg_records
  for each row execute function set_updated_at();

-- ============================================================================
-- INCIDENTS
-- Un incident doit toujours être rattaché à un lot, à un bâtiment, ou aux
-- deux — jamais à aucun des deux (contrainte CHECK, pas juste une validation
-- côté client).
-- J'ajoute une colonne "resolved" : elle n'était pas listée explicitement
-- dans le prompt, mais le KPI "taux de résolution des incidents" (section 9)
-- en a strictement besoin pour être calculable.
-- ============================================================================
create table incidents (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references lots(id) on delete cascade,
  building_id uuid references buildings(id) on delete cascade,
  incident_date date not null,
  incident_time time,
  type text not null,
  description text,
  action_taken text,
  severity text check (severity in ('faible', 'moyenne', 'grave')),
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_incident_target check (lot_id is not null or building_id is not null)
);

create index idx_incidents_lot_id on incidents(lot_id);
create index idx_incidents_building_id on incidents(building_id);
create index idx_incidents_date on incidents(incident_date);

create trigger trg_incidents_updated_at
  before update on incidents
  for each row execute function set_updated_at();

-- ============================================================================
-- AI_ANALYSES (historique des analyses Gemini)
-- Conservées jusqu'à suppression manuelle explicite (section 17) — aucune
-- purge automatique programmée ici.
-- ============================================================================
create table ai_analyses (
  id uuid primary key default gen_random_uuid(),
  analysis_date timestamptz not null default now(),
  type text not null check (type in ('veterinaire', 'elevage', 'image')),
  lot_id uuid references lots(id) on delete set null,
  question text,
  context jsonb,
  response text not null,
  image_path text,
  gemini_model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ai_analyses_lot_id on ai_analyses(lot_id);
create index idx_ai_analyses_type on ai_analyses(type);
create index idx_ai_analyses_date on ai_analyses(analysis_date);

create trigger trg_ai_analyses_updated_at
  before update on ai_analyses
  for each row execute function set_updated_at();

-- ============================================================================
-- FARM_SETTINGS (singleton)
-- Une seule ligne autorisée : contrainte d'unicité sur une colonne constante.
-- ============================================================================
create table farm_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique,
  farm_name text not null default 'GOLIATH',
  location text,
  description text,
  currency text not null default 'XOF',
  feed_alert_threshold numeric(10,2),
  mortality_alert_threshold numeric(5,2),
  egg_tracking_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_singleton check (singleton is true)
);

create trigger trg_farm_settings_updated_at
  before update on farm_settings
  for each row execute function set_updated_at();

insert into farm_settings (farm_name) values ('GOLIATH');
