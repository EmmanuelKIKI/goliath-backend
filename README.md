# GOLIATH — Backend (Supabase + Gemini)

C'est le backend de mon application GOLIATH, ma ferme avicole (poulets
Goliath, race béninoise à croissance rapide). Je remplace mon cahier papier
par cette application : bâtiments → lots → suivis quotidiens (aliment, eau,
santé, traitements, vaccinations, poids, œufs, hygiène, incidents), plus un
assistant IA (Gemini) et un historique d'analyses.

Toute ma logique métier critique, tous mes calculs officiels et toute
opération sensible restent côté serveur/SQL. Je ne fais jamais confiance au
frontend comme source de vérité. Ce dépôt ne couvre que le backend ; le
frontend fait l'objet d'un prompt et d'un projet séparés.

## 1. Stack

- PostgreSQL Supabase, migrations SQL versionnées
- Supabase Auth : un seul utilisateur (moi), pas d'inscription
- RLS activée sur toutes les tables, sans exception
- Supabase Storage : bucket privé `ai-photos`
- Edge Functions (Deno) : `auth-login`, `ai-veterinaire`, `ai-analyse-elevage`, `ai-analyse-image` — rien d'autre
- Google Gemini, appelé uniquement depuis les Edge Functions, via `fetch()` (pas le SDK npm, non garanti sous Deno)

## 2. Arborescence

```
goliath-backend/
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init_schema.sql
│   │   ├── 0002_rls_policies.sql
│   │   ├── 0003_storage_policies.sql
│   │   ├── 0004_statistics_kpi_views.sql
│   │   └── 0005_export_import.sql
│   ├── functions/
│   │   ├── auth-login/index.ts
│   │   ├── ai-veterinaire/index.ts
│   │   ├── ai-analyse-elevage/index.ts
│   │   ├── ai-analyse-image/index.ts
│   │   └── _shared/
│   │       ├── gemini.ts
│   │       ├── cors.ts
│   │       └── validation.ts
│   ├── seed/
│   │   ├── create-app-user.ts
│   │   └── package.json
│   └── config.toml
├── tests/
│   ├── sql/
│   │   ├── 01_calculs_base.sql
│   │   ├── 02_kpi.sql
│   │   ├── 03_rls.sql
│   │   └── 04_export_import.sql
│   └── functions/
│       ├── validation_test.ts
│       └── gemini_test.ts
├── .env.example
├── .gitignore
└── README.md
```

## 3. Règle d'accès direct vs Edge Function

