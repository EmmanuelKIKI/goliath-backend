// Ici je gère mon inventaire : mes articles de stock (aliments,
// médicaments, litière...) et tous les mouvements d'entrée/sortie.
// C'est ce module qui me permet de ne jamais me retrouver à court
// d'aliment sans l'avoir vu venir.

const prisma = require("../prismaClient");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { verifierChampsObligatoires, verifierValeurAutorisee } = require("../utils/validators");

const CATEGORIES_STOCK = ["aliment", "medicament", "litiere", "autre"];
const TYPES_MOUVEMENT = ["entree", "sortie"];

// GET /stocks/articles
const listerArticles = asyncHandler(async (req, res) => {
  const articles = await prisma.articleStock.findMany({
    orderBy: { nom: "asc" },
  });

  // Je calcule directement ici quels articles sont sous leur seuil
  // d'alerte, pour que mon frontend n'ait pas à refaire ce calcul.
  const articlesAvecAlerte = articles.map((article) => ({
    ...article,
    enAlerte: article.quantiteActuelle <= article.seuilAlerte,
  }));

  res.status(200).json({ succes: true, articles: articlesAvecAlerte });
});

// POST /stocks/articles
const creerArticle = asyncHandler(async (req, res) => {
  verifierChampsObligatoires(req.body, ["nom", "categorie", "unite"]);
  const { nom, categorie, unite, quantiteActuelle, seuilAlerte } = req.body;

  verifierValeurAutorisee(categorie, CATEGORIES_STOCK, "categorie");

  const article = await prisma.articleStock.create({
    data: {
      nom,
      categorie,
      unite,
      quantiteActuelle: quantiteActuelle ? Number(quantiteActuelle) : 0,
      seuilAlerte: seuilAlerte ? Number(seuilAlerte) : 0,
    },
  });

  res.status(201).json({ succes: true, message: "J'ai ajouté ce nouvel article à mon stock.", article });
});

// PUT /stocks/articles/:id
const modifierArticle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nom, categorie, unite, seuilAlerte } = req.body;

  const articleExistant = await prisma.articleStock.findUnique({ where: { id } });
  if (!articleExistant) {
    throw new ApiError(404, "Je ne retrouve pas cet article dans mon stock.");
  }

  if (categorie) {
    verifierValeurAutorisee(categorie, CATEGORIES_STOCK, "categorie");
  }

  const article = await prisma.articleStock.update({
    where: { id },
    data: {
      ...(nom && { nom }),
      ...(categorie && { categorie }),
      ...(unite && { unite }),
      ...(seuilAlerte !== undefined && { seuilAlerte: Number(seuilAlerte) }),
    },
  });

  res.status(200).json({ succes: true, message: "J'ai mis à jour cet article.", article });
});

// DELETE /stocks/articles/:id
const supprimerArticle = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const articleExistant = await prisma.articleStock.findUnique({ where: { id } });
  if (!articleExistant) {
    throw new ApiError(404, "Je ne retrouve pas cet article dans mon stock.");
  }

  await prisma.articleStock.delete({ where: { id } });

  res.status(200).json({ succes: true, message: "J'ai supprimé cet article de mon stock." });
});

// GET /stocks/mouvements?articleId=xxx&bandeId=xxx
const listerMouvements = asyncHandler(async (req, res) => {
  const { articleId, bandeId } = req.query;

  const mouvements = await prisma.mouvementStock.findMany({
    where: {
      ...(articleId && { articleId }),
      ...(bandeId && { bandeId }),
    },
    orderBy: { date: "desc" },
    include: {
      article: { select: { nom: true, unite: true } },
      bande: { select: { code: true } },
    },
  });

  res.status(200).json({ succes: true, mouvements });
});

// POST /stocks/mouvements
// C'est ici que se passe la vraie logique métier : chaque mouvement
// que j'enregistre met automatiquement à jour la quantité actuelle
// de l'article concerné. Je fais ça dans une transaction pour être
// certain que mon stock reste toujours cohérent avec mon historique.
const creerMouvement = asyncHandler(async (req, res) => {
  verifierChampsObligatoires(req.body, ["articleId", "type", "quantite"]);
  const { articleId, type, quantite, date, bandeId, coutUnitaire } = req.body;

  verifierValeurAutorisee(type, TYPES_MOUVEMENT, "type");

  if (Number(quantite) <= 0) {
    throw new ApiError(400, "La quantité doit être supérieure à zéro.");
  }

  const article = await prisma.articleStock.findUnique({ where: { id: articleId } });
  if (!article) {
    throw new ApiError(404, "Je ne retrouve pas cet article dans mon stock.");
  }

  // Si c'est une sortie, je vérifie que j'ai bien assez de stock
  // disponible avant de valider le mouvement.
  if (type === "sortie" && Number(quantite) > article.quantiteActuelle) {
    throw new ApiError(
      400,
      `Je n'ai que ${article.quantiteActuelle} ${article.unite} de "${article.nom}" en stock, je ne peux pas en sortir ${quantite}.`
    );
  }

  if (bandeId) {
    const bande = await prisma.bande.findUnique({ where: { id: bandeId } });
    if (!bande) {
      throw new ApiError(404, "Je ne retrouve pas cette bande dans ma base de données.");
    }
  }

  const resultat = await prisma.$transaction(async (tx) => {
    const mouvement = await tx.mouvementStock.create({
      data: {
        articleId,
        type,
        quantite: Number(quantite),
        date: date ? new Date(date) : new Date(),
        bandeId: bandeId || null,
        coutUnitaire: coutUnitaire ? Number(coutUnitaire) : null,
      },
    });

    // J'ajoute ou je retire la quantité selon le type de mouvement.
    const nouvelleQuantite =
      type === "entree"
        ? article.quantiteActuelle + Number(quantite)
        : article.quantiteActuelle - Number(quantite);

    await tx.articleStock.update({
      where: { id: articleId },
      data: { quantiteActuelle: nouvelleQuantite },
    });

    return mouvement;
  });

  res.status(201).json({
    succes: true,
    message: "J'ai enregistré ce mouvement de stock.",
    mouvement: resultat,
  });
});

// GET /stocks/alertes
// Je récupère ici tous les articles sous leur seuil, pour mon
// tableau de bord.
const alertesStock = asyncHandler(async (req, res) => {
  const articles = await prisma.articleStock.findMany();
  const enAlerte = articles.filter((a) => a.quantiteActuelle <= a.seuilAlerte);

  res.status(200).json({ succes: true, articlesEnAlerte: enAlerte });
});

module.exports = {
  listerArticles,
  creerArticle,
  modifierArticle,
  supprimerArticle,
  listerMouvements,
  creerMouvement,
  alertesStock,
};
