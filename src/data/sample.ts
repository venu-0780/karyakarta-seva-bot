// -----------------------------------------------------------------------------
// Sample data ported verbatim from the prototype. Implements the repository
// interfaces so flows can run end-to-end before real backends exist.
// -----------------------------------------------------------------------------
import type {
  ContentRepo,
  DocEdition,
  JaganMeet,
  MediaItem,
  MediaRepo,
  MembershipRecord,
  MembershipRepo,
  Poll,
  PollRepo,
  PressMeetDay,
  Repositories,
} from "./repository.js";
import type { ContactCard, LocationPin } from "../types.js";

export const TODAY = "09 Oct 2026";
export const YDAY = "08 Oct 2026";
export const TMRW = "10 Oct 2026";

const TP: Record<"today" | "yday", DocEdition> = {
  today: { file: "Talking_Points_09-Oct-2026.pdf", pages: 4, size: "312 KB", lang: "Telugu + English", link: "https://www.ysrcongress.com/en/ysr-schemes", head: "Farmer support prices, pension distribution, local body issues" },
  yday: { file: "Talking_Points_08-Oct-2026.pdf", pages: 3, size: "268 KB", lang: "Telugu + English", link: "https://www.ysrcongress.com/indiramma-illu-677", head: "Welfare scheme delays, flood relief in coastal mandals" },
};

const PS: Record<"today" | "yday", DocEdition> = {
  today: { file: "Praja_Sankalpam_09-Oct-2026.pdf", pages: 8, size: "2.4 MB", lang: "Telugu", link: "https://www.ysrcongress.com/en/ysr-schemes", head: "Evening edition · released 6:00 PM" },
  yday: { file: "Praja_Sankalpam_08-Oct-2026.pdf", pages: 8, size: "2.1 MB", lang: "Telugu", link: "https://www.ysrcongress.com/jalayagnam-676", head: "Evening edition · released 6:00 PM" },
};

const PM: Record<"today" | "tmrw" | "yday", PressMeetDay> = {
  today: { label: "Fri, 9 Oct", list: [
    { time: "11:00 AM", who: "Party Spokesperson", topic: "Pension distribution", where: "Central Office, Tadepalli", status: "live", link: "https://www.ysrcongress.com/indiramma-illu-677" },
    { time: "4:30 PM", who: "Guntur District President", topic: "Road repairs in Guntur", where: "District Party Office, Guntur", status: "up", link: "https://www.ysrcongress.com/free-electricity-farmers-672" },
  ]},
  tmrw: { label: "Sat, 10 Oct", list: [
    { time: "9:00 AM", who: "SRK Sir", topic: "Local body elections preparation", where: "Central Office, Tadepalli", status: "up", link: "https://www.ysrcongress.com/jalayagnam-676" },
    { time: "12:00 PM", who: "Perni Nani", topic: "Farmer support prices", where: "Press Club, Vijayawada", status: "up", link: "https://www.ysrcongress.com/2-rupees-rice-673" },
  ]},
  yday: { label: "Thu, 8 Oct", list: [
    { time: "10:00 AM", who: "SRK Sir", topic: "Welfare scheme delays", where: "Central Office, Tadepalli", status: "rec", link: "https://www.ysrcongress.com/rajiv-arogya-sri-671" },
    { time: "3:00 PM", who: "Perni Nani", topic: "Flood relief response", where: "Press Club, Vijayawada", status: "rec", link: "https://www.ysrcongress.com/en/ysr-schemes" },
  ]},
};

const SCHEME_IMAGES = {
  indiramma: "https://www.ysrcongress.com/sites/default/files/6.png",
  jalayagnam: "https://www.ysrcongress.com/sites/default/files/9.png",
  rice: "https://www.ysrcongress.com/sites/default/files/2.png",
  electricity: "https://www.ysrcongress.com/sites/default/files/5.png",
  arogyasri: "https://www.ysrcongress.com/sites/default/files/8.png",
} as const;

