import React, { useState, useEffect } from 'react';
import { X, Save, Github, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { UserSettings, RenewalType } from '../types';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { calculateDayValue, calculateCycleData } from '../lib/calculations';
import { format } from 'date-fns';
import type { CopilotUsageSummaryEx } from '../lib/useGithubUsage';

interface SettingsProps {
  settings: UserSettings;
  onSave: (settings: UserSettings) => void;
  onClose: () => void;
  usage: CopilotUsageSummaryEx;
}

export default function Settings({ settings, onSave, onClose, usage }: SettingsProps) {
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings);
  const [githubStatus, setGithubStatus] = useState<{ connected: boolean; user?: any; copilot?: any; quota?: any }>({ connected: false });
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
        
        // Fetch quota data
        let quota = null;
        try {
          const quotaRes = await fetch('/api/user/copilot-quota');
          if (quotaRes.ok) {
            quota = await quotaRes.json();
          }
        } catch (err) {
          console.error('Failed to fetch quota:', err);
        }

        setGithubStatus({ connected: true, ...info, quota });
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
        initial={{ scale: 0.95, opacity: 0, overflow: 'auto' }}
        animate={{ scale: 1, opacity: 1, overflow: 'auto' }}
        exit={{ scale: 0.95, opacity: 0, overflow: 'auto' }}
        className="bg-white w-full h-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
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

          <div className="space-y-4 pt-4 border-t border-zinc-100">
            <label className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-tighter">
              GitHub Integration
            </label>

            {/* Org / Enterprise slug inputs — required for SAML-SSO orgs that don't appear in /user/orgs */}
            <div className="space-y-3 p-3 bg-zinc-50 rounded-xl border border-zinc-200">
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-tighter">
                  Organization Slug (optional)
                </label>
                <input
                  type="text"
                  value={localSettings.organizationSlug ?? ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, organizationSlug: e.target.value.trim() || undefined })}
                  placeholder="e.g. ELX-EMCC-DevOps"
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-tighter">
                  Enterprise Slug (optional)
                </label>
                <input
                  type="text"
                  value={localSettings.enterpriseSlug ?? ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, enterpriseSlug: e.target.value.trim() || undefined })}
                  placeholder="e.g. my-enterprise"
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-all"
                />
              </div>
              <p className="text-[10px] text-zinc-500 leading-tight">
                Required for <strong>SAML-SSO-protected</strong> orgs (don't appear in auto-discovery).
                Your PAT must be <strong>SSO-authorized</strong> for the org
                (Settings → Developer settings → Personal access tokens → Configure SSO).
                Scopes: <code className="bg-zinc-200 px-1 rounded">read:org</code> +{' '}
                <code className="bg-zinc-200 px-1 rounded">manage_billing:copilot</code>.
              </p>
            </div>

            {!githubStatus.connected ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleConnectGithub}
                  disabled={loading}
                  className="w-full py-3 bg-zinc-900 text-white rounded-xl font-display font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors shadow-md disabled:opacity-50"
                >
                  <Github className="w-5 h-5" />
                  {loading ? 'Connecting...' : 'Connect GitHub'}
                </button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-zinc-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-zinc-400 font-mono">Or</span>
                  </div>
                </div>

                {!showManualToken ? (
                  <button
                    type="button"
                    onClick={() => setShowManualToken(true)}
                    className="w-full py-2 text-xs font-mono font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
                  >
                    Use Personal Access Token (Classic)
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="password"
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx"
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-all"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleManualTokenSubmit}
                        disabled={loading || !manualToken}
                        className="flex-1 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-xs font-bold hover:bg-zinc-200 transition-colors disabled:opacity-50"
                      >
                        Save Token
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowManualToken(false)}
                        className="px-4 py-2 text-zinc-400 hover:text-zinc-900 transition-colors text-xs font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-tight">
                      Requires <code className="bg-zinc-100 px-1 rounded">read:user</code> and <code className="bg-zinc-100 px-1 rounded">manage_billing:copilot</code> scopes.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                  <div className="flex items-center gap-3">
                    <img 
                      src={githubStatus.user?.avatar_url} 
                      alt="GitHub Avatar" 
                      className="w-8 h-8 rounded-full border border-zinc-200"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <p className="text-sm font-bold text-zinc-900">{githubStatus.user?.login}</p>
                      <p className="text-[10px] font-mono text-zinc-500 uppercase">Connected</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogoutGithub}
                    className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>

                {githubStatus.quota || usage.connected ? (
                  <div className="space-y-3">
                    <div className="p-4 bg-zinc-900 text-white rounded-xl space-y-4 shadow-inner">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <h4 className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">GitHub Copilot Quota Usage</h4>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-zinc-300">Chat messages</span>
                          <span className="text-zinc-500">included</span>
                        </div>
                        <div className="h-px bg-zinc-800 w-full" />

                        <div className="flex justify-between items-center text-sm">
                          <span className="text-zinc-300">Code completions</span>
                          <span className="text-zinc-500">included</span>
                        </div>
                        <div className="h-px bg-zinc-800 w-full" />

                        {/* Premium requests — prefer live usage hook data, fall back to quota token */}
                        {(() => {
                          const limit = usage.limit || githubStatus.quota?.quota?.premium_requests?.limit || 0;
                          const used = usage.connected
                            ? usage.cycleTotal
                            : (githubStatus.quota?.quota?.premium_requests?.usage ?? 0);
                          const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
                          const { cycleStart, cycleEnd } = calculateCycleData(new Date(), settings);
                          const todayPct = calculateDayValue(new Date(), settings).cumulativePercentage;
                          const actualPct = limit > 0 ? (used / limit) * 100 : 0;
                          const delta = actualPct - todayPct;
                          const statusColor = delta > 5 ? 'text-red-400' : delta < -10 ? 'text-amber-400' : 'text-emerald-400';
                          const statusLabel = delta > 5 ? '▲ Over target' : delta < -10 ? '▼ Under target' : '✓ On track';

                          return (
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-zinc-300">Premium requests</span>
                                <span className="text-zinc-400">
                                  {used} / {limit > 0 ? limit : '—'}
                                  {limit > 0 && ` (${pct.toFixed(1)}%)`}
                                </span>
                              </div>
                              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden relative">
                                {/* target marker */}
                                {limit > 0 && (
                                  <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-zinc-400 z-10"
                                    style={{ left: `${Math.min(todayPct, 100)}%` }}
                                  />
                                )}
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              {limit > 0 && (
                                <div className="flex justify-between items-center">
                                  <span className={cn("text-[10px] font-mono font-bold", statusColor)}>{statusLabel}</span>
                                  <span className="text-[10px] font-mono text-zinc-600">
                                    Target today: {todayPct.toFixed(1)}%
                                  </span>
                                </div>
                              )}
                              <div className="text-[10px] font-mono text-zinc-600">
                                Cycle: {format(cycleStart, 'MMM d')} – {format(cycleEnd, 'MMM d, yyyy')}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="pt-2 text-xs text-zinc-500 leading-relaxed space-y-1">
                        {usage.scope === 'individual' && (
                          <p className="text-amber-400">
                            ⓘ Individual Copilot Pro/Pro+ accounts have no public usage API.
                            Limit shown is derived from plan type ({usage.planType ?? 'unknown'}).
                          </p>
                        )}
                        {usage.scope === 'organization' && usage.orgsWithData && usage.orgsWithData.length > 0 && (
                          <p className="text-emerald-400">
                            ✓ Aggregated from {usage.orgsWithData.length} org(s): {usage.orgsWithData.join(', ')}
                          </p>
                        )}
                        {usage.message && (
                          <p className="text-zinc-500">{usage.message}</p>
                        )}
                        <p>The grey marker shows where your target pace should be today.</p>
                      </div>
                    </div>
                  </div>
                ) : githubStatus.copilot ? (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-emerald-900">Copilot Active</p>
                      <p className="text-xs text-emerald-700">
                        {githubStatus.copilot.organization 
                          ? `Seat managed by ${githubStatus.copilot.organization.login}`
                          : 'Individual subscription found.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-900">No Copilot Found</p>
                      <p className="text-xs text-amber-700">
                        We couldn't find an active Copilot subscription for this account.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
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
