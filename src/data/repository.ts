// -----------------------------------------------------------------------------
// Repository interfaces. Flows depend only on these, never on a concrete DB.
// `src/data/sample.ts` implements them with the prototype's sample data.
// Swap in Postgres/membership-DB/CDN implementations without touching flows.
// -----------------------------------------------------------------------------

export interface DocEdition {
  file: string;
  pages: number;
  size: string;
  lang: string;
  link: string;
  head: string;
  /** Optional public https audio briefing. Omitted editions stay text/PDF only. */
  audioUrl?: string;
}

export interface PressMeet {
  time: string;
  who: string;
  topic: string;
  where: string;
  status: "live" | "up" | "rec";
  link: string;
}

export interface PressMeetDay {
  label: string;
  list: PressMeet[];
}

export interface JaganMeet {
  id: string;
  date: string;
  topic: string;
  title: string;
  where: string;
  dur: string;
  link: string;
  /** reels cut from this meet */
  reels: MediaItem[];
}

export interface Poll {
  id: string;
  q: string;
  opts: string[];
  votes: number[];
}

export interface MembershipRecord {
  name: string;
  mid: string;
  ac: string; // constituency
  stage: number; // index into STAGES
  where: string;
  /** Collection-center coordinates, shown as a map pin when ready to collect. */
  geo?: { latitude: number; longitude: number; name?: string; address?: string };
}

export interface MediaItem {
  id: string;
  title: string;
  subtitle: string;
  kind: "image" | "video";
  duration?: string;
  url?: string; // CDN url in production
}

export const STAGES = [
  "Applied",
  "Verified",
  "Printed",
  "Dispatched",
  "Ready to collect",
] as const;

// --- Repositories ---

export interface ContentRepo {
  talkingPoints(which: "today" | "yday"): Promise<DocEdition>;
  prajaSankalpam(which: "today" | "yday"): Promise<DocEdition>;
  pressMeets(day: "today" | "tmrw" | "yday"): Promise<PressMeetDay>;
  jaganMeets(): Promise<JaganMeet[]>;
  jaganMeet(id: string): Promise<JaganMeet | undefined>;
}

export interface PollRepo {
  list(): Promise<Poll[]>;
  get(id: string): Promise<Poll | undefined>;
  /** Atomically record a vote. Returns false if this user already voted. */
  vote(pollId: string, userId: string, optionIndex: number): Promise<boolean>;
  hasVoted(pollId: string, userId: string): Promise<number | null>;
}

export interface MembershipRepo {
  /** `mobile` is the normalized 10-digit number. */
  lookup(mobile: string): Promise<MembershipRecord | undefined>;
}

export interface MediaRepo {
  images(): Promise<MediaItem[]>;
  reels(): Promise<MediaItem[]>;
}

export interface Repositories {
  content: ContentRepo;
  polls: PollRepo;
  membership: MembershipRepo;
  media: MediaRepo;
}
