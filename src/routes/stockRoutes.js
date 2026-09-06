// Mes routes pour la gestion de mes stocks : articles et mouvements.

const express = require("express");
const router = express.Router();
const {
  listerArticles,
  creerArticle,
  modifierArticle,
  supprimerArticle,
  listerMouvements,
  creerMouvement,
  alertesStock,
} = require("../controllers/stockController");

router.get("/articles", listerArticles);
router.post("/articles", creerArticle);
router.put("/articles/:id", modifierArticle);
router.delete("/articles/:id", supprimerArticle);

router.get("/mouvements", listerMouvements);
router.post("/mouvements", creerMouvement);

router.get("/alertes", alertesStock);

module.exports = router;
