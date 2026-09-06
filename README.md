# GOLIATH — Backend

J'ai créé ce backend pour gérer mon élevage de poulets Goliath au quotidien. C'est le cœur de ma plateforme GOLIATH : toute la logique métier et toutes mes données passent par cette API. Le frontend (une PWA) viendra se connecter dessus.

Je gère mon élevage seul pour l'instant, donc cette version est pensée pour un seul utilisateur — mais je l'ai construite de façon assez propre pour pouvoir la faire évoluer plus tard si j'embauche.

## Ce que fait cette API

- **Bandes** : je crée et je suis chacune de mes bandes de poulets
- **Santé** : je note mes événements sanitaires, je planifie mes vaccinations, je suis ma mortalité
- **Stocks** : je gère mes articles (aliment, médicament, litière) et tous mes mouvements d'entrée/sortie
- **Finances** : je note mes dépenses et mes revenus, je calcule ma rentabilité par bande, j'exporte mes rapports
- **Clients & Ventes** : je garde une fiche de mes clients et j'enregistre mes ventes
- **Tâches** : je gère ma liste de tâches quotidiennes, avec ou sans lien vers une bande

## Stack technique

- **Node.js** + **Express** pour l'API REST
- **PostgreSQL** comme base de données
- **Prisma** comme ORM, pour définir mon schéma et interroger ma base facilement
- **JWT** (jsonwebtoken) + **bcryptjs** pour mon authentification
- **Helmet**, **CORS**, **Morgan** pour la sécurité et les logs

## Installation

Ce que je dois faire pour lancer ce backend chez moi :

### 1. Installer PostgreSQL

Si je ne l'ai pas déjà, j'installe PostgreSQL sur ma machine, ou j'utilise un service PostgreSQL hébergé (Railway, Render, Supabase...). Je crée une base de données vide, par exemple `goliath_db`.

### 2. Installer les dépendances

```bash
cd backend
npm install
```

### 3. Configurer mes variables d'environnement

```bash
cp .env.example .env
```

Puis j'ouvre `.env` et je remplis mes vraies valeurs, en particulier :
- `DATABASE_URL` et `DIRECT_URL` avec mes identifiants PostgreSQL (en local avec un Postgres classique, je peux mettre la même valeur dans les deux)
- `JWT_SECRET` avec une longue chaîne aléatoire (je peux en générer une avec `openssl rand -hex 32`)

### 4. Créer les tables dans ma base de données

```bash
npm run prisma:migrate
```

Cette commande lit mon fichier `prisma/schema.prisma` et crée toutes mes tables dans PostgreSQL.

### 5. Créer mon compte utilisateur initial

J'ai deux façons de faire, au choix :

**Option A — avec le script de seed :**
```bash
npm run prisma:seed
```
Ça crée un compte avec l'email `jean@goliath.local` et le mot de passe temporaire `ChangeMoiRapidement123`. Je pense à le changer rapidement.

**Option B — avec la route d'inscription**, une fois mon serveur lancé :
```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"nom":"Jean Kiki","email":"jean@example.com","motDePasse":"MonMotDePasseSecurise123"}'
```

Je ne peux créer qu'un seul compte : la route bloque volontairement toute inscription supplémentaire, puisque je suis seul à utiliser la plateforme pour l'instant.

### 6. Lancer mon serveur

En développement (avec redémarrage automatique) :
```bash
npm run dev
```

En production :
```bash
npm start
```

