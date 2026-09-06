// Ici je gère mes fiches clients : rien de compliqué, juste de quoi
// retrouver rapidement qui achète chez moi et son historique.

const prisma = require("../prismaClient");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { verifierChampsObligatoires } = require("../utils/validators");

// GET /clients
const listerClients = asyncHandler(async (req, res) => {
  const clients = await prisma.client.findMany({
    orderBy: { nom: "asc" },
  });

  res.status(200).json({ succes: true, clients });
});

// GET /clients/:id
// Je récupère la fiche client avec tout son historique d'achats.
const obtenirClient = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: { ventes: { orderBy: { date: "desc" } } },
  });

  if (!client) {
    throw new ApiError(404, "Je ne retrouve pas ce client dans ma base de données.");
  }

  res.status(200).json({ succes: true, client });
});

// POST /clients
const creerClient = asyncHandler(async (req, res) => {
  verifierChampsObligatoires(req.body, ["nom"]);
  const { nom, contact } = req.body;

  const client = await prisma.client.create({ data: { nom, contact } });

  res.status(201).json({ succes: true, message: "J'ai ajouté ce nouveau client.", client });
});

// PUT /clients/:id
const modifierClient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nom, contact } = req.body;

  const clientExistant = await prisma.client.findUnique({ where: { id } });
  if (!clientExistant) {
    throw new ApiError(404, "Je ne retrouve pas ce client dans ma base de données.");
  }

  const client = await prisma.client.update({
    where: { id },
    data: { ...(nom && { nom }), ...(contact !== undefined && { contact }) },
  });

  res.status(200).json({ succes: true, message: "J'ai mis à jour cette fiche client.", client });
});

// DELETE /clients/:id
const supprimerClient = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const clientExistant = await prisma.client.findUnique({ where: { id } });
  if (!clientExistant) {
    throw new ApiError(404, "Je ne retrouve pas ce client dans ma base de données.");
  }

  await prisma.client.delete({ where: { id } });

  res.status(200).json({ succes: true, message: "J'ai supprimé ce client." });
});

module.exports = { listerClients, obtenirClient, creerClient, modifierClient, supprimerClient };
