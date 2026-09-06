// Plutôt que d'écrire un try/catch dans chacun de mes contrôleurs,
// j'enveloppe chaque fonction async avec ce petit utilitaire.
// Si une erreur est levée quelque part dans mon controller,
// elle est automatiquement transmise à mon middleware d'erreurs
// via next(error), au lieu de faire planter le serveur.

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
