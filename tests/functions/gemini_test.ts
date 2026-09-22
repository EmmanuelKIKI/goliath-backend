// tests/functions/gemini_test.ts
// Teste le service Gemini avec un mock de fetch — sans appel réseau réel,
// et sans jamais utiliser de vraie clé API.
// Lancer avec :
//   GEMINI_API_KEY=fake GEMINI_MODEL=gemini-3.1-flash-lite deno test --allow-env tests/functions/gemini_test.ts

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  callGeminiText,
  GeminiRateLimitError,
} from "../../supabase/functions/_shared/gemini.ts";

Deno.test("callGeminiText retourne le texte de la réponse Gemini", async () => {
  Deno.env.set("GEMINI_API_KEY", "fake-key");
  Deno.env.set("GEMINI_MODEL", "gemini-3.1-flash-lite");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Résumé : tout va bien." }] } }],
      }),
      { status: 200 },
    )) as typeof fetch;

  try {
    const result = await callGeminiText("Question test", "Instruction test");
    assertEquals(result, "Résumé : tout va bien.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("callGeminiText relance une fois puis échoue proprement sur 429 persistant", async () => {
  Deno.env.set("GEMINI_API_KEY", "fake-key");
  Deno.env.set("GEMINI_MODEL", "gemini-3.1-flash-lite");

  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount++;
    return new Response("{}", { status: 429 });
  }) as typeof fetch;

  try {
    await assertRejects(
      () => callGeminiText("Question test", "Instruction test"),
      GeminiRateLimitError,
    );
    assertEquals(callCount, 2); // un essai + une seule nouvelle tentative
  } finally {
    globalThis.fetch = originalFetch;
  }
});