// Base path for official media on ysrcongress.com. Image-style derivatives
// (…/styles/<name>/public/…) are resized thumbnails; dropping that segment
// yields the full-HD original, which is what we link below.
const YSR_FILES = "https://www.ysrcongress.com/sites/default/files";

/**
 * Preview images used as menu / flow headers to make the chat feel premium.
 * All are official, full-resolution originals from ysrcongress.com (verified
 * reachable). Roles are explicit so each flow gets a fitting photo.
 */
export const BRAND_IMAGES = {
  // Branded party banner (name + leaders + logo) — the welcome greeting hero.
  welcome: `${YSR_FILES}/ysrcongress.jpg`,
  // YS Jagan, HD (Ongole visit) — leader press-meets hub header.
  leader: `${YSR_FILES}/article_images/2026/09/29/a%20%2817%29.jpeg`,
  // YS Jagan addressing, HD — talking-points header.
  speech: `${YSR_FILES}/article_images/2026/09/29/a%20%2832%29_0.jpeg`,
  // Formal news photo (leader meeting the Governor), HD — press-meet schedule.
  news: `${YSR_FILES}/article_images/2026/09/23/WhatsApp%20Image%202026-09-23%20at%206.32.51%20PM%20%281%29.jpeg`,
  // Recent HD party photo — Praja Sankalpam (evening paper) header.
  paper: `${YSR_FILES}/article_images/2026/10/12/WhatsApp%20Image%202026-10-12%20at%206.26.56%20PM%20%281%29.jpeg`,
  // Dr. YSR founder portrait — reserved for memorial / about surfaces.
  founder: `${YSR_FILES}/ys-rajashekar-reddy-photos-1.jpg`,
  // HD event photo — posters & reels picker header (was a low-res scheme PNG).
  posters: `${YSR_FILES}/article_images/2026/09/29/a%20%281%29.jpeg`,
} as const;

const CLIPS: MediaItem[] = [
  { id: "c0", title: "Indiramma Illu", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.indiramma },
  { id: "c1", title: "Jalayagnam", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.jalayagnam },
  { id: "c2", title: "Rajiv Arogya Sri", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.arogyasri },
];

const JPM: JaganMeet[] = [
  { id: "j0", date: "Thu, 8 Oct 2026", topic: "Farmers", title: "Crop prices and procurement delays", where: "Tadepalli camp office", dur: "38 min", link: "https://www.youtube.com/watch?v=TSjPLyEyobk", reels: CLIPS },
  { id: "j1", date: "Sat, 3 Oct 2026", topic: "Welfare schemes", title: "Pending welfare scheme payments", where: "Tadepalli camp office", dur: "45 min", link: "https://www.youtube.com/watch?v=0O53ZJ_Is3A", reels: CLIPS },
  { id: "j2", date: "Sun, 27 Sep 2026", topic: "Floods & relief", title: "Flood relief in coastal districts", where: "Vijayawada", dur: "29 min", link: "https://www.youtube.com/watch?v=13iwSpXInEo", reels: CLIPS },
  { id: "j3", date: "Sun, 20 Sep 2026", topic: "Law & order", title: "Attacks on party workers", where: "Tadepalli camp office", dur: "34 min", link: "https://www.youtube.com/watch?v=4RxhMAsipCM", reels: CLIPS },
  { id: "j4", date: "Sat, 12 Sep 2026", topic: "Farmers", title: "Fertiliser shortage", where: "Guntur", dur: "31 min", link: "https://www.youtube.com/watch?v=5lEDKNyhwX0", reels: CLIPS },
];

const POLLS: Poll[] = [
  { id: "p1", q: "Will you attend Sunday's mandal-level meeting?", opts: ["Yes", "No", "Not sure"], votes: [412, 58, 96] },
  { id: "p2", q: "Which issue do people raise most in your village?", opts: ["Roads", "Drinking water", "Pensions", "Housing", "Electricity", "Jobs"], votes: [188, 241, 302, 97, 64, 155] },
  { id: "p3", q: "Was yesterday's talking points PDF useful?", opts: ["Very useful", "Somewhat", "Not useful"], votes: [530, 141, 22] },
];

