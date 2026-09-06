// Ce petit script me permet de créer mon compte utilisateur directement
// en base de données, sans passer par la route /auth/register. C'est
// pratique si je veux initialiser mon compte avant même d'avoir lancé
// mon frontend. Je le lance avec : npm run prisma:seed
//
// Je modifie les valeurs ci-dessous avec mes vraies informations
// avant de lancer le script.

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const nombreUtilisateurs = await prisma.utilisateur.count();

  if (nombreUtilisateurs > 0) {
    console.log("J'ai déjà un compte utilisateur dans ma base, je ne fais rien.");
    return;
  }

  const motDePasseHash = await bcrypt.hash("ChangeMoiRapidement123", 10);

  const utilisateur = await prisma.utilisateur.create({
    data: {
      nom: "Jean Kiki",
      email: "jean@goliath.local",
      motDePasseHash,
    },
  });

  console.log("J'ai créé mon compte initial :", utilisateur.email);
  console.log("Mot de passe temporaire : ChangeMoiRapidement123");
  console.log("Je pense à le changer dès ma première connexion !");
}

main()
  .catch((erreur) => {
    console.error("Une erreur est survenue pendant le seed :", erreur);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
