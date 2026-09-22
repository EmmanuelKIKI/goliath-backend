// supabase/functions/ai-veterinaire/index.ts
// Assistant santé (texte) : je rassemble le contexte réel du lot en base,
// je l'envoie à Gemini avec interdiction explicite d'inventer une donnée
// absente, puis j'enregistre la réponse structurée dans ai_analyses.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { callGeminiText, geminiErrorToUserMessage } from "../_shared/gemini.ts";
import { isNonEmptyString, isUuid } from "../_shared/validation.ts";

const SYSTEM_INSTRUCTION = `Tu es un assistant d'aide à la décision pour un éleveur avicole au Bénin (poulets Goliath).
Tu n'es jamais vétérinaire et tu ne poses jamais de diagnostic confirmé. Utilise des formulations comme
« cela peut être compatible avec... » ou « une possibilité à envisager est... ».
Si une information nécessaire te manque dans le contexte fourni, dis-le explicitement plutôt que de supposer une valeur : n'invente jamais une donnée absente.
Structure toujours ta réponse exactement ainsi, avec ces six titres :
Résumé
Causes possibles
Niveau d'urgence (faible / à surveiller / préoccupant / urgent)
Ce que je dois vérifier
Mesures générales
Quand contacter un vétérinaire`;

async function buildLotContext(supabase: ReturnType<typeof createClient>, lotId: string) {
  const { data: lot } = await supabase
    .from("lots")
    .select("id, name, species, breed, entry_date, initial_count, building_id, buildings(name)")
    .eq("id", lotId)
    .maybeSingle();

  if (!lot) return null;

  const ageJours = Math.floor(
    (Date.now() - new Date(lot.entry_date as string).getTime()) / (1000 * 60 * 60 * 24),
  );

  const [{ data: recentDaily }, { data: recentHealth }, { data: recentWeight }, { data: recentIncidents }, { data: recentTreatments }, { data: recentVaccinations }] =
    await Promise.all([
      supabase.from("daily_records").select("record_date, actual_count, deaths, count_difference")
        .eq("lot_id", lotId).order("record_date", { ascending: false }).limit(7),
      supabase.from("health_records").select("sick_count, symptoms, duration, observation, daily_records(record_date)")
        .eq("lot_id", lotId).order("created_at", { ascending: false }).limit(5),
      supabase.from("weight_records").select("weigh_date, average_weight_g, sample_size")
        .eq("lot_id", lotId).order("weigh_date", { ascending: false }).limit(3),
      supabase.from("incidents").select("incident_date, type, description, severity, resolved")
        .eq("lot_id", lotId).order("incident_date", { ascending: false }).limit(5),
      supabase.from("treatments").select("product, treatment_date, dose, subjects_count")
        .eq("lot_id", lotId).order("treatment_date", { ascending: false }).limit(5),
      supabase.from("vaccinations").select("vaccine_name, vaccination_date, subjects_count")
        .eq("lot_id", lotId).order("vaccination_date", { ascending: false }).limit(5),
    ]);

  return {
    lot: {
      nom: lot.name,
      espece: lot.species,
      souche: lot.breed,
      batiment: (lot as { buildings?: { name?: string } }).buildings?.name ?? null,
      age_jours: ageJours,
      effectif_initial: lot.initial_count,
    },
    suivis_recents: recentDaily ?? [],
    sante_recente: recentHealth ?? [],
    pesees_recentes: recentWeight ?? [],
    incidents_recents: recentIncidents ?? [],
    traitements_recents: recentTreatments ?? [],
    vaccinations_recentes: recentVaccinations ?? [],
  };
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

  let payload: { lot_id?: string; question?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Corps de requête JSON invalide." }, 400);
  }

  if (!isNonEmptyString(payload.question)) {
    return jsonResponse({ error: "La question ou description est obligatoire." }, 400);
  }
  if (payload.lot_id && !isUuid(payload.lot_id)) {
    return jsonResponse({ error: "lot_id invalide." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  let context: Record<string, unknown> = {};
  if (payload.lot_id) {
    const lotContext = await buildLotContext(supabase, payload.lot_id);
    if (lotContext) context = lotContext;
  }

  const prompt = `Question / description de l'éleveur : ${payload.question}

Contexte disponible en base (JSON) :
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
      type: "veterinaire",
      lot_id: payload.lot_id ?? null,
      question: payload.question,
      context,
      response: responseText,
      gemini_model: model,
    })
    .select()
    .single();

  if (insertError) {
    console.error("ai-veterinaire: échec d'enregistrement", insertError.message);
    return jsonResponse({ error: "Analyse générée mais non enregistrée." }, 500);
  }

  return jsonResponse({ analysis: inserted });
});
