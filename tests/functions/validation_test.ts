// tests/functions/validation_test.ts
// Tests unitaires purs (pas de réseau) pour les helpers de validation.
// Lancer avec : deno test tests/functions/validation_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isNonEmptyString,
  isUuid,
  isValidStoragePath,
} from "../../supabase/functions/_shared/validation.ts";

Deno.test("isNonEmptyString rejette une chaîne vide", () => {
  assertEquals(isNonEmptyString(""), false);
  assertEquals(isNonEmptyString("   "), false);
  assertEquals(isNonEmptyString("bonjour"), true);
});

Deno.test("isUuid valide un UUID correct", () => {
  assertEquals(isUuid("123e4567-e89b-12d3-a456-426614174000"), true);
  assertEquals(isUuid("pas-un-uuid"), false);
  assertEquals(isUuid(123), false);
});

Deno.test("isValidStoragePath accepte les deux formes imposées", () => {
  assertEquals(
    isValidStoragePath("123e4567-e89b-12d3-a456-426614174000/123e4567-e89b-12d3-a456-426614174001.jpg"),
    true,
  );
  assertEquals(
    isValidStoragePath("sans-lot/123e4567-e89b-12d3-a456-426614174001.png"),
    true,
  );
  assertEquals(isValidStoragePath("autre/chemin.jpg"), false);
  assertEquals(isValidStoragePath("sans-lot/pas-uuid.jpg"), false);
});
