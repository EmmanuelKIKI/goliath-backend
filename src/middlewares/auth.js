// Ce middleware protège mes routes : je l'utilise sur toutes les routes
// sauf /auth/login et /auth/register. Il vérifie que la requête contient
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
    // Je stocke l'id et l'email de l'utilisateur connecté pour les
    // réutiliser plus loin dans mes contrôleurs si besoin.
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch (erreur) {
    return next(new ApiError(401, "Mon token est invalide ou a expiré, je dois me reconnecter."));
  }
}

module.exports = authMiddleware;
