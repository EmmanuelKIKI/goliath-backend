// supabase/functions/ai-analyse-elevage/index.ts
// Analyse de tendances sur les derniers jours. lot_id est optionnel : une
// analyse globale peut ne cibler aucun lot précis (ai_analyses.lot_id est
// nullable pour cette raison).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { callGeminiText, geminiErrorToUserMessage } from "../_shared/gemini.ts";
import { isUuid } from "../_shared/validation.ts";

const SYSTEM_INSTRUCTION = `Tu es un assistant d'aide à la décision pour un éleveur avicole au Bénin (poulets Goliath).
Tu n'es jamais vétérinaire et tu ne poses jamais de diagnostic confirmé. Utilise des formulations comme
« cela peut être compatible avec... » ou « une possibilité à envisager est... ».
Si une information nécessaire te manque dans le contexte fourni, dis-le explicitement plutôt que de supposer une valeur : n'invente jamais une donnée absente.
Structure toujours ta réponse exactement ainsi, avec ces sept titres :
Résumé
Tendances positives
Anomalies détectées
Points nécessitant une vérification
Niveau de vigilance (faible / modéré / élevé)
Actions de surveillance proposées
Quand contacter un vétérinaire`;

const LOOKBACK_DAYS = 14;

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

  let payload: { lot_id?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Corps de requête JSON invalide." }, 400);
  }

  if (payload.lot_id && !isUuid(payload.lot_id)) {
    return jsonResponse({ error: "lot_id invalide." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const sinceDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let dailyQuery = supabase
    .from("daily_records")
    .select("lot_id, record_date, actual_count, deaths, entries, exits, count_difference, lots(name)")
    .gte("record_date", sinceDate)
    .order("record_date", { ascending: true });

  let incidentsQuery = supabase
    .from("incidents")
    .select("lot_id, building_id, incident_date, type, severity, resolved")
    .gte("incident_date", sinceDate);

  let healthQuery = supabase
    .from("health_records")
    .select("lot_id, sick_count, symptoms, observation, created_at")
    .gte("created_at", sinceDate);

  if (payload.lot_id) {
    dailyQuery = dailyQuery.eq("lot_id", payload.lot_id);
    incidentsQuery = incidentsQuery.eq("lot_id", payload.lot_id);
    healthQuery = healthQuery.eq("lot_id", payload.lot_id);
  }

  const [{ data: daily }, { data: incidents }, { data: health }] = await Promise.all([
    dailyQuery,
    incidentsQuery,
    healthQuery,
  ]);

  const context = {
    periode_analysee_depuis: sinceDate,
    lot_cible: payload.lot_id ?? "ensemble de la ferme",
    suivis_quotidiens: daily ?? [],
    incidents: incidents ?? [],
    observations_sante: health ?? [],
  };

  const prompt = `Analyse les tendances de la ferme GOLIATH sur les ${LOOKBACK_DAYS} derniers jours à partir de ce contexte réel (JSON) :

${JSON.stringify(context, null, 2)}`;

  let responseText: string;
  try {
    responseText = await callGeminiText(prompt, SYSTEM_INSTRUCTION);
  } catch (err) {
    return jsonResponse({ error: geminiErrorToUserMessage(err) }, 503);
  }

  const model = Deno.env.get("GEMINI_MODEL") ?? "";

  const { data: inserted, error: insertError } = await supabase
    .from("ai_analyses")
    .insert({
      type: "elevage",
      lot_id: payload.lot_id ?? null,
      question: null,
      context,
      response: responseText,
      gemini_model: model,
    })
    .select()
    .single();

  if (insertError) {
    console.error("ai-analyse-elevage: échec d'enregistrement", insertError.message);
    return jsonResponse({ error: "Analyse générée mais non enregistrée." }, 500);
  }

  return jsonResponse({ analysis: inserted });
});
