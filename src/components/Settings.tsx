import React, { useState, useEffect } from 'react';
import { X, Save, Github, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { UserSettings, RenewalType } from '../types';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface SettingsProps {
  settings: UserSettings;
  onSave: (settings: UserSettings) => void;
  onClose: () => void;
}

export default function Settings({ settings, onSave, onClose }: SettingsProps) {
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings);
  const [githubStatus, setGithubStatus] = useState<{ connected: boolean; user?: any; copilot?: any; usage?: any }>({ connected: false });
  const [loading, setLoading] = useState(false);
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualToken, setManualToken] = useState('');

  useEffect(() => {
    fetchGithubStatus();
    
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchGithubStatus();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchGithubStatus = async () => {
    try {
      const res = await fetch('/api/user/github-status');
      const data = await res.json();
      if (data.connected) {
        const infoRes = await fetch('/api/user/copilot-info');
        const info = await infoRes.json();
        
        // Fetch usage data
        let usage = null;
        try {
          const usageRes = await fetch('/api/user/copilot-usage');
          if (usageRes.ok) {
            usage = await usageRes.json();
          }
        } catch (err) {
          console.error('Failed to fetch usage:', err);
        }

        setGithubStatus({ connected: true, ...info, usage });
      } else {
        setGithubStatus({ connected: false });
      }
    } catch (err) {
      console.error('Failed to fetch GitHub status:', err);
    }
  };

  const handleConnectGithub = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/github/url');
      const { url } = await res.json();
      const authWindow = window.open(url, 'github_oauth', 'width=600,height=700');
      if (!authWindow) {
        alert('Please allow popups to connect your GitHub account.');
      }
    } catch (err) {
      console.error('Failed to get GitHub auth URL:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutGithub = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setGithubStatus({ connected: false });
    } catch (err) {
      console.error('Failed to logout GitHub:', err);
    }
  };

  const handleManualTokenSubmit = async () => {
    if (!manualToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: manualToken }),
      });
      if (res.ok) {
        setManualToken('');
        setShowManualToken(false);
        fetchGithubStatus();
      }
    } catch (err) {
      console.error('Failed to set manual token:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(localSettings);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="text-xl font-display font-bold">Configuration</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-tighter">
              Work Days Per Week
            </label>
            <input 
              type="range" 
              min="1" 
              max="7" 
              value={localSettings.workDaysPerWeek ?? 5}
              onChange={(e) => setLocalSettings({ ...localSettings, workDaysPerWeek: parseInt(e.target.value) })}
              className="w-full h-2 bg-zinc-100 rounded-lg appearance-none cursor-pointer accent-zinc-900"
            />
            <div className="flex justify-between text-xs font-mono text-zinc-500">
              <span>1 day</span>
              <span className="font-bold text-zinc-900">{localSettings.workDaysPerWeek} days</span>
              <span>7 days</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-tighter">
              Work Week Starts On
            </label>
            <select 
              value={localSettings.workWeekStart ?? 1}
              onChange={(e) => setLocalSettings({ ...localSettings, workWeekStart: parseInt(e.target.value) })}
              className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 outline-none transition-all"
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
              <option value={2}>Tuesday</option>
              <option value={3}>Wednesday</option>
              <option value={4}>Thursday</option>
              <option value={5}>Friday</option>
              <option value={6}>Saturday</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-tighter">
              Subscription Renewal
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['days', 'weekly', 'monthly_1st', 'monthly_fixed'] as RenewalType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setLocalSettings({ ...localSettings, renewalType: type })}
                  className={cn(
                    "p-3 text-xs font-mono font-bold rounded-xl border transition-all",
                    localSettings.renewalType === type 
                      ? "bg-zinc-900 text-white border-zinc-900" 
                      : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400"
                  )}
                >
                  {type.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {localSettings.renewalType === 'days' && (
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-tighter">
                Every X Days
              </label>
              <input 
                type="number" 
                value={localSettings.renewalValue ?? 1}
                onChange={(e) => setLocalSettings({ ...localSettings, renewalValue: parseInt(e.target.value) })}
                className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 outline-none transition-all"
              />
            </div>
          )}

          {localSettings.renewalType === 'monthly_fixed' && (
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-tighter">
                Day of Month (1-31)
              </label>
              <input 
                type="number" 
                min="1"
                max="31"
                value={localSettings.renewalValue ?? 1}
                onChange={(e) => setLocalSettings({ ...localSettings, renewalValue: parseInt(e.target.value) })}
                className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 outline-none transition-all"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-tighter">
              Last Renewal Date (Anchor)
            </label>
            <input 
              type="date" 
              value={localSettings.lastRenewalDate.split('T')[0]}
              onChange={(e) => setLocalSettings({ ...localSettings, lastRenewalDate: new Date(e.target.value).toISOString() })}
              className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-tighter">
              Max Target Percentage (%)
            </label>
            <input 
              type="number" 
              min="1"
              max="100"
              value={localSettings.maxPercentage ?? 95}
              onChange={(e) => setLocalSettings({ ...localSettings, maxPercentage: parseInt(e.target.value) || 0 })}
              className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 outline-none transition-all"
            />
            <p className="text-[10px] text-zinc-400 font-mono">
              The total percentage will be distributed across work days to reach this target.
            </p>
          </div>

          <button 
            type="submit"
            className="w-full py-4 bg-zinc-900 text-white rounded-xl font-display font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors shadow-lg"
          >
            <Save className="w-5 h-5" />
            Save Configuration
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
