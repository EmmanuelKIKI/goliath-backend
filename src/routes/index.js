// Ce fichier assemble toutes mes routes en un seul endroit. Je protège
// ici tout ce qui doit l'être avec mon middleware d'authentification,
// pour ne pas avoir à le répéter dans chaque fichier de routes.

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");

const authRoutes = require("./authRoutes");
const bandeRoutes = require("./bandeRoutes");
const santeRoutes = require("./santeRoutes");
const vaccinationRoutes = require("./vaccinationRoutes");
const stockRoutes = require("./stockRoutes");
const financeRoutes = require("./financeRoutes");
const clientRoutes = require("./clientRoutes");
const venteRoutes = require("./venteRoutes");
const tacheRoutes = require("./tacheRoutes");
const dashboardRoutes = require("./dashboardRoutes");

// Mes routes d'authentification ne sont pas protégées : c'est
// justement elles qui me permettent d'obtenir mon token.
router.use("/auth", authRoutes);

// Toutes mes autres routes exigent d'être connecté. J'applique le
// middleware directement ici plutôt que dans index.js pour garder
// index.js le plus simple possible.
router.use("/bandes", authMiddleware, bandeRoutes);
router.use("/bandes/:bandeId", authMiddleware, santeRoutes);
router.use("/vaccinations", authMiddleware, vaccinationRoutes);
router.use("/stocks", authMiddleware, stockRoutes);
router.use("/finances", authMiddleware, financeRoutes);
router.use("/clients", authMiddleware, clientRoutes);
router.use("/ventes", authMiddleware, venteRoutes);
router.use("/taches", authMiddleware, tacheRoutes);
router.use("/dashboard", authMiddleware, dashboardRoutes);

module.exports = router;
