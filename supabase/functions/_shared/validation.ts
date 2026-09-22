// _shared/validation.ts
// Petites validations partagées par mes Edge Functions. Je ne fais jamais
// confiance à ce que le frontend envoie : tout est revérifié ici, et les
// contraintes SQL font le reste côté base.

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    value,
  );
}

export function isValidStoragePath(path: string): boolean {
  return (
    /^sans-lot\/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$/.test(path) ||
    /^[0-9a-fA-F-]{36}\/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$/.test(path)
  );
}

export class ValidationError extends Error {}
