/**
 * Core domain types for The System.
 *
 * Design rule: everything that can be *derived* (total EXP, level, streak, %)
 * is NOT stored. We only persist facts: quests, completions, day metadata, settings.
 */

export type Category = 'Physical' | 'Spiritual' | 'Intellectual' | 'Health' | 'Routine';
export type Stat = 'STR' | 'AGI' | 'INT' | 'VIT' | 'SEN';
export type Difficulty = 'Easy' | 'Normal' | 'Hard';

/** 'YYYY-MM-DD' in the user's LOCAL timezone. Never UTC. */
export type DateKey = string;

export interface Quest {
  id: string;
  name: string;
  category: Category;
  /** Which RPG attribute this quest feeds on the radar chart. */
  stat: Stat;
  /** EXP reward for one completion. Snapshotted onto each Completion when checked. */
  exp: number;
  difficulty: Difficulty;
  /** Days of week this quest is scheduled: 0 = Sunday … 6 = Saturday. */
  scheduleDays: number[];
  order: number;
  /** Date the quest starts counting toward completion %. */
  createdAt: DateKey;
  /** If set, the quest stops counting from this date onward (history is kept). */
  archivedAt?: DateKey | null;
  updatedAt: string;
}

export interface Completion {
  /** Deterministic id: `${questId}|${date}` — makes toggling idempotent. */
  id: string;
  questId: string;
  date: DateKey;
  /** EXP value at the moment of completion. Editing a quest never rewrites history. */
  expAwarded: number;
  stat: Stat;
  category: Category;
  completedAt: string;
}

export interface DayMeta {
  date: DateKey;
  /** Rest day: excluded from streak math (neither breaks nor extends it). */
  restDay: boolean;
}

export type MediaType = 'youtube' | 'facebook' | 'file' | 'link';

export interface MediaItem {
  id: string;
  type: MediaType;
  title: string;
  /** For youtube / facebook / link. */
  url?: string;
  /** For uploaded files: key in the `blobs` table. */
  blobKey?: string;
  mime?: string;
}

export interface Settings {
  id: 'settings';
  hunterName: string;
  avatarDataUrl?: string | null;
  sfxOn: boolean;
  volume: number; // 0..1
  /** Hour (0-23) after which the Emergency banner can appear. */
  emergencyHour: number;
  /** Completion ratio under which the Emergency banner appears (0..1). */
  emergencyThreshold: number;
  /** Completion ratio a day needs to count toward the streak (0..1). */
  streakThreshold: number;
  /** First day of the very first 28-day cycle. Cycles repeat every 28 days from here. */
  cycleAnchor: DateKey;
  /** IANA timezone that decides when a day starts and ends. Default Asia/Dhaka. */
  timezone?: string;
  quote: string;
  media: MediaItem[];
  activeMediaId?: string | null;
  /** Optional custom anthem (uploaded audio) blob key. */
  anthemBlobKey?: string | null;
  lastBackupAt?: string | null;
  schemaVersion: number;
}

export interface BlobRecord {
  key: string;
  blob: Blob;
  name: string;
  mime: string;
}
