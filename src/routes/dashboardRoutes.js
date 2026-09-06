// Ma route de tableau de bord, qui agrège les données de plusieurs
// modules en une seule réponse.

const express = require("express");
const router = express.Router();
const { obtenirTableauDeBord } = require("../controllers/dashboardController");

router.get("/", obtenirTableauDeBord);

module.exports = router;
