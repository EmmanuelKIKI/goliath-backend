// supabase/seed/create-app-user.ts
// Script Node autonome — pas une Edge Function, pas une migration SQL.
// Je l'exécute une seule fois, en local, jamais en production automatisée,
// avec SUPABASE_SERVICE_ROLE_KEY dans l'environnement.
//
// Je passe obligatoirement par l'Admin API (createUser), jamais par un
// INSERT direct dans auth.users / auth.identities : ce schéma interne n'est
// pas une API stable et peut changer sans préavis entre deux versions de
// Supabase.
//
// Usage :
//   npm install
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... APP_USER_EMAIL=... APP_USER_PASSWORD=... node create-app-user.js
// (ou via ts-node si tu préfères garder le .ts tel quel)

import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.APP_USER_EMAIL;
  const password = process.env.APP_USER_PASSWORD;

  if (!supabaseUrl || !serviceRoleKey || !email || !password) {
    console.error(
      "Variables manquantes. Attendu : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_USER_EMAIL, APP_USER_PASSWORD.",
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Je vérifie d'abord qu'aucun utilisateur avec cet e-mail n'existe déjà :
  // pas de doublon silencieux.
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("Impossible de lister les utilisateurs existants :", listError.message);
    process.exit(1);
  }

  const alreadyExists = existingUsers.users.some((u) => u.email === email);
  if (alreadyExists) {
    console.log(`Un utilisateur avec l'e-mail ${email} existe déjà. Rien à faire.`);
    process.exit(0);
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    console.error("Échec de la création de l'utilisateur :", error.message);
    process.exit(1);
  }

  console.log(`Utilisateur unique créé avec succès. id=${data.user?.id}, email=${data.user?.email}`);
}

main();
