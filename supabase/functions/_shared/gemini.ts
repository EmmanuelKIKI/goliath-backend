// _shared/gemini.ts
// Les Edge Functions tournent sur Deno, pas Node.js : je n'utilise jamais le
// SDK npm @google/genai (non garanti compatible), j'appelle directement
// l'API REST Gemini avec fetch().
//
// Modèle : configuré via la variable d'environnement GEMINI_MODEL, jamais
// en dur dans le code, pour pouvoir basculer sans redéployer. Au 16 octobre
// 2026, Gemini 2.0 est retiré et la famille 2.5 s'arrête aussi : je pars
// donc par défaut sur gemini-3.1-flash-lite (texte + vision, sorties
// structurées, stable depuis mai 2026). Je vérifie toujours les quotas
// actuels sur ai.google.dev/gemini-api/docs/rate-limits au moment du build.

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiUnavailableError extends Error {}
export class GeminiRateLimitError extends Error {}
export class GeminiNoConnectionError extends Error {}

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiCallOptions {
  systemInstruction?: string;
  temperature?: number;
}

async function callGeminiWithRetry(
  parts: GeminiPart[],
  options: GeminiCallOptions = {},
  attempt = 1,
): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL");

  if (!apiKey || !model) {
    throw new GeminiUnavailableError(
      "GEMINI_API_KEY ou GEMINI_MODEL manquant dans les secrets Supabase.",
    );
  }

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: options.temperature ?? 0.4,
    },
  };

  if (options.systemInstruction) {
    body.systemInstruction = {
      role: "system",
      parts: [{ text: options.systemInstruction }],
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (_err) {
    // Erreur réseau côté Edge Function elle-même (rare, mais je distingue
    // ce cas d'une vraie indisponibilité Gemini).
    throw new GeminiNoConnectionError(
      "Impossible de joindre l'API Gemini depuis le serveur.",
    );
  }

  if (response.status === 429) {
    if (attempt < 2) {
      // Courte pause puis une seule nouvelle tentative, comme demandé.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return callGeminiWithRetry(parts, options, attempt + 1);
    }
    throw new GeminiRateLimitError(
      "Limite de requêtes Gemini atteinte, réessaie dans quelques instants.",
    );
  }

  if (!response.ok) {
    throw new GeminiUnavailableError(
      `Gemini a répondu avec une erreur (${response.status}).`,
    );
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: GeminiPart) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new GeminiUnavailableError("Réponse Gemini vide ou inattendue.");
  }

  return text;
}

export async function callGeminiText(
  prompt: string,
  systemInstruction: string,
): Promise<string> {
  return callGeminiWithRetry([{ text: prompt }], { systemInstruction });
}

export async function callGeminiVision(
  prompt: string,
  systemInstruction: string,
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  return callGeminiWithRetry(
    [
      { text: prompt },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
    { systemInstruction },
  );
}

// Message d'erreur homogène pour le frontend, sans jamais exposer de détail
// technique ni la clé API (section 18).
export function geminiErrorToUserMessage(err: unknown): string {
  if (err instanceof GeminiRateLimitError) {
    return "L'assistant IA a atteint sa limite de requêtes. Réessaie dans quelques instants.";
  }
  if (err instanceof GeminiNoConnectionError) {
    return "Une connexion Internet est nécessaire pour utiliser l'assistant IA.";
  }
  return "L'assistant IA est momentanément indisponible. Réessaie dans quelques instants.";
}
