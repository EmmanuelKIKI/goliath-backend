// Mes routes pour le calendrier de vaccination. Contrairement au
// journal sanitaire, je garde celles-ci au niveau racine (/vaccinations)
// parce que je veux aussi pouvoir lister toutes mes vaccinations à
// venir, toutes bandes confondues, pour mon tableau de bord.

const express = require("express");
const router = express.Router();
const {
  listerVaccinations,
  planifierVaccination,
  modifierVaccination,
  alertesVaccination,
} = require("../controllers/santeController");

// Je place "/alertes" avant "/:id" pour être sûr qu'Express ne
// confonde pas "alertes" avec un identifiant de vaccination.
router.get("/alertes", alertesVaccination);
router.get("/", listerVaccinations);
router.post("/", planifierVaccination);
router.put("/:id", modifierVaccination);

module.exports = router;
