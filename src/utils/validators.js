// Je garde mes validations simples et manuelles plutôt que d'ajouter une
// grosse librairie de validation. Pour la taille de mon projet, c'est
// largement suffisant et je comprends exactement ce qui se passe.

const ApiError = require("./ApiError");

// Je vérifie que tous les champs obligatoires que je liste sont bien
// présents dans le corps de la requête, sinon je bloque tout de suite
// avec un message clair plutôt que de laisser une erreur bizarre
// remonter plus tard dans mon code.
function verifierChampsObligatoires(body, champs) {
  const manquants = champs.filter((champ) => {
    const valeur = body[champ];
    return valeur === undefined || valeur === null || valeur === "";
  });

  if (manquants.length > 0) {
    throw new ApiError(
      400,
      `Il me manque des champs obligatoires : ${manquants.join(", ")}`
    );
  }
}

// Je vérifie qu'une valeur fait bien partie d'une liste de valeurs
// autorisées (ex: le "type" d'un mouvement de stock doit être
// "entree" ou "sortie", rien d'autre).
function verifierValeurAutorisee(valeur, valeursAutorisees, nomChamp) {
  if (!valeursAutorisees.includes(valeur)) {
    throw new ApiError(
      400,
      `La valeur "${valeur}" n'est pas valide pour "${nomChamp}". Valeurs acceptées : ${valeursAutorisees.join(", ")}`
    );
  }
}

// Je vérifie qu'un email a un format basique correct.
// Ce n'est pas parfait, mais ça évite les erreurs de saisie évidentes.
function estEmailValide(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = {
  verifierChampsObligatoires,
  verifierValeurAutorisee,
  estEmailValide,
};
