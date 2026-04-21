/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Calendar from './components/Calendar';
import Settings from './components/Settings';
import { UserSettings } from './types';
import { loadSettings, saveSettings } from './lib/db';
import { AnimatePresence } from 'motion/react';
import { useGithubUsage } from './lib/useGithubUsage';

export default function App() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    async function init() {
      const saved = await loadSettings();
      setSettings(saved);
    }
    init();
  }, []);

  const handleSaveSettings = async (newSettings: UserSettings) => {
    setSettings(newSettings);
    await saveSettings(newSettings);
    setIsSettingsOpen(false);
  };

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-zinc-200 rounded-full" />
          <div className="h-4 w-24 bg-zinc-200 rounded" />
        </div>
      </div>
    );
  }

  return <AppInner settings={settings} onSaveSettings={handleSaveSettings} isSettingsOpen={isSettingsOpen} setIsSettingsOpen={setIsSettingsOpen} />;
}

function AppInner({ settings, onSaveSettings, isSettingsOpen, setIsSettingsOpen }: {
  settings: UserSettings;
  onSaveSettings: (s: UserSettings) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
}) {
  const { usage, refresh } = useGithubUsage(settings);

  const handleSave = async (s: UserSettings) => {
    onSaveSettings(s);
    setTimeout(refresh, 500); // re-fetch usage after settings change
  };

  return (
    <div className="min-h-screen bg-zinc-50 selection:bg-zinc-900 selection:text-white">
      <Calendar
        settings={settings}
        onOpenSettings={() => setIsSettingsOpen(true)}
        usage={usage}
      />

      <AnimatePresence>
        {isSettingsOpen && (
          <Settings
            settings={settings}
            onSave={handleSave}
            onClose={() => setIsSettingsOpen(false)}
            usage={usage}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
