// Je centralise toute la gestion d'erreurs ici. Comme ça, dans mes
// contrôleurs, je n'ai qu'à faire "throw new ApiError(...)" ou laisser
// une erreur remonter, et c'est ce middleware qui décide quoi répondre
// au client. Il doit être déclaré en dernier dans index.js, après
// toutes mes routes.

function errorHandler(err, req, res, next) {
  // Si c'est une erreur métier que j'ai levée moi-même (ApiError),
  // j'utilise son code HTTP. Sinon, c'est un bug inattendu -> 500.
  const statusCode = err.statusCode || 500;
  const message = err.isOperational
    ? err.message
    : "Une erreur inattendue est survenue de mon côté, je vérifie mes logs serveur.";

  // Je log toujours l'erreur complète côté serveur pour pouvoir
  // déboguer, même si je renvoie un message plus doux au client.
  if (!err.isOperational) {
    console.error("[ERREUR NON PRÉVUE]", err);
  }

  res.status(statusCode).json({
    succes: false,
    message,
  });
}

module.exports = errorHandler;
