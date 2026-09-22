// supabase/functions/auth-login/index.ts
// Je vérifie ici mon code d'accès côté serveur, puis j'ouvre une session
// Supabase pour mon utilisateur unique. Le frontend ne crée jamais de
// compte et ne connaît jamais APP_USER_EMAIL ni APP_USER_PASSWORD — il ne
// reçoit que le jeton de session final.

import { createClient } from "npm:@supabase/supabase-js@2";
import { compare } from "npm:bcryptjs@2.4.3";
import { corsHeaders, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { isNonEmptyString } from "../_shared/validation.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  let payload: { code?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Corps de requête JSON invalide." }, 400);
  }

  if (!isNonEmptyString(payload.code)) {
    return jsonResponse({ error: "Code d'accès incorrect." }, 401);
  }

  const accessCodeHash = Deno.env.get("APP_ACCESS_CODE_HASH");
  const userEmail = Deno.env.get("APP_USER_EMAIL");
  const userPassword = Deno.env.get("APP_USER_PASSWORD");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!accessCodeHash || !userEmail || !userPassword || !supabaseUrl || !serviceRoleKey) {
    // Erreur de configuration serveur : je ne donne aucun détail au client.
    console.error("auth-login: secrets manquants côté serveur.");
    return jsonResponse({ error: "Code d'accès incorrect." }, 401);
  }

  const isCodeValid = await compare(payload.code, accessCodeHash);
  if (!isCodeValid) {
    return jsonResponse({ error: "Code d'accès incorrect." }, 401);
  }

  // Client avec la clé de service, uniquement côté serveur, pour ouvrir la
  // session de l'utilisateur unique.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await adminClient.auth.signInWithPassword({
    email: userEmail,
    password: userPassword,
  });

  if (error || !data.session) {
    console.error("auth-login: échec de signInWithPassword", error?.message);
    return jsonResponse({ error: "Code d'accès incorrect." }, 401);
  }

  return jsonResponse({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
});
