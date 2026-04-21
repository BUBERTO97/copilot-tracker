import React, { useState, useEffect } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  addMonths,
  subMonths,
  isToday
} from 'date-fns';
import { ChevronLeft, ChevronRight, Settings as SettingsIcon, Github, Bot, Calendar as CalendarIcon, TrendingUp } from 'lucide-react';
import { UserSettings, CopilotUsageSummary } from '../types';
import { calculateDayValue } from '../lib/calculations';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface CalendarProps {
  settings: UserSettings;
  onOpenSettings: () => void;
  usage: CopilotUsageSummary;
}

export default function Calendar({ settings, onOpenSettings, usage }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [days, setDays] = useState<Date[]>([]);

  useEffect(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: settings.workWeekStart as any });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: settings.workWeekStart as any });
    setDays(eachDayOfInterval({ start, end }));
  }, [currentMonth, settings.workWeekStart]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  // Today's projected target for the "Actual vs Target" card
  const todayData = calculateDayValue(new Date(), settings);
  const projectedToday = todayData.cumulativePercentage;

  // Actual usage as a % of limit for the current cycle
  const actualPct = usage.connected && usage.limit > 0
    ? Math.min((usage.cycleTotal / usage.limit) * 100, 100)
    : null;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-8">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-6 group-hover:rotate-0 transition-transform">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center shadow-md border-2 border-zinc-50">
              <CalendarIcon className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-4xl font-display font-bold tracking-tight text-zinc-900">
              {format(currentMonth, 'MMMM yyyy')}
            </h1>
            <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest mt-1 flex items-center gap-2">
              Copilot Value Tracker
              {usage.connected && (
                <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 text-[10px] font-bold">
                  <Github className="w-3 h-3" />
                  Synced
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={nextMonth} className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={onOpenSettings}
            className="ml-4 p-2 bg-zinc-900 text-white rounded-full hover:bg-zinc-800 transition-colors shadow-lg"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 border-t border-l border-zinc-200 rounded-xl overflow-hidden shadow-sm bg-white">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((_, i) => {
          const dayIdx = (i + settings.workWeekStart) % 7;
          const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIdx];
          return (
            <div key={dayName} className="p-4 text-center border-r border-b border-zinc-200 bg-zinc-50/50">
              <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-tighter">
                {dayName}
              </span>
            </div>
          );
        })}

        <AnimatePresence mode="wait">
          <motion.div
            key={currentMonth.toISOString()}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="contents"
          >
            {days.map((day) => {
              const { isWorkDay: isWork, cumulativePercentage, dailyPercentage } = calculateDayValue(day, settings);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isTodayDate = isToday(day);
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayUsage = usage.byDate[dateKey];
              const actualDayPremium = dayUsage?.premium_requests ?? 0;
              // Per-day actual pct of limit (capped at 100)
              const actualDayPct = usage.connected && usage.limit > 0
                ? Math.min((actualDayPremium / usage.limit) * 100, 100)
                : 0;

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[100px] p-3 border-r border-b border-zinc-200 transition-colors relative group",
                    !isCurrentMonth && "bg-zinc-50/30 opacity-40",
                    isWork && isCurrentMonth && "hover:bg-zinc-50/80"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={cn(
                      "text-sm font-mono font-medium",
                      isTodayDate ? "bg-zinc-900 text-white w-6 h-6 flex items-center justify-center rounded-full" : "text-zinc-400"
                    )}>
                      {format(day, 'd')}
                    </span>
                    {isWork && isCurrentMonth && (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                          {cumulativePercentage.toFixed(1)}%
                        </span>
                        <span className="text-[8px] font-mono text-zinc-400">
                          +{dailyPercentage.toFixed(2)}%
                        </span>
                        {usage.connected && actualDayPremium > 0 && (
                          <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                            {actualDayPremium} req
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {isWork && isCurrentMonth && (
                    <div className="mt-auto space-y-1">
                      {/* Projected target bar (green) */}
                      <div className="h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${cumulativePercentage}%` }}
                          className="h-full bg-emerald-500"
                        />
                      </div>
                      {/* Actual usage bar (blue) — only when connected and limit known */}
                      {usage.connected && usage.limit > 0 && (
                        <div className="h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${actualDayPct}%` }}
                            className="h-full bg-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {!isWork && isCurrentMonth && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-full h-px bg-zinc-100 rotate-45 opacity-50" />
                      <div className="w-full h-px bg-zinc-100 -rotate-45 opacity-50" />
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Legend when GitHub is connected */}
      {usage.connected && usage.limit > 0 && (
        <div className="mt-3 flex items-center gap-4 text-[10px] font-mono text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full bg-emerald-500 inline-block" />
            Projected target (cumulative %)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full bg-blue-500 inline-block" />
            Actual premium requests (% of limit)
          </span>
        </div>
      )}

      <footer className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-zinc-200 shadow-sm">
          <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase mb-2">Work Days</h3>
          <p className="text-2xl font-display font-bold text-zinc-900">
            {settings.workDaysPerWeek} / 7
          </p>
        </div>
        <div className="p-4 bg-white rounded-xl border border-zinc-200 shadow-sm">
          <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase mb-2">Renewal Cycle</h3>
          <p className="text-2xl font-display font-bold text-zinc-900 capitalize">
            {settings.renewalType.replace('_', ' ')}
          </p>
        </div>
        <div className="p-4 bg-white rounded-xl border border-zinc-200 shadow-sm">
          <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase mb-2">Target Value</h3>
          <p className="text-2xl font-display font-bold text-zinc-900">
            {settings.maxPercentage}%
          </p>
        </div>

        {/* Actual vs Target card — shown when GitHub connected */}
        {usage.connected ? (
          <div className={cn(
            "p-4 rounded-xl border shadow-sm",
            actualPct === null
              ? "bg-white border-zinc-200"
              : actualPct > projectedToday + 5
                ? "bg-red-50 border-red-200"
                : actualPct < projectedToday - 10
                  ? "bg-amber-50 border-amber-200"
                  : "bg-emerald-50 border-emerald-200"
          )}>
            <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase mb-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Actual vs Target
            </h3>
            {actualPct !== null ? (
              <>
                <div className="flex items-end gap-1">
                  <p className={cn(
                    "text-2xl font-display font-bold",
                    actualPct > projectedToday + 5 ? "text-red-700"
                      : actualPct < projectedToday - 10 ? "text-amber-700"
                      : "text-emerald-700"
                  )}>
                    {actualPct.toFixed(1)}%
                  </p>
                  <span className="text-xs font-mono text-zinc-500 mb-1">actual</span>
                </div>
                <p className="text-[10px] font-mono text-zinc-500 mt-1">
                  Target today: <span className="font-bold text-zinc-700">{projectedToday.toFixed(1)}%</span>
                </p>
                <p className="text-[10px] font-mono text-zinc-500">
                  {usage.cycleTotal} / {usage.limit} premium req
                </p>
                {/* Combined progress bar */}
                <div className="mt-2 h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden relative">
                  {/* projected target marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-zinc-400 z-10"
                    style={{ left: `${Math.min(projectedToday, 100)}%` }}
                  />
                  {/* actual fill */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(actualPct, 100)}%` }}
                    className={cn(
                      "h-full rounded-full",
                      actualPct > projectedToday + 5 ? "bg-red-500"
                        : actualPct < projectedToday - 10 ? "bg-amber-400"
                        : "bg-emerald-500"
                    )}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs font-mono text-zinc-400">Fetching usage…</p>
            )}
          </div>
        ) : (
          <div className="p-4 bg-white rounded-xl border border-zinc-200 shadow-sm opacity-50">
            <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase mb-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Actual vs Target
            </h3>
            <p className="text-xs font-mono text-zinc-400">Connect GitHub to see real usage</p>
          </div>
        )}
      </footer>
    </div>
  );
}
