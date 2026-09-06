// Mes routes pour gérer mes bandes de poulets.

const express = require("express");
const router = express.Router();
const {
  listerBandes,
  obtenirBande,
  creerBande,
  modifierBande,
  archiverBande,
} = require("../controllers/bandeController");

router.get("/", listerBandes);
router.get("/:id", obtenirBande);
router.post("/", creerBande);
router.put("/:id", modifierBande);
router.delete("/:id", archiverBande);

module.exports = router;
