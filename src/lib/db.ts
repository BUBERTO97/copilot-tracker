import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { UserSettings } from '../types';

interface CalendarDB extends DBSchema {
  settings: {
    key: string;
    value: UserSettings;
  };
}

const DB_NAME = 'copilot-calendar-db';
const SETTINGS_KEY = 'user-settings';

export const defaultSettings: UserSettings = {
  workDaysPerWeek: 5,
  workWeekStart: 1, // Monday
  renewalType: 'monthly_1st',
  renewalValue: 1,
  lastRenewalDate: new Date().toISOString(),
  maxPercentage: 95,
};

export async function getDB(): Promise<IDBPDatabase<CalendarDB>> {
  return openDB<CalendarDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('settings');
    },
  });
}

export async function saveSettings(settings: UserSettings) {
  const db = await getDB();
  await db.put('settings', settings, SETTINGS_KEY);
}

export async function loadSettings(): Promise<UserSettings> {
  const db = await getDB();
  const settings = await db.get('settings', SETTINGS_KEY);
  return { ...defaultSettings, ...settings };
}
