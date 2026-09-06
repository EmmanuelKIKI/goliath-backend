// Ici je gère mes tâches quotidiennes. Je gère la ferme seul pour
// l'instant donc il n'y a pas d'assignation à un employé : je crée
// mes tâches, je les fais, je les coche. Je gère aussi la récurrence
// pour ne pas avoir à recréer chaque semaine les mêmes tâches.

const prisma = require("../prismaClient");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { verifierChampsObligatoires, verifierValeurAutorisee } = require("../utils/validators");

const STATUTS_TACHE = ["a_faire", "fait"];
const RECURRENCES = ["quotidien", "hebdomadaire", "mensuel"];

// GET /taches?date=today&statut=a_faire&bandeId=xxx
// Le paramètre "date" accepte soit "today" pour mes tâches du jour,
// soit une date précise au format ISO (YYYY-MM-DD).
const listerTaches = asyncHandler(async (req, res) => {
  const { date, statut, bandeId } = req.query;

  let filtreDate;
  if (date === "today") {
    const debutJour = new Date();
    debutJour.setHours(0, 0, 0, 0);
    const finJour = new Date();
    finJour.setHours(23, 59, 59, 999);
    filtreDate = { gte: debutJour, lte: finJour };
  } else if (date) {
    const debutJour = new Date(date);
    debutJour.setHours(0, 0, 0, 0);
    const finJour = new Date(date);
    finJour.setHours(23, 59, 59, 999);
    filtreDate = { gte: debutJour, lte: finJour };
  }

  const taches = await prisma.tache.findMany({
    where: {
      ...(filtreDate && { date: filtreDate }),
      ...(statut && { statut }),
      ...(bandeId && { bandeId }),
    },
    orderBy: { date: "asc" },
    include: { bande: { select: { code: true } } },
  });

  res.status(200).json({ succes: true, taches });
});

// POST /taches
const creerTache = asyncHandler(async (req, res) => {
  verifierChampsObligatoires(req.body, ["description", "date"]);
  const { description, date, bandeId, recurrence } = req.body;

  if (recurrence) {
    verifierValeurAutorisee(recurrence, RECURRENCES, "recurrence");
  }

  if (bandeId) {
    const bande = await prisma.bande.findUnique({ where: { id: bandeId } });
    if (!bande) {
      throw new ApiError(404, "Je ne retrouve pas cette bande dans ma base de données.");
    }
  }

  const tache = await prisma.tache.create({
    data: {
      description,
      date: new Date(date),
      bandeId: bandeId || null,
      recurrence: recurrence || null,
    },
  });

  res.status(201).json({ succes: true, message: "J'ai ajouté cette tâche.", tache });
});

// PUT /taches/:id
const modifierTache = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { description, date, statut } = req.body;

  const tacheExistante = await prisma.tache.findUnique({ where: { id } });
  if (!tacheExistante) {
    throw new ApiError(404, "Je ne retrouve pas cette tâche.");
  }

  if (statut) {
    verifierValeurAutorisee(statut, STATUTS_TACHE, "statut");
  }

  const tache = await prisma.tache.update({
    where: { id },
    data: {
      ...(description && { description }),
      ...(date && { date: new Date(date) }),
      ...(statut && { statut }),
    },
  });

  res.status(200).json({ succes: true, message: "J'ai mis à jour cette tâche.", tache });
});

// DELETE /taches/:id
const supprimerTache = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const tacheExistante = await prisma.tache.findUnique({ where: { id } });
  if (!tacheExistante) {
    throw new ApiError(404, "Je ne retrouve pas cette tâche.");
  }

  await prisma.tache.delete({ where: { id } });

  res.status(200).json({ succes: true, message: "J'ai supprimé cette tâche." });
});

module.exports = { listerTaches, creerTache, modifierTache, supprimerTache };
