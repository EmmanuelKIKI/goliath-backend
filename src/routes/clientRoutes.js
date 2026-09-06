// Mes routes pour la gestion de mes fiches clients.

const express = require("express");
const router = express.Router();
const {
  listerClients,
  obtenirClient,
  creerClient,
  modifierClient,
  supprimerClient,
} = require("../controllers/clientController");

router.get("/", listerClients);
router.get("/:id", obtenirClient);
router.post("/", creerClient);
router.put("/:id", modifierClient);
router.delete("/:id", supprimerClient);

module.exports = router;
