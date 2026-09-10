// Ce middleware protège mes routes : je l'utilise sur toutes les routes
// sauf /auth/connexion. Il vérifie que la requête contient
// un token JWT valide, et si oui, il attache mes infos d'utilisateur
// à req.user pour que mes contrôleurs puissent les utiliser.

const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");

function authMiddleware(req, res, next) {
  const enTete = req.headers.authorization;

  // Je m'attends à recevoir un header du type "Authorization: Bearer <token>".
  if (!enTete || !enTete.startsWith("Bearer ")) {
    return next(new ApiError(401, "Je n'ai pas trouvé de token d'authentification, connecte-toi d'abord."));
  }

  const token = enTete.split(" ")[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Comme je suis seul utilisateur, mon token ne contient que mon
    // nom, pas d'identifiant de compte en base de données.
    req.user = { nom: payload.nom };
    next();
  } catch (erreur) {
    return next(new ApiError(401, "Mon token est invalide ou a expiré, je dois me reconnecter."));
  }
}

module.exports = authMiddleware;
