// -----------------------------------------------------------------------------
// "Nearest office" — ask the user to share a WhatsApp location pin, then reply
// with the closest party office we know about.
// -----------------------------------------------------------------------------
import { backButton, L, LB, readLangPref } from "../services/i18n.js";
import type { FlowContext, LocationPin, Reply } from "../types.js";

export interface Office extends LocationPin {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

/** Sample offices. Replace with the membership DB before production. */
export const OFFICES: Office[] = [
  {
    name: "YSR Congress Party — Central Office",
    address: "Plot no. 13, Suryadevara Township, Tadepalli, Guntur Dist 522501",
    latitude: 16.4712,
    longitude: 80.6039,
  },
  {
    name: "Guntur District Party Office",
    address: "Guntur, Andhra Pradesh",
    latitude: 16.3067,
    longitude: 80.4365,
  },
  {
    name: "Vijayawada Press Club",
    address: "Vijayawada, Andhra Pradesh",
    latitude: 16.5062,
    longitude: 80.648,
  },
  {
    name: "YSRCP Kadapa District Office",
    address: "Kadapa, Andhra Pradesh",
    latitude: 14.4673,
    longitude: 78.8242,
  },
];

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometres. */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestOffice(latitude: number, longitude: number): { office: Office; km: number } {
  let best = OFFICES[0]!;
  let bestKm = distanceKm(latitude, longitude, best.latitude, best.longitude);
  for (const office of OFFICES.slice(1)) {
    const km = distanceKm(latitude, longitude, office.latitude, office.longitude);
    if (km < bestKm) {
      best = office;
      bestKm = km;
    }
  }
  return { office: best, km: bestKm };
}

/** Ask WhatsApp to open the native location picker. */
export async function askLocation(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("near", ctx.session.data);
  const pref = readLangPref(ctx.session.data);
  const body = L(pref, {
    te: "📍 *దగ్గరి కార్యాలయం*\n\nకింద *లొకేషన్ పంపండి* నొక్కి మీ ప్రస్తుత స్థానాన్ని పంచుకోండి. దగ్గరలోని పార్టీ కార్యాలయాన్ని చూపిస్తాం.",
    en: "📍 *Nearest office*\n\nTap *Send location* below and share where you are. We'll show the closest party office.",
  });
  return {
    locationRequest: { body },
    text: body,
    buttons: [backButton(pref)],
  };
}

/** Reply after the user shares a pin. */
export async function nearestFromPin(
  ctx: FlowContext,
  latitude: number,
  longitude: number,
): Promise<Reply> {
  await ctx.setState("idle");
  const pref = readLangPref(ctx.session.data);
  const { office, km } = nearestOffice(latitude, longitude);
  const away = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  return {
    reactionEmoji: "📍",
    text: L(pref, {
      te: `📍 *దగ్గరి కార్యాలయం*\n\n*${office.name}*\n${office.address}\n\nమీ నుండి దాదాపు *${away}*.`,
      en: `📍 *Nearest office*\n\n*${office.name}*\n${office.address}\n\nAbout *${away}* from you.`,
    }),
    location: office,
    buttons: [{ id: "near", label: LB(pref, { te: "మళ్లీ చూడండి", en: "Check again" }) }, backButton(pref)],
  };
}
