// J'ai simplifié mon accès au maximum : je suis seul à avoir le lien
// de mon application, donc je n'ai pas besoin d'un vrai système
// email/mot de passe. Je me connecte juste avec mon nom, comparé à
// la valeur que j'ai définie dans ma variable d'environnement
// ACCES_NOM sur Render. Pas de base de données impliquée ici, pas de
// mot de passe stocké nulle part.

const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const { verifierChampsObligatoires } = require("../utils/validators");

// Je génère mon token JWT. Comme je suis seul utilisateur, je n'ai
// pas besoin d'y mettre un identifiant de compte : juste une marque
// indiquant que ce token vient bien d'une connexion réussie.
function genererToken(nom) {
  return jwt.sign({ acces: true, nom }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
}

// POST /auth/connexion
// Je compare mon nom (sans tenir compte des majuscules ou des espaces
// en trop) à la valeur attendue définie dans ACCES_NOM.
const connexion = (req, res) => {
  verifierChampsObligatoires(req.body, ["nom"]);
  const { nom } = req.body;

  const nomAttendu = process.env.ACCES_NOM;

  if (!nomAttendu) {
    // Si je n'ai pas encore configuré ACCES_NOM sur Render, je
    // préfère bloquer clairement plutôt que de laisser n'importe qui
    // entrer par accident.
    throw new ApiError(
      500,
      "Je n'ai pas encore configuré mon nom d'accès (ACCES_NOM) sur mon serveur."
    );
  }

  const correspond = nom.trim().toLowerCase() === nomAttendu.trim().toLowerCase();

  if (!correspond) {
    throw new ApiError(401, "Ce nom ne correspond pas, je réessaie.");
  }

  const token = genererToken(nom.trim());

  res.status(200).json({
    succes: true,
    token,
    nom: nom.trim(),
  });
};

// GET /auth/verifier
// Mon frontend appelle cette route au chargement pour vérifier que
// mon token stocké est toujours valide, sans avoir besoin d'aller
// chercher quoi que ce soit en base de données.
const verifier = (req, res) => {
  res.status(200).json({ succes: true, nom: req.user.nom });
};

module.exports = { connexion, verifier };
