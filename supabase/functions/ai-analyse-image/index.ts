// supabase/functions/ai-analyse-image/index.ts
// Reçoit le chemin d'une photo déjà uploadée dans le bucket privé, génère en
// interne une URL signée (le frontend n'a pas besoin d'Edge Function pour la
// lecture normale, mais ici le serveur doit relire l'image pour l'envoyer à
// Gemini vision), puis structure la réponse.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { callGeminiVision, geminiErrorToUserMessage } from "../_shared/gemini.ts";
import { isNonEmptyString, isUuid, isValidStoragePath } from "../_shared/validation.ts";

const SYSTEM_INSTRUCTION = `Tu es un assistant d'aide à la décision pour un éleveur avicole au Bénin (poulets Goliath), analysant une photo.
Tu n'es jamais vétérinaire et tu ne poses jamais de diagnostic confirmé. Utilise des formulations comme
« cela peut être compatible avec... » ou « une possibilité à envisager est... ».
Ajoute toujours la phrase : « Une photo seule ne permet pas de confirmer un diagnostic. »
Si la photo est inexploitable (floue, mal éclairée, sujet non identifiable), réponds uniquement :
« La photo ne permet pas une analyse fiable. Prenez une photo plus nette et mieux éclairée. »
Sinon, si une information nécessaire te manque dans le contexte fourni, dis-le explicitement plutôt que de supposer une valeur.
Structure toujours ta réponse exactement ainsi, avec ces six titres :
Résumé
Causes possibles
Niveau d'urgence (faible / à surveiller / préoccupant / urgent)
Ce que je dois vérifier
Mesures générales
Quand contacter un vétérinaire`;

function mimeTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Non authentifié." }, 401);
  }

  let payload: { image_path?: string; lot_id?: string; question?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Corps de requête JSON invalide." }, 400);
  }

  if (!isNonEmptyString(payload.image_path) || !isValidStoragePath(payload.image_path)) {
    return jsonResponse({ error: "image_path manquant ou invalide." }, 400);
  }
  if (payload.lot_id && !isUuid(payload.lot_id)) {
    return jsonResponse({ error: "lot_id invalide." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: signed, error: signedError } = await supabase.storage
    .from("ai-photos")
    .createSignedUrl(payload.image_path, 600); // 10 minutes

  if (signedError || !signed) {
    return jsonResponse({ error: "Photo introuvable dans le stockage." }, 404);
  }

  let imageBase64: string;
  try {
    const imageResponse = await fetch(signed.signedUrl);
    if (!imageResponse.ok) throw new Error("téléchargement échoué");
    const buffer = await imageResponse.arrayBuffer();
    imageBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  } catch (_err) {
    return jsonResponse({ error: "Impossible de lire la photo pour l'analyse." }, 500);
  }

  const context = {
    image_path: payload.image_path,
    lot_id: payload.lot_id ?? null,
    question: payload.question ?? null,
  };

  const prompt = `Analyse cette photo prise sur la ferme GOLIATH.
${payload.question ? `Question de l'éleveur : ${payload.question}` : ""}
Contexte disponible (JSON) :
${JSON.stringify(context, null, 2)}`;

  let responseText: string;
  try {
    responseText = await callGeminiVision(
      prompt,
      SYSTEM_INSTRUCTION,
      imageBase64,
      mimeTypeFromPath(payload.image_path),
    );
  } catch (err) {
    return jsonResponse({ error: geminiErrorToUserMessage(err) }, 503);
  }

  const model = Deno.env.get("GEMINI_MODEL") ?? "";

  const { data: inserted, error: insertError } = await supabase
    .from("ai_analyses")
    .insert({
      type: "image",
      lot_id: payload.lot_id ?? null,
      question: payload.question ?? null,
      context,
      response: responseText,
      image_path: payload.image_path,
      gemini_model: model,
    })
    .select()
    .single();

  if (insertError) {
    console.error("ai-analyse-image: échec d'enregistrement", insertError.message);
    return jsonResponse({ error: "Analyse générée mais non enregistrée." }, 500);
  }

  return jsonResponse({ analysis: inserted });
});
