// Mes routes d'authentification. Ce sont les seules routes de toute
// mon API qui ne passent pas par mon middleware d'authentification,
// puisque je ne suis justement pas encore connecté à ce stade.

const express = require("express");
const router = express.Router();
const { register, login, moi } = require("../controllers/authController");
const authMiddleware = require("../middlewares/auth");

router.post("/register", register);
router.post("/login", login);
router.get("/moi", authMiddleware, moi);

module.exports = router;
