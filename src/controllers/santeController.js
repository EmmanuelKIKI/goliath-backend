// Ici je gère tout mon suivi sanitaire : le journal d'événements
// (vaccination, maladie, traitement, décès), le calendrier de
// vaccination, et le calcul de mes taux de mortalité.

const prisma = require("../prismaClient");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { verifierChampsObligatoires, verifierValeurAutorisee } = require("../utils/validators");

const TYPES_EVENEMENT = ["vaccination", "maladie", "traitement", "deces"];

// GET /bandes/:bandeId/journal-sanitaire
const listerJournalSanitaire = asyncHandler(async (req, res) => {
  const { bandeId } = req.params;

  const evenements = await prisma.journalSanitaire.findMany({
    where: { bandeId },
    orderBy: { date: "desc" },
  });

  res.status(200).json({ succes: true, evenements });
});

// POST /bandes/:bandeId/journal-sanitaire
// Quand j'ajoute un événement de type "deces", je mets aussi à jour
// automatiquement l'effectif actuel de ma bande pour ne pas avoir à
// le faire manuellement à deux endroits différents.
const ajouterEvenementSanitaire = asyncHandler(async (req, res) => {
  const { bandeId } = req.params;
  verifierChampsObligatoires(req.body, ["date", "type"]);
  const { date, type, description, nombreConcerne, cout } = req.body;

  verifierValeurAutorisee(type, TYPES_EVENEMENT, "type");

  const bande = await prisma.bande.findUnique({ where: { id: bandeId } });
  if (!bande) {
    throw new ApiError(404, "Je ne retrouve pas cette bande dans ma base de données.");
  }

  // J'utilise une transaction pour être sûr que l'événement sanitaire
  // ET la mise à jour de l'effectif se font ensemble, ou pas du tout.
  const resultat = await prisma.$transaction(async (tx) => {
    const evenement = await tx.journalSanitaire.create({
      data: {
        bandeId,
        date: new Date(date),
        type,
        description,
        nombreConcerne: nombreConcerne ? Number(nombreConcerne) : null,
        cout: cout ? Number(cout) : null,
      },
    });

    // Si c'est un décès, je retire automatiquement le nombre concerné
    // de mon effectif actuel, sans jamais descendre en dessous de zéro.
    if (type === "deces" && nombreConcerne) {
      const nouvelEffectif = Math.max(0, bande.effectifActuel - Number(nombreConcerne));
      await tx.bande.update({
        where: { id: bandeId },
        data: { effectifActuel: nouvelEffectif },
      });
    }

    return evenement;
  });

  res.status(201).json({
    succes: true,
    message: "J'ai enregistré cet événement sanitaire.",
    evenement: resultat,
  });
});

// GET /bandes/:bandeId/mortalite
// Je calcule ici mon taux de mortalité et l'évolution dans le temps,
// pour repérer rapidement si une bande a un problème anormal.
const obtenirMortalite = asyncHandler(async (req, res) => {
  const { bandeId } = req.params;

  const bande = await prisma.bande.findUnique({ where: { id: bandeId } });
  if (!bande) {
    throw new ApiError(404, "Je ne retrouve pas cette bande dans ma base de données.");
  }

  const deces = await prisma.journalSanitaire.findMany({
    where: { bandeId, type: "deces" },
    orderBy: { date: "asc" },
  });

  const totalDeces = deces.reduce((somme, evt) => somme + (evt.nombreConcerne || 0), 0);
  const tauxMortalite = bande.effectifInitial > 0
    ? Number(((totalDeces / bande.effectifInitial) * 100).toFixed(2))
    : 0;

  // Je construis une courbe cumulée des décès dans le temps, prête
  // à être affichée telle quelle dans un graphique côté frontend.
  let cumul = 0;
  const courbe = deces.map((evt) => {
    cumul += evt.nombreConcerne || 0;
    return { date: evt.date, decesCumules: cumul };
  });

  res.status(200).json({
    succes: true,
    effectifInitial: bande.effectifInitial,
    effectifActuel: bande.effectifActuel,
    totalDeces,
    tauxMortalite,
    courbe,
  });
});

// GET /vaccinations?bandeId=xxx
const listerVaccinations = asyncHandler(async (req, res) => {
  const { bandeId } = req.query;

  const vaccinations = await prisma.planningVaccination.findMany({
    where: bandeId ? { bandeId } : undefined,
    orderBy: { datePrevue: "asc" },
    include: { bande: { select: { code: true } } },
  });

  res.status(200).json({ succes: true, vaccinations });
});

// POST /vaccinations
const planifierVaccination = asyncHandler(async (req, res) => {
  verifierChampsObligatoires(req.body, ["bandeId", "nomVaccin", "datePrevue"]);
  const { bandeId, nomVaccin, datePrevue } = req.body;

  const bande = await prisma.bande.findUnique({ where: { id: bandeId } });
  if (!bande) {
    throw new ApiError(404, "Je ne retrouve pas cette bande dans ma base de données.");
  }

  const vaccination = await prisma.planningVaccination.create({
    data: { bandeId, nomVaccin, datePrevue: new Date(datePrevue) },
  });

  res.status(201).json({ succes: true, message: "J'ai planifié cette vaccination.", vaccination });
});

// PUT /vaccinations/:id
// Je m'en sers surtout pour marquer une vaccination comme "faite"
// une fois que je l'ai réellement effectuée.
const modifierVaccination = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { dateEffectuee, statut } = req.body;

  const vaccinationExistante = await prisma.planningVaccination.findUnique({ where: { id } });
  if (!vaccinationExistante) {
    throw new ApiError(404, "Je ne retrouve pas cette vaccination planifiée.");
  }

  if (statut) {
    verifierValeurAutorisee(statut, ["prevue", "faite", "en_retard"], "statut");
  }

  const vaccination = await prisma.planningVaccination.update({
    where: { id },
    data: {
      ...(dateEffectuee && { dateEffectuee: new Date(dateEffectuee) }),
      ...(statut && { statut }),
    },
  });

  res.status(200).json({ succes: true, message: "J'ai mis à jour cette vaccination.", vaccination });
});

// GET /vaccinations/alertes
// Je liste ici mes vaccinations prévues dans les 7 prochains jours
// (ou déjà en retard), pour les afficher sur mon tableau de bord.
const alertesVaccination = asyncHandler(async (req, res) => {
  const dansSeptJours = new Date();
  dansSeptJours.setDate(dansSeptJours.getDate() + 7);

  const alertes = await prisma.planningVaccination.findMany({
    where: {
      statut: "prevue",
      datePrevue: { lte: dansSeptJours },
    },
    orderBy: { datePrevue: "asc" },
    include: { bande: { select: { code: true } } },
  });

  res.status(200).json({ succes: true, alertes });
});

module.exports = {
  listerJournalSanitaire,
  ajouterEvenementSanitaire,
  obtenirMortalite,
  listerVaccinations,
  planifierVaccination,
  modifierVaccination,
  alertesVaccination,
};