Mon API tourne alors sur `http://localhost:4000` (ou le port que j'ai défini dans `.env`).

## Déployer en production (Render + Supabase)

C'est comme ça que je fais tourner GOLIATH en vrai, accessible depuis mon téléphone n'importe où, pas seulement en local.

### 1. Créer ma base de données sur Supabase

1. Je crée un compte sur [supabase.com](https://supabase.com) et un nouveau projet
2. Je vais dans **Project Settings > Database > Connection string**
3. Je récupère deux URLs différentes :
   - La connexion **"Transaction pooler"** (port 6543) → pour `DATABASE_URL`
   - La connexion **directe** (port 5432) → pour `DIRECT_URL`

Je garde ces deux URLs de côté, je les colle bientôt dans Render. J'ai besoin des deux parce que Prisma ne peut pas exécuter mes migrations à travers le pooler de connexions : `DIRECT_URL` sert uniquement à ça.

### 2. Pousser mon code sur GitHub

Je crée un repo GitHub (public ou privé) et j'y pousse le contenu de ce dossier `backend/`.

### 3. Déployer sur Render

**Option A — avec le Blueprint (le plus rapide) :**
1. Sur [render.com](https://render.com), je clique sur **New +** puis **Blueprint**
2. Je connecte mon repo GitHub, Render détecte automatiquement mon fichier `render.yaml`
3. Render me demande de remplir les variables marquées comme secrètes : `DATABASE_URL`, `DIRECT_URL`, `FRONTEND_URL`

**Option B — manuellement :**
1. Sur Render, je clique sur **New +** puis **Web Service**
2. Je connecte mon repo GitHub
3. Je configure :
   - **Build Command** : `npm install && npx prisma generate`
   - **Start Command** : `npx prisma migrate deploy && npm start`
   - **Environment** : Node
4. Dans l'onglet **Environment**, j'ajoute mes variables : `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL`, `NODE_ENV=production`

Je n'ai rien à configurer pour `PORT` : Render l'injecte automatiquement, et mon code le lit déjà via `process.env.PORT`.

### 4. Créer mon compte utilisateur en production

Une fois mon service démarré sur Render, je crée mon compte via la route d'inscription, en remplaçant l'URL par celle de mon service Render :

```bash
curl -X POST https://mon-service.onrender.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"nom":"Jean Kiki","email":"jean@example.com","motDePasse":"MonMotDePasseSecurise123"}'
```

### 5. Brancher mon frontend dessus

Dans le `.env` de mon frontend, je remplace `VITE_API_URL` par l'URL de mon service Render (`https://mon-service.onrender.com`), puis je rebuild.

### À savoir sur le plan gratuit de Render

Un service web gratuit sur Render se met en veille après un moment d'inactivité, et met quelques secondes à se "réveiller" au prochain appel. C'est sans impact sur mes données, juste un petit délai sur la toute première requête après une pause. Si ça me gêne au quotidien, je peux passer sur un plan payant qui reste toujours actif.



```
backend/
├── src/
│   ├── controllers/     # Toute ma logique métier, module par module
│   ├── routes/          # La définition de mes routes HTTP
│   ├── middlewares/      # Authentification et gestion des erreurs
│   ├── utils/            # Petits outils réutilisés partout (validation, erreurs...)
│   ├── prismaClient.js   # Ma connexion unique à la base de données
│   └── index.js          # Le point de démarrage de mon serveur
├── prisma/
│   ├── schema.prisma      # Le schéma complet de ma base de données
│   └── seed.js             # Script pour créer mon compte initial
├── .env.example
├── render.yaml           # Configuration de déploiement automatique sur Render
└── package.json
```

## Authentification

Toutes mes routes, sauf `/auth/login` et `/auth/register`, exigent un token JWT. Je récupère ce token en me connectant via `/auth/login`, puis je l'envoie dans chaque requête suivante :

```
Authorization: Bearer <mon_token>
```

Mon token est valable 7 jours par défaut (je peux changer ça avec `JWT_EXPIRES_IN` dans mon `.env`).

## Aperçu des routes principales

| Méthode | Route | Ce que ça fait |
|---|---|---|
| POST | `/auth/login` | Je me connecte |
| GET | `/dashboard` | Mon tableau de bord global |
| GET/POST | `/bandes` | Je liste / crée une bande |
| GET/POST | `/bandes/:bandeId/journal-sanitaire` | Mon journal sanitaire par bande |
| GET | `/bandes/:bandeId/mortalite` | Mes statistiques de mortalité |
| GET/POST | `/vaccinations` | Mon calendrier de vaccination |
| GET/POST | `/stocks/articles` | Mes articles de stock |
| POST | `/stocks/mouvements` | Mes entrées/sorties de stock |
| GET/POST | `/finances/transactions` | Mes dépenses et revenus |
| GET | `/finances/rentabilite/:bandeId` | La rentabilité d'une bande |
| GET | `/finances/rapport/export` | Export CSV de mon rapport financier |
| GET/POST | `/clients` | Mes fiches clients |
| GET/POST | `/ventes` | Mes ventes |
| GET/POST | `/taches` | Mes tâches personnelles |

Toutes les routes acceptent aussi PUT et DELETE là où ça a du sens (je modifie ou je supprime un enregistrement).

## Ce que je prévois pour la suite

- Un frontend en PWA (React + Vite) qui vient consommer cette API
- Peut-être, plus tard, une vraie gestion multi-utilisateurs si j'embauche
- Des notifications automatiques (email ou SMS) pour mes alertes de stock et de vaccination
