/**
 * Master Quest Database — the 27 default quests (the spec says 26, its table lists 27).
 * Max EXP per perfect day = 650.
 */
import type { Category, Difficulty, Quest, Settings, Stat } from '../domain/types';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

type Row = [id: string, category: Category, name: string, exp: number, difficulty: Difficulty, stat: Stat];

const ROWS: Row[] = [
  ['phy-sunlight', 'Physical', 'Morning Sunlight 15–20 min', 20, 'Normal', 'AGI'],
  ['phy-walk', 'Physical', 'Morning Walk', 20, 'Normal', 'AGI'],
  ['phy-isosplit', 'Physical', 'Isometric Split Executed (Training Day)', 15, 'Easy', 'STR'],
  ['phy-neck', 'Physical', 'Neck Isometrics — All 4 Directions', 15, 'Easy', 'STR'],
  ['phy-squat', 'Physical', 'Slow Bodyweight Squat & Scapular Prehab', 20, 'Normal', 'STR'],
  ['spi-dhikr', 'Spiritual', 'Daily Dhikr', 15, 'Easy', 'SEN'],
  ['spi-nafs', 'Spiritual', 'Fightback Nafs (Self-Discipline)', 20, 'Normal', 'SEN'],
  ['int-ilm', 'Intellectual', 'ILM & Quran, Hifz', 30, 'Normal', 'INT'],
  ['int-dsa', 'Intellectual', 'Coding Practice / DSA', 50, 'Hard', 'INT'],
  ['int-varsity', 'Intellectual', 'Varsity Grind — 2 hrs Deep Study', 50, 'Hard', 'INT'],
  ['int-ielts', 'Intellectual', 'IELTS Prep / Language Study', 40, 'Normal', 'INT'],
  ['int-project', 'Intellectual', 'Project Work (AWS / System Dev)', 15, 'Easy', 'INT'],
  ['int-awscomm', 'Intellectual', 'AWS Community (Visit, Like, Comment, Vote)', 15, 'Easy', 'INT'],
  ['int-reading', 'Intellectual', 'Reading Habit (1 Chapter Minimum)', 25, 'Normal', 'INT'],
  ['int-skill', 'Intellectual', 'Skill / Learning Forge', 30, 'Normal', 'INT'],
  ['int-research', 'Intellectual', 'Research & Scholarly Active Session', 50, 'Hard', 'INT'],
  ['hea-aloe', 'Health', 'Aloe & Tok Doi Intake', 55, 'Hard', 'VIT'],
  ['hea-water', 'Health', 'Drink 3L Water', 10, 'Easy', 'VIT'],
  ['hea-nosugar', 'Health', 'No Sugar', 20, 'Normal', 'VIT'],
  ['hea-flax-am', 'Health', 'Tishi / Flaxseed Ground — Morning Dose (1 tbsp)', 15, 'Easy', 'VIT'],
  ['hea-flax-pm', 'Health', 'Tishi / Flaxseed Ground — Pre-sleep Dose (1 tbsp)', 15, 'Easy', 'VIT'],
  ['hea-vitc', 'Health', 'Vitamin C Intake', 20, 'Normal', 'VIT'],
  ['hea-meds', 'Health', 'Medication Check', 15, 'Easy', 'VIT'],
  ['hea-eggs', 'Health', '2 Whole Eggs + Weekly Vit D Taken', 20, 'Normal', 'VIT'],
  ['hea-nostreet', 'Health', 'No Street Food / No Oxidized Oil', 25, 'Hard', 'VIT'],
  ['rou-bed', 'Routine', 'Make Bed', 5, 'Easy', 'SEN'],
  ['rou-sleep', 'Routine', 'Sleep by 10:30 PM', 20, 'Normal', 'SEN'],
];

export const SEED_QUESTS: Quest[] = ROWS.map(([id, category, name, exp, difficulty, stat], i) => ({
  id,
  name,
  category,
  stat,
  exp,
  difficulty,
  scheduleDays: ALL_DAYS,
  order: i,
  // Seeded quests count from the distant past so imported history is scored correctly.
  createdAt: '2000-01-01',
  archivedAt: null,
  updatedAt: new Date(0).toISOString(),
}));

export const DEFAULT_QUOTE =
  'Every person has an addiction to something. A man’s addiction must be discipline. ARISE AND LEVEL UP.';

export function defaultSettings(cycleAnchor: string): Settings {
  return {
    id: 'settings',
    hunterName: 'Hunter',
    avatarDataUrl: null,
    sfxOn: true,
    volume: 0.5,
    emergencyHour: 22,
    emergencyThreshold: 0.4,
    streakThreshold: 0.5,
    cycleAnchor,
    quote: DEFAULT_QUOTE,
    media: [
      {
        id: 'fb-reel-default',
        type: 'facebook',
        title: 'Daily Motivation Reel',
        url: 'https://www.facebook.com/share/r/1MreFhRpQ1/',
      },
    ],
    activeMediaId: 'fb-reel-default',
    anthemBlobKey: null,
    lastBackupAt: null,
    schemaVersion: 1,
  };
}
