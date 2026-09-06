// Ici je gère mes bandes de poulets : c'est l'entité centrale de toute
// mon application, presque toutes mes autres données s'y rattachent.

const prisma = require("../prismaClient");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { verifierChampsObligatoires, verifierValeurAutorisee } = require("../utils/validators");

// GET /bandes
// Je liste toutes mes bandes, avec un filtre optionnel par statut
// (?statut=actif ou ?statut=archive) pour ne pas être noyé par
// mes vieilles bandes archivées.
const listerBandes = asyncHandler(async (req, res) => {
  const { statut } = req.query;

  const bandes = await prisma.bande.findMany({
    where: statut ? { statut } : undefined,
    orderBy: { dateArrivee: "desc" },
  });

  res.status(200).json({ succes: true, bandes });
});

// GET /bandes/:id
// Je récupère le détail complet d'une bande avec son historique
// sanitaire et ses derniers mouvements de stock, pour avoir une
// vue complète sur une seule page.
const obtenirBande = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const bande = await prisma.bande.findUnique({
    where: { id },
    include: {
      journalSanitaire: { orderBy: { date: "desc" } },
      planningVaccination: { orderBy: { datePrevue: "asc" } },
      mouvementsStock: { orderBy: { date: "desc" }, take: 20 },
      transactions: { orderBy: { date: "desc" }, take: 20 },
      taches: { orderBy: { date: "asc" } },
    },
  });

  if (!bande) {
    throw new ApiError(404, "Je ne retrouve pas cette bande dans ma base de données.");
  }

  res.status(200).json({ succes: true, bande });
});

// POST /bandes
const creerBande = asyncHandler(async (req, res) => {
  verifierChampsObligatoires(req.body, ["code", "dateArrivee", "effectifInitial", "origine"]);
  const { code, dateArrivee, effectifInitial, origine } = req.body;

  if (effectifInitial <= 0) {
    throw new ApiError(400, "L'effectif initial doit être supérieur à zéro.");
  }

  // Je vérifie que je n'utilise pas deux fois le même code de bande,
  // pour éviter de mélanger mes suivis.
  const codeExistant = await prisma.bande.findUnique({ where: { code } });
  if (codeExistant) {
    throw new ApiError(409, `J'ai déjà une bande avec le code "${code}".`);
  }

  const bande = await prisma.bande.create({
    data: {
      code,
      dateArrivee: new Date(dateArrivee),
      effectifInitial: Number(effectifInitial),
      effectifActuel: Number(effectifInitial), // au départ, effectif actuel = effectif initial
      origine,
    },
  });

  res.status(201).json({ succes: true, message: "Ma nouvelle bande a été créée.", bande });
});

// PUT /bandes/:id
const modifierBande = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { code, dateArrivee, effectifActuel, origine, statut } = req.body;

  const bandeExistante = await prisma.bande.findUnique({ where: { id } });
  if (!bandeExistante) {
    throw new ApiError(404, "Je ne retrouve pas cette bande dans ma base de données.");
  }

  if (statut) {
    verifierValeurAutorisee(statut, ["actif", "archive"], "statut");
  }

  const bande = await prisma.bande.update({
    where: { id },
    data: {
      ...(code && { code }),
      ...(dateArrivee && { dateArrivee: new Date(dateArrivee) }),
      ...(effectifActuel !== undefined && { effectifActuel: Number(effectifActuel) }),
      ...(origine && { origine }),
      ...(statut && { statut }),
    },
  });

  res.status(200).json({ succes: true, message: "Ma bande a été mise à jour.", bande });
});

// DELETE /bandes/:id
// Je préfère archiver une bande plutôt que la supprimer définitivement,
// pour garder tout mon historique. Cette route fait donc un archivage,
// pas une vraie suppression en base.
const archiverBande = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const bandeExistante = await prisma.bande.findUnique({ where: { id } });
  if (!bandeExistante) {
    throw new ApiError(404, "Je ne retrouve pas cette bande dans ma base de données.");
  }

  const bande = await prisma.bande.update({
    where: { id },
    data: { statut: "archive" },
  });

  res.status(200).json({ succes: true, message: "Ma bande a été archivée.", bande });
});

module.exports = { listerBandes, obtenirBande, creerBande, modifierBande, archiverBande };
