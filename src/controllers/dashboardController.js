// C'est la première chose que je vois en me connectant : un résumé
// de tout ce qui compte, sans avoir à naviguer dans chaque module.
// Je regroupe ici des données qui viennent de plusieurs tables.

const prisma = require("../prismaClient");
const asyncHandler = require("../utils/asyncHandler");

// GET /dashboard
const obtenirTableauDeBord = asyncHandler(async (req, res) => {
  const debutMois = new Date();
  debutMois.setDate(1);
  debutMois.setHours(0, 0, 0, 0);

  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);
  const finJour = new Date();
  finJour.setHours(23, 59, 59, 999);

  const dansSeptJours = new Date();
  dansSeptJours.setDate(dansSeptJours.getDate() + 7);

  // Je lance toutes mes requêtes en parallèle avec Promise.all,
  // plutôt que les unes après les autres, pour que mon tableau
  // de bord se charge le plus vite possible.
  const [
    bandesActives,
    articles,
    vaccinationsAVenir,
    tachesDuJour,
    transactionsDuMois,
  ] = await Promise.all([
    prisma.bande.findMany({ where: { statut: "actif" } }),
    prisma.articleStock.findMany(),
    prisma.planningVaccination.findMany({
      where: { statut: "prevue", datePrevue: { lte: dansSeptJours } },
      include: { bande: { select: { code: true } } },
      orderBy: { datePrevue: "asc" },
    }),
    prisma.tache.findMany({
      where: { date: { gte: debutJour, lte: finJour } },
      orderBy: { statut: "asc" },
    }),
    prisma.transactionFinanciere.findMany({ where: { date: { gte: debutMois } } }),
  ]);

  const effectifTotal = bandesActives.reduce((somme, b) => somme + b.effectifActuel, 0);

  const articlesEnAlerte = articles.filter((a) => a.quantiteActuelle <= a.seuilAlerte);

  const depensesDuMois = transactionsDuMois
    .filter((t) => t.type === "depense")
    .reduce((somme, t) => somme + t.montant, 0);

  const revenusDuMois = transactionsDuMois
    .filter((t) => t.type === "revenu")
    .reduce((somme, t) => somme + t.montant, 0);

  res.status(200).json({
    succes: true,
    tableauDeBord: {
      nombreBandesActives: bandesActives.length,
      effectifTotal,
      alertes: {
        stocksEnAlerte: articlesEnAlerte,
        vaccinationsAVenir,
      },
      finances: {
        depensesDuMois,
        revenusDuMois,
        margeNetteDuMois: revenusDuMois - depensesDuMois,
      },
      tachesDuJour,
    },
  });
});

module.exports = { obtenirTableauDeBord };
