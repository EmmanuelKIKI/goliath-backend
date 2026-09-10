// C'est le point de départ de mon serveur backend. Je lance ce fichier
// avec "npm run dev" (en développement) ou "npm start" (en production).

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const routesPrincipales = require("./routes");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

// --- Middlewares de sécurité et d'utilitaires ---

// Helmet ajoute automatiquement plusieurs en-têtes de sécurité HTTP,
// je préfère l'activer par défaut même si mon app est petite.
app.use(helmet());

// Je n'autorise que mon frontend à appeler mon API, défini dans mon .env.
// Je "nettoie" la valeur (espaces, slash final) pour éviter qu'une
// différence de formatage invisible à l'œil nu casse tout. Je log
// aussi la valeur que j'attends au démarrage, et chaque origine
// refusée en cours de route, pour pouvoir déboguer facilement depuis
// mes logs Render sans deviner.
function nettoyerOrigine(valeur) {
  return valeur.trim().replace(/\/+$/, "");
}

const frontendUrlAttendue = nettoyerOrigine(process.env.FRONTEND_URL || "http://localhost:5173");
console.log(`[CORS] J'autorise les requêtes venant de : "${frontendUrlAttendue}"`);

app.use(
  cors({
    origin: (origine, callback) => {
      // "origine" est vide pour les requêtes qui ne viennent pas d'un
      // navigateur (curl, Postman, un autre serveur) : je les laisse
      // passer, la protection CORS ne concerne que les navigateurs.
      if (!origine) return callback(null, true);

      if (nettoyerOrigine(origine) === frontendUrlAttendue) {
        return callback(null, true);
      }

      console.warn(
        `[CORS] Origine refusée : "${origine}" (j'attendais exactement : "${frontendUrlAttendue}")`
      );
      return callback(new Error("Cette origine n'est pas autorisée par ma configuration CORS."));
    },
    credentials: true,
  })
);

// Je parse automatiquement le JSON envoyé dans le corps des requêtes.
app.use(express.json());

// Morgan me donne un log clair de chaque requête reçue, très utile
// pour déboguer en développement.
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// --- Route de vérification que mon serveur tourne bien ---
// Je m'en sers aussi comme "health check" si je déploie sur un
// serveur qui vérifie que l'app répond avant de la considérer en ligne.
app.get("/", (req, res) => {
  res.status(200).json({
    succes: true,
    message: "Mon API GOLIATH tourne correctement.",
  });
});

// --- Toutes mes routes métier ---
app.use("/", routesPrincipales);

// --- Route 404 : si aucune route ne correspond ---
app.use((req, res) => {
  res.status(404).json({
    succes: false,
    message: `Je n'ai pas trouvé de route correspondant à ${req.method} ${req.originalUrl}.`,
  });
});

// --- Middleware d'erreurs, toujours déclaré en dernier ---
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Mon serveur GOLIATH tourne sur http://localhost:${PORT}`);
});
