// Je centralise mon client Prisma ici pour n'avoir qu'une seule connexion
// à ma base de données, réutilisée partout dans mon application.
// Si je l'instanciais dans chaque fichier, je risquerais d'ouvrir trop
// de connexions inutiles à PostgreSQL.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  // J'active les logs des requêtes en développement pour comprendre
  // ce qui se passe, mais je les coupe en production pour ne pas
  // polluer mes logs serveur.
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

module.exports = prisma;
