// Ce script crée mon compte utilisateur automatiquement, à partir de
// variables d'environnement — plus besoin de taper une commande curl
// ou Invoke-RestMethod à la main après le déploiement. Je le lance :
// - automatiquement à chaque démarrage sur Render (voir render.yaml
//   et le "Start Command"), il ne fait rien si un compte existe déjà
// - ou manuellement en local avec : npm run prisma:seed

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Je lis mes identifiants depuis mes variables d'environnement. Si je
// ne les définis pas, j'utilise des valeurs par défaut clairement
// temporaires, pour ne jamais me retrouver bloqué même si j'oublie
// de les configurer.
const NOM = process.env.SEED_NOM || "Emmanuel KIKI";
const EMAIL = process.env.SEED_EMAIL || "dotomikiki@gmail.com";
const MOT_DE_PASSE = process.env.SEED_MOT_DE_PASSE || "perpetue";

async function main() {
  const nombreUtilisateurs = await prisma.utilisateur.count();

  if (nombreUtilisateurs > 0) {
    console.log("[seed] J'ai déjà un compte utilisateur dans ma base, je ne fais rien.");
    return;
  }

  if (!process.env.SEED_EMAIL || !process.env.SEED_MOT_DE_PASSE) {
    console.log(
      "[seed] Attention : SEED_EMAIL et/ou SEED_MOT_DE_PASSE ne sont pas définis. " +
      "Je crée un compte avec des valeurs temporaires, je pense à définir ces variables " +
      "sur Render puis à changer mon mot de passe dès ma première connexion."
    );
  }

  const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 10);

  const utilisateur = await prisma.utilisateur.create({
    data: { nom: NOM, email: EMAIL, motDePasseHash },
  });

  console.log("[seed] J'ai créé mon compte initial :", utilisateur.email);
  if (!process.env.SEED_MOT_DE_PASSE) {
    console.log("[seed] Mot de passe temporaire : perpetue — je le change vite !");
  }
}

main()
  .catch((erreur) => {
    // J'affiche l'erreur mais je ne fais pas planter tout le
    // déploiement à cause du seed : mon serveur doit pouvoir démarrer
    // même si, pour une raison quelconque, le seed échoue.
    console.error("[seed] Une erreur est survenue pendant la création de mon compte :", erreur.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
