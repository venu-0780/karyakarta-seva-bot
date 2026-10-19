/**
 * WhatsApp profile name from an inbound webhook (`contacts[].profile.name`).
 * The adapter copies it onto `author.fullName`, and falls back to the wa_id
 * when Meta sends no name. A phone number is not a greeting.
 */
export function usableDisplayName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const name = raw.replace(/[\r\n\t]+/g, " ").replace(/[*_~`]/g, "").trim();
  if (!name || name.length > 64) return undefined;
  // Adapter fallback is the wa_id. Also drop ids that are mostly digits.
  if (/^[\d+\s()-]+$/.test(name)) return undefined;
  if (/\d{6,}/.test(name)) return undefined;
  return name;
}
