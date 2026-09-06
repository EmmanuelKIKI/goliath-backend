// C'est ici que je gère mon inscription et ma connexion.
// Pour cette version, je suis le seul utilisateur de la plateforme,
// donc je bloque volontairement la création d'un deuxième compte.
// Le jour où je veux ouvrir ça à d'autres personnes, il me suffira
// de retirer cette limite.

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../prismaClient");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { verifierChampsObligatoires, estEmailValide } = require("../utils/validators");

// Je génère un token JWT signé avec mon secret, valable pour la
// durée définie dans mon .env (7 jours par défaut).
function genererToken(utilisateur) {
  return jwt.sign(
    { id: utilisateur.id, email: utilisateur.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

// POST /auth/register
// Je n'appelle cette route qu'une seule fois, pour créer mon propre
// compte au tout premier lancement de la plateforme.
const register = asyncHandler(async (req, res) => {
  verifierChampsObligatoires(req.body, ["nom", "email", "motDePasse"]);
  const { nom, email, motDePasse } = req.body;

  if (!estEmailValide(email)) {
    throw new ApiError(400, "Mon adresse email n'a pas un format valide.");
  }

  if (motDePasse.length < 8) {
    throw new ApiError(400, "Mon mot de passe doit contenir au moins 8 caractères.");
  }

  // Je vérifie qu'il n'existe pas déjà un compte avec cet email.
  const dejaExistant = await prisma.utilisateur.findUnique({ where: { email } });
  if (dejaExistant) {
    throw new ApiError(409, "Un compte existe déjà avec cet email.");
  }

  // Je bloque volontairement la création de plusieurs comptes pour
  // cette version solo de la plateforme.
  const nombreUtilisateurs = await prisma.utilisateur.count();
  if (nombreUtilisateurs >= 1) {
    throw new ApiError(
      403,
      "Un compte existe déjà sur cette instance de GOLIATH. Cette version est prévue pour un seul utilisateur."
    );
  }

  // Je hash mon mot de passe avant de le stocker : je ne garde
  // jamais un mot de passe en clair dans ma base de données.
  const motDePasseHash = await bcrypt.hash(motDePasse, 10);

  const utilisateur = await prisma.utilisateur.create({
    data: { nom, email, motDePasseHash },
  });

  const token = genererToken(utilisateur);

  res.status(201).json({
    succes: true,
    message: "Mon compte a été créé avec succès.",
    token,
    utilisateur: { id: utilisateur.id, nom: utilisateur.nom, email: utilisateur.email },
  });
});

// POST /auth/login
const login = asyncHandler(async (req, res) => {
  verifierChampsObligatoires(req.body, ["email", "motDePasse"]);
  const { email, motDePasse } = req.body;

  const utilisateur = await prisma.utilisateur.findUnique({ where: { email } });
  if (!utilisateur) {
    throw new ApiError(401, "Email ou mot de passe incorrect.");
  }

  const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.motDePasseHash);
  if (!motDePasseValide) {
    throw new ApiError(401, "Email ou mot de passe incorrect.");
  }

  const token = genererToken(utilisateur);

  res.status(200).json({
    succes: true,
    token,
    utilisateur: { id: utilisateur.id, nom: utilisateur.nom, email: utilisateur.email },
  });
});

// GET /auth/moi
// Petite route pratique pour que mon frontend vérifie si mon token
// est toujours valide et récupère mes infos de profil.
const moi = asyncHandler(async (req, res) => {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: req.user.id },
    select: { id: true, nom: true, email: true, dateCreation: true },
  });

  if (!utilisateur) {
    throw new ApiError(404, "Je ne retrouve plus mon compte utilisateur.");
  }

  res.status(200).json({ succes: true, utilisateur });
});

module.exports = { register, login, moi };
