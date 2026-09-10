// Mes routes d'accès. Une seule route publique (connexion), et une
// route protégée (vérifier) pour que mon frontend confirme que mon
// token stocké est toujours valide.

const express = require("express");
const router = express.Router();
const { connexion, verifier } = require("../controllers/authController");
const authMiddleware = require("../middlewares/auth");

router.post("/connexion", connexion);
router.get("/verifier", authMiddleware, verifier);

module.exports = router;
