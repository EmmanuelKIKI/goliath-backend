// Ici je gère toute ma comptabilité simplifiée : mes dépenses, mes
// revenus, et le calcul de ma rentabilité réelle par bande. C'est
// le module qui me permet enfin de savoir si mon élevage me rapporte
// vraiment de l'argent, au lieu de deviner.

const prisma = require("../prismaClient");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { verifierChampsObligatoires, verifierValeurAutorisee } = require("../utils/validators");

const TYPES_TRANSACTION = ["depense", "revenu"];

// GET /finances/transactions?type=depense&bandeId=xxx&debut=...&fin=...
const listerTransactions = asyncHandler(async (req, res) => {
  const { type, bandeId, debut, fin } = req.query;

  const transactions = await prisma.transactionFinanciere.findMany({
    where: {
      ...(type && { type }),
      ...(bandeId && { bandeId }),
      ...(debut || fin
        ? {
            date: {
              ...(debut && { gte: new Date(debut) }),
              ...(fin && { lte: new Date(fin) }),
            },
          }
        : {}),
    },
    orderBy: { date: "desc" },
    include: { bande: { select: { code: true } } },
  });

  res.status(200).json({ succes: true, transactions });
});

// POST /finances/transactions
const creerTransaction = asyncHandler(async (req, res) => {
  verifierChampsObligatoires(req.body, ["type", "categorie", "montant"]);
  const { type, categorie, montant, date, bandeId, description } = req.body;

  verifierValeurAutorisee(type, TYPES_TRANSACTION, "type");

  if (Number(montant) <= 0) {
    throw new ApiError(400, "Le montant doit être supérieur à zéro.");
  }

  if (bandeId) {
    const bande = await prisma.bande.findUnique({ where: { id: bandeId } });
    if (!bande) {
      throw new ApiError(404, "Je ne retrouve pas cette bande dans ma base de données.");
    }
  }

  const transaction = await prisma.transactionFinanciere.create({
    data: {
      type,
      categorie,
      montant: Number(montant),
      date: date ? new Date(date) : new Date(),
      bandeId: bandeId || null,
      description,
    },
  });

  res.status(201).json({ succes: true, message: "J'ai enregistré cette transaction.", transaction });
});

// PUT /finances/transactions/:id
const modifierTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { categorie, montant, date, description } = req.body;

  const transactionExistante = await prisma.transactionFinanciere.findUnique({ where: { id } });
  if (!transactionExistante) {
    throw new ApiError(404, "Je ne retrouve pas cette transaction.");
  }

  const transaction = await prisma.transactionFinanciere.update({
    where: { id },
    data: {
      ...(categorie && { categorie }),
      ...(montant !== undefined && { montant: Number(montant) }),
      ...(date && { date: new Date(date) }),
      ...(description !== undefined && { description }),
    },
  });

  res.status(200).json({ succes: true, message: "J'ai mis à jour cette transaction.", transaction });
});

// DELETE /finances/transactions/:id
const supprimerTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const transactionExistante = await prisma.transactionFinanciere.findUnique({ where: { id } });
  if (!transactionExistante) {
    throw new ApiError(404, "Je ne retrouve pas cette transaction.");
  }

  await prisma.transactionFinanciere.delete({ where: { id } });

  res.status(200).json({ succes: true, message: "J'ai supprimé cette transaction." });
});

// GET /finances/rentabilite/:bandeId
// Je calcule ici la rentabilité réelle d'une bande précise : toutes
// ses dépenses, tous ses revenus liés, et le coût de revient par
// poulet vendu (utile pour fixer mes prix en connaissance de cause).
const rentabiliteBande = asyncHandler(async (req, res) => {
  const { bandeId } = req.params;

  const bande = await prisma.bande.findUnique({ where: { id: bandeId } });
  if (!bande) {
    throw new ApiError(404, "Je ne retrouve pas cette bande dans ma base de données.");
  }

  const transactions = await prisma.transactionFinanciere.findMany({ where: { bandeId } });

  const totalDepenses = transactions
    .filter((t) => t.type === "depense")
    .reduce((somme, t) => somme + t.montant, 0);

  const totalRevenus = transactions
    .filter((t) => t.type === "revenu")
    .reduce((somme, t) => somme + t.montant, 0);

  const margeNette = totalRevenus - totalDepenses;

  // Je calcule mon coût de revient par poulet sur la base de mon
  // effectif actuel (les poulets encore vivants dans cette bande).
  const coutRevientParPoulet = bande.effectifActuel > 0
    ? Number((totalDepenses / bande.effectifActuel).toFixed(2))
    : 0;

  res.status(200).json({
    succes: true,
    bande: { id: bande.id, code: bande.code },
    totalDepenses,
    totalRevenus,
    margeNette,
    coutRevientParPoulet,
  });
});

// GET /finances/rapport?debut=...&fin=...
// Rapport global sur une période donnée, prêt à être exporté.
const rapportGlobal = asyncHandler(async (req, res) => {
  const { debut, fin } = req.query;

  const filtreDate = {
    ...(debut && { gte: new Date(debut) }),
    ...(fin && { lte: new Date(fin) }),
  };

  const transactions = await prisma.transactionFinanciere.findMany({
    where: Object.keys(filtreDate).length > 0 ? { date: filtreDate } : undefined,
    include: { bande: { select: { code: true } } },
    orderBy: { date: "asc" },
  });

  const totalDepenses = transactions
    .filter((t) => t.type === "depense")
    .reduce((somme, t) => somme + t.montant, 0);

  const totalRevenus = transactions
    .filter((t) => t.type === "revenu")
    .reduce((somme, t) => somme + t.montant, 0);

  res.status(200).json({
    succes: true,
    periode: { debut: debut || null, fin: fin || null },
    totalDepenses,
    totalRevenus,
    margeNette: totalRevenus - totalDepenses,
    transactions,
  });
});

// GET /finances/rapport/export?debut=...&fin=...
// J'exporte mon rapport en CSV, que je peux ouvrir directement dans
// Excel ou l'envoyer à ma banque. Je génère le CSV moi-même, sans
// librairie externe, pour garder le projet simple.
const exporterRapportCSV = asyncHandler(async (req, res) => {
  const { debut, fin } = req.query;

  const filtreDate = {
    ...(debut && { gte: new Date(debut) }),
    ...(fin && { lte: new Date(fin) }),
  };

  const transactions = await prisma.transactionFinanciere.findMany({
    where: Object.keys(filtreDate).length > 0 ? { date: filtreDate } : undefined,
    include: { bande: { select: { code: true } } },
    orderBy: { date: "asc" },
  });

  // J'échappe les virgules et guillemets pour ne pas casser mon CSV
  // si une description contient un caractère spécial.
  const echapper = (valeur) => `"${String(valeur ?? "").replace(/"/g, '""')}"`;

  const entetes = ["Date", "Type", "Categorie", "Montant", "Bande", "Description"];
  const lignes = transactions.map((t) =>
    [
      new Date(t.date).toISOString().split("T")[0],
      t.type,
      t.categorie,
      t.montant,
      t.bande ? t.bande.code : "",
      t.description || "",
    ]
      .map(echapper)
      .join(",")
  );

  const contenuCSV = [entetes.join(","), ...lignes].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=rapport-financier-goliath.csv");
  res.status(200).send(contenuCSV);
});

module.exports = {
  listerTransactions,
  creerTransaction,
  modifierTransaction,
  supprimerTransaction,
  rentabiliteBande,
  rapportGlobal,
  exporterRapportCSV,
};
