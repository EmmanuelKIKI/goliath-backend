// Mes routes pour la gestion de mes tâches quotidiennes.

const express = require("express");
const router = express.Router();
const { listerTaches, creerTache, modifierTache, supprimerTache } = require("../controllers/tacheController");

router.get("/", listerTaches);
router.post("/", creerTache);
router.put("/:id", modifierTache);
router.delete("/:id", supprimerTache);

module.exports = router;
