// Je crée ma propre classe d'erreur pour pouvoir attacher un code HTTP
// précis à chaque erreur métier que je lève volontairement dans mon code
// (ex: "bande introuvable" -> 404, "email déjà utilisé" -> 409).
// Ça me permet, dans mon middleware d'erreurs, de savoir si c'est une
// erreur que j'ai prévue ou un vrai bug inattendu.

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    // Je marque cette erreur comme "opérationnelle" : c'est une erreur
    // métier normale, pas un crash imprévu de mon code.
    this.isOperational = true;
  }
}

module.exports = ApiError;
