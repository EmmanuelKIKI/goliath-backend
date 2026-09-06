// Ces routes sont imbriquées sous une bande précise :
// /bandes/:bandeId/journal-sanitaire et /bandes/:bandeId/mortalite
// J'utilise "mergeParams: true" pour pouvoir récupérer bandeId
// depuis l'URL parente dans mes contrôleurs.

const express = require("express");
const router = express.Router({ mergeParams: true });
const {
  listerJournalSanitaire,
  ajouterEvenementSanitaire,
  obtenirMortalite,
} = require("../controllers/santeController");

// Monté sur /bandes/:bandeId/journal-sanitaire
router.get("/journal-sanitaire", listerJournalSanitaire);
router.post("/journal-sanitaire", ajouterEvenementSanitaire);

// Monté sur /bandes/:bandeId/mortalite
router.get("/mortalite", obtenirMortalite);

module.exports = router;
