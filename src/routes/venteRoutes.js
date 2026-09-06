// Mes routes pour la gestion de mes ventes.

const express = require("express");
const router = express.Router();
const { listerVentes, creerVente, modifierVente, supprimerVente } = require("../controllers/venteController");

router.get("/", listerVentes);
router.post("/", creerVente);
router.put("/:id", modifierVente);
router.delete("/:id", supprimerVente);

module.exports = router;
