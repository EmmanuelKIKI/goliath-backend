// Ici je gère mes ventes : poulets vivants, œufs, ou tout autre
// produit de mon élevage. Chaque vente enregistrée crée aussi
// automatiquement une transaction financière de type "revenu",
// pour ne jamais avoir à ressaisir la même information deux fois.

const prisma = require("../prismaClient");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { verifierChampsObligatoires, verifierValeurAutorisee } = require("../utils/validators");

const STATUTS_LIVRAISON = ["en_attente", "livre", "annule"];

// GET /ventes?clientId=xxx
const listerVentes = asyncHandler(async (req, res) => {
  const { clientId } = req.query;

  const ventes = await prisma.vente.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { date: "desc" },
    include: { client: { select: { nom: true } } },
  });

  res.status(200).json({ succes: true, ventes });
});

// POST /ventes
const creerVente = asyncHandler(async (req, res) => {
  verifierChampsObligatoires(req.body, ["clientId", "produit", "quantite", "prixUnitaire"]);
  const { clientId, date, produit, quantite, prixUnitaire } = req.body;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    throw new ApiError(404, "Je ne retrouve pas ce client dans ma base de données.");
  }

  if (Number(quantite) <= 0 || Number(prixUnitaire) <= 0) {
    throw new ApiError(400, "La quantité et le prix unitaire doivent être supérieurs à zéro.");
  }

  const montantTotal = Number(quantite) * Number(prixUnitaire);

  // Je crée la vente ET la transaction financière correspondante
  // dans une seule transaction en base, pour garder mes chiffres
  // toujours cohérents entre le module ventes et le module finances.
  const resultat = await prisma.$transaction(async (tx) => {
    const vente = await tx.vente.create({
      data: {
        clientId,
        date: date ? new Date(date) : new Date(),
        produit,
        quantite: Number(quantite),
        prixUnitaire: Number(prixUnitaire),
        montantTotal,
      },
    });

    await tx.transactionFinanciere.create({
      data: {
        type: "revenu",
        categorie: "vente",
        montant: montantTotal,
        date: vente.date,
        description: `Vente de ${quantite} ${produit} à ${client.nom}`,
      },
    });

    return vente;
  });

  res.status(201).json({ succes: true, message: "J'ai enregistré cette vente.", vente: resultat });
});

// PUT /ventes/:id
// Je m'en sers principalement pour mettre à jour le statut de livraison.
const modifierVente = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { statutLivraison } = req.body;

  const venteExistante = await prisma.vente.findUnique({ where: { id } });
  if (!venteExistante) {
    throw new ApiError(404, "Je ne retrouve pas cette vente.");
  }

  if (statutLivraison) {
    verifierValeurAutorisee(statutLivraison, STATUTS_LIVRAISON, "statutLivraison");
  }

  const vente = await prisma.vente.update({
    where: { id },
    data: { ...(statutLivraison && { statutLivraison }) },
  });

  res.status(200).json({ succes: true, message: "J'ai mis à jour cette vente.", vente });
});

// DELETE /ventes/:id
const supprimerVente = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const venteExistante = await prisma.vente.findUnique({ where: { id } });
  if (!venteExistante) {
    throw new ApiError(404, "Je ne retrouve pas cette vente.");
  }

  await prisma.vente.delete({ where: { id } });

  res.status(200).json({ succes: true, message: "J'ai supprimé cette vente." });
});

module.exports = { listerVentes, creerVente, modifierVente, supprimerVente };