const IDS: Record<string, MembershipRecord> = {
  "9876543210": { name: "K. Ravi Kumar", mid: "YSR-GNT-204871", ac: "Guntur West", stage: 3, where: "Guntur West constituency office (expected 12 Oct)" },
  "9123456780": { name: "P. Lakshmi Devi", mid: "YSR-NLR-118302", ac: "Nellore City", stage: 0, where: "Verification usually takes 5–7 days" },
  "9000000001": {
    name: "S. Venkata Reddy", mid: "YSR-KDP-077615", ac: "Kadapa", stage: 4,
    where: "Kadapa district party office, 10 am – 5 pm. Bring Aadhaar or voter ID.",
    // TODO(prod): store the real per-office coordinates in the membership DB.
    geo: { latitude: 14.4673, longitude: 78.8242, name: "YSRCP Kadapa District Office", address: "Kadapa, Andhra Pradesh" },
  },
};

/**
 * Party helpline contact card handed out in Help and when a membership lookup
 * fails. TODO(prod): replace with the real published helpline number(s).
 */
export const PARTY_CONTACT: ContactCard = {
  name: "YSRCP Helpdesk",
  org: "YSR Congress Party",
  phones: ["+919000000000"],
};

/** Party central office pin, offered from Help (official address from the site footer). */
export const PARTY_OFFICE: LocationPin = {
  latitude: 16.4712,
  longitude: 80.6039,
  name: "YSR Congress Party — Central Office",
  address: "Plot no. 13, Suryadevara Township, Tadepalli, Guntur Dist 522501",
};

const IMAGES: MediaItem[] = [
  { id: "img0", title: "Indiramma Illu", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.indiramma },
  { id: "img1", title: "Jalayagnam", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.jalayagnam },
  { id: "img2", title: "2 rupees rice", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.rice },
  { id: "img3", title: "Free electricity", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.electricity },
  { id: "img4", title: "Rajiv Arogya Sri", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.arogyasri },
];

const REELS: MediaItem[] = [
  { id: "r0", title: "Indiramma Illu", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.indiramma },
  { id: "r1", title: "2 rupees rice", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.rice },
  { id: "r2", title: "Free electricity", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.electricity },
  { id: "r3", title: "Rajiv Arogya Sri", subtitle: "YSR scheme poster", kind: "image", url: SCHEME_IMAGES.arogyasri },
];

// In-memory vote ledger (sample only). Production: atomic DB write keyed by (poll, user).
const voteLedger = new Map<string, number>(); // key: `${pollId}:${userId}` -> optionIndex

export function createSampleRepositories(): Repositories {
  const content: ContentRepo = {
    async talkingPoints(which) { return TP[which]; },
    async prajaSankalpam(which) { return PS[which]; },
    async pressMeets(day) { return PM[day]; },
    async jaganMeets() { return JPM; },
    async jaganMeet(id) { return JPM.find((m) => m.id === id); },
  };

  const polls: PollRepo = {
    async list() { return POLLS; },
    async get(id) { return POLLS.find((p) => p.id === id); },
    async hasVoted(pollId, userId) {
      const v = voteLedger.get(`${pollId}:${userId}`);
      return v ?? null;
    },
    async vote(pollId, userId, optionIndex) {
      const key = `${pollId}:${userId}`;
      if (voteLedger.has(key)) return false;
      const poll = POLLS.find((p) => p.id === pollId);
      if (!poll || optionIndex < 0 || optionIndex >= poll.opts.length) return false;
      voteLedger.set(key, optionIndex);
      poll.votes[optionIndex] = (poll.votes[optionIndex] ?? 0) + 1;
      return true;
    },
  };

  const membership: MembershipRepo = {
    async lookup(mobile) { return IDS[mobile]; },
  };

  const media: MediaRepo = {
    async images() { return IMAGES; },
    async reels() { return REELS; },
  };

  return { content, polls, membership, media };
}