- CRUD normal (lots, bâtiments, suivis, aliment, achats, eau, santé,
  traitements, vaccinations, hygiène, œufs, poids, incidents, paramètres,
  export/import JSON, lecture des statistiques et de l'historique IA) → en
  direct via `supabase-js`, protégé par RLS.
- Edge Functions réservées exclusivement à `auth-login` et aux trois
  fonctions Gemini.
- Statistiques et KPI → fonctions SQL (`get_lot_kpis` et les `fn_*`),
  interrogées en lecture directe.
- Photos → upload/suppression en direct via `supabase.storage`, protégé par
  policies. Les URL signées de lecture sont générées côté frontend
  (`createSignedUrl`), pas via Edge Function.

## 4. Authentification — un seul utilisateur

Je n'ai qu'un seul utilisateur Supabase, propriétaire de l'application. Il
est créé une seule fois, en local, via le script `supabase/seed/create-app-user.ts`,
qui appelle l'Admin API (`supabase.auth.admin.createUser`) — jamais un
script SQL touchant `auth.users`.

L'Edge Function `auth-login` reçoit mon code d'accès en clair, le compare au
hash bcrypt stocké dans `APP_ACCESS_CODE_HASH`, et si c'est correct, ouvre
une session sur mon utilisateur unique avec la clé de service. Le frontend
ne voit jamais `APP_USER_EMAIL` ni `APP_USER_PASSWORD`, uniquement le jeton
de session final.

## 5. KPI

Toutes les formules de `supabase/migrations/0004_statistics_kpi_views.sql`
sont documentées en commentaire SQL juste au-dessus de leur implémentation,
avec des paramètres explicites (`p_lot_id`, `p_date_debut`, `p_date_fin`),
jamais une période implicite. Le FCR retourne `null` explicitement tant que
je n'ai pas au moins deux pesées enregistrées sur la période — jamais une
valeur inventée.

J'ai dû ajouter une colonne `incidents.resolved` (booléen), non listée
explicitement dans le schéma de départ, parce que le KPI « taux de
résolution des incidents » ne peut pas exister sans une notion de résolution.

## 6. Gemini

Modèle par défaut : `gemini-3.1-flash-lite`, lu depuis la variable
d'environnement `GEMINI_MODEL` (jamais en dur). Gemini 2.0 est retiré et la
famille 2.5 (flash / pro / flash-lite) s'arrête le 16 octobre 2026 : je ne
construis rien de neuf dessus. Je vérifie les quotas actuels sur
`ai.google.dev/gemini-api/docs/rate-limits` au moment du build.

Je ne transmets à Gemini que des données réellement présentes en base.
Gemini n'invente jamais une donnée manquante : il le dit explicitement.
Gemini ne se présente jamais comme vétérinaire et ne pose jamais de
diagnostic confirmé.

## 7. Stockage des photos

Bucket `ai-photos` privé, jamais d'URL publique. Chemin imposé :
`{lot_id}/{uuid}.jpg` ou `sans-lot/{uuid}.jpg`, vérifié par policy Storage
(pas seulement par convention côté frontend). Formats acceptés : JPG, JPEG,
PNG, WebP. Taille max 5 Mo (la compression a lieu côté client avant upload).
La suppression d'une photo retire le fichier du bucket et met
`ai_analyses.image_path` à `null`, sans supprimer l'analyse texte associée.

## 8. Offline / synchronisation

Toutes mes clés primaires sont des UUID générés côté client dès la
création, y compris hors connexion : un insert rejoué est donc idempotent
(même UUID = même ligne). Chaque table a un `updated_at` maintenu par
trigger, utilisé pour détecter les conflits lors d'une synchronisation
différée (le frontend transmet `base_updated_at` ; si la ligne a changé
depuis, le conflit est signalé explicitement, jamais un écrasement
silencieux). Une suppression rejouée sur une ligne déjà supprimée est un
succès silencieux.

## 9. Export / import JSON

`export_full_backup()` et `import_full_backup(payload)` sont de simples
fonctions SQL appelées en RPC direct (pas des Edge Functions, puisque ce
n'est que du CRUD élargi). L'import est tout ou rien : en cas d'erreur de
structure, de version de format ou de type, rien n'est appliqué
partiellement. L'export JSON contient l'historique IA sans les fichiers
image binaires (juste leur chemin dans le bucket).

## 10. Installation et commandes (Windows / PowerShell)

```powershell
# Installer la CLI Supabase (une fois)
scoop install supabase

# Se connecter et lier le projet
supabase login
supabase link --project-ref xxxxx

# Copier et remplir mes variables locales
Copy-Item .env.example .env
notepad .env

# Appliquer toutes les migrations (schéma, RLS, storage, KPI, export/import)
supabase db push

# Déployer les Edge Functions
supabase functions deploy auth-login --no-verify-jwt
supabase functions deploy ai-veterinaire
supabase functions deploy ai-analyse-elevage
supabase functions deploy ai-analyse-image

# Déclarer mes secrets (jamais committés)
supabase secrets set APP_ACCESS_CODE_HASH="..." APP_USER_EMAIL="ferme@local.app" APP_USER_PASSWORD="..." GEMINI_API_KEY="..." GEMINI_MODEL="gemini-3.1-flash-lite"

# Créer mon utilisateur unique (une seule fois, en local)
cd supabase\seed
npm install
$env:SUPABASE_URL="https://xxxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:APP_USER_EMAIL="ferme@local.app"
$env:APP_USER_PASSWORD="..."
npm run seed
cd ..\..

# Lancer les tests SQL (pgTAP, en local avec `supabase start`)
supabase test db

# Lancer les tests Deno des Edge Functions
deno test --allow-env supabase\functions\_shared tests\functions
```

## 11. Ce que je n'ai pas construit (volontairement)

Pas d'inscription, pas de comptes multiples, pas de rôles complexes, pas de
paiement, pas d'abonnement, pas de marketplace, aucun KPI calculé par
Gemini (tout est SQL/TypeScript), aucune Edge Function pour du simple CRUD.

## 12. Priorité si un choix s'impose

Données → fonctionnement offline → synchronisation → sécurité → IA →
statistiques → exports. Si une fonctionnalité spectaculaire rend
l'application fragile, je choisis la solution simple et fiable plutôt que
la plus impressionnante.
