import React, { useState, useEffect } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isToday
} from 'date-fns';
import { ChevronLeft, ChevronRight, Settings as SettingsIcon, Github, Bot, Calendar as CalendarIcon } from 'lucide-react';
import { UserSettings } from '../types';
import { isWorkDay, calculateCycleData, calculateDayValue } from '../lib/calculations';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface CalendarProps {
  settings: UserSettings;
  onOpenSettings: () => void;
}

export default function Calendar({ settings, onOpenSettings }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [days, setDays] = useState<Date[]>([]);
  const [githubConnected, setGithubConnected] = useState(false);

  useEffect(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: settings.workWeekStart as any });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: settings.workWeekStart as any });
    setDays(eachDayOfInterval({ start, end }));
  }, [currentMonth, settings.workWeekStart]);

  useEffect(() => {
    fetch('/api/user/github-status')
      .then(res => res.json())
      .then(data => setGithubConnected(data.connected))
      .catch(() => setGithubConnected(false));
  }, []);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

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
            {githubConnected && (
              <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 text-[10px] font-bold">
                <Github className="w-3 h-3" />
                Synced
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
          <button 
            onClick={prevMonth}
            className="p-2 hover:bg-zinc-200 rounded-full transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={nextMonth}
            className="p-2 hover:bg-zinc-200 rounded-full transition-colors"
          >
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
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
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
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                          {cumulativePercentage.toFixed(1)}%
                        </span>
                        <span className="text-[8px] font-mono text-zinc-400 mt-0.5">
                          +{dailyPercentage.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {isWork && isCurrentMonth && (
                    <div className="mt-auto">
                      <div className="h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${cumulativePercentage}%` }}
                          className="h-full bg-emerald-500"
                        />
                      </div>
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

      <footer className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </footer>
    </div>
  );
}
