// Mes routes pour la gestion financière : transactions, rentabilité,
// et rapports exportables.

const express = require("express");
const router = express.Router();
const {
  listerTransactions,
  creerTransaction,
  modifierTransaction,
  supprimerTransaction,
  rentabiliteBande,
  rapportGlobal,
  exporterRapportCSV,
} = require("../controllers/financeController");

router.get("/transactions", listerTransactions);
router.post("/transactions", creerTransaction);
router.put("/transactions/:id", modifierTransaction);
router.delete("/transactions/:id", supprimerTransaction);

router.get("/rentabilite/:bandeId", rentabiliteBande);

router.get("/rapport", rapportGlobal);
router.get("/rapport/export", exporterRapportCSV);

module.exports = router;
