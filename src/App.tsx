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

  return (
    <div className="min-h-screen bg-zinc-50 selection:bg-zinc-900 selection:text-white">
      <Calendar 
        settings={settings} 
        onOpenSettings={() => setIsSettingsOpen(true)} 
      />
      
      <AnimatePresence>
        {isSettingsOpen && (
          <Settings 
            settings={settings} 
            onSave={handleSaveSettings} 
            onClose={() => setIsSettingsOpen(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

