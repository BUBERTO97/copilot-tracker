import { 
  addDays, 
  addMonths, 
  addWeeks, 
  differenceInDays, 
  getDay, 
  isBefore, 
  isSameDay, 
  startOfMonth, 
  setDay, 
  setDate,
  startOfDay,
  isAfter,
  eachDayOfInterval
} from 'date-fns';
import { UserSettings } from '../types';

/**
 * Checks if a date is a work day based on user settings.
 * Example: workDaysPerWeek = 5, workWeekStart = 1 (Monday)
 * Work days: 1, 2, 3, 4, 5 (Mon, Tue, Wed, Thu, Fri)
 */
export function isWorkDay(date: Date, settings: UserSettings): boolean {
  const dayOfWeek = getDay(date); // 0 (Sun) to 6 (Sat)
  
  // Normalize day of week relative to workWeekStart
  // If workWeekStart is 1 (Mon), then Mon=0, Tue=1, ..., Sun=6
  let relativeDay = (dayOfWeek - settings.workWeekStart + 7) % 7;
  
  return relativeDay < settings.workDaysPerWeek;
}

/**
 * Finds the start and end of the subscription cycle containing the given date.
 */
export function getSubscriptionCycle(date: Date, settings: UserSettings): { start: Date; end: Date } {
  const targetDate = startOfDay(date);
  let currentStart = startOfDay(new Date(settings.lastRenewalDate));

  // If the last renewal date is in the future relative to target, we need to go backwards
  // But usually, lastRenewalDate is the "anchor"
  
  // For simplicity, let's find the cycle by iterating from the anchor
  if (isBefore(targetDate, currentStart)) {
    // Go backwards
    while (isBefore(targetDate, currentStart) || isSameDay(targetDate, currentStart)) {
      const prev = getPreviousRenewal(currentStart, settings);
      if (isSameDay(prev, currentStart)) break; // Safety
      currentStart = prev;
    }
  }

  // Now currentStart is before or equal to targetDate
  // Find the next renewal
  let nextRenewal = getNextRenewal(currentStart, settings);
  
  // Keep advancing until targetDate is within [currentStart, nextRenewal)
  while (isAfter(targetDate, nextRenewal) || isSameDay(targetDate, nextRenewal)) {
    currentStart = nextRenewal;
    nextRenewal = getNextRenewal(currentStart, settings);
  }

  return { start: currentStart, end: nextRenewal };
}

function getNextRenewal(current: Date, settings: UserSettings): Date {
  switch (settings.renewalType) {
    case 'days':
      return addDays(current, settings.renewalValue);
    case 'weekly':
      return addWeeks(current, 1);
    case 'monthly_1st':
      return startOfMonth(addMonths(current, 1));
    case 'monthly_fixed':
      const nextMonth = addMonths(current, 1);
      return setDate(nextMonth, settings.renewalValue);
    default:
      return addDays(current, 30);
  }
}

function getPreviousRenewal(current: Date, settings: UserSettings): Date {
  switch (settings.renewalType) {
    case 'days':
      return addDays(current, -settings.renewalValue);
    case 'weekly':
      return addWeeks(current, -1);
    case 'monthly_1st':
      return startOfMonth(addMonths(current, -1));
    case 'monthly_fixed':
      const prevMonth = addMonths(current, -1);
      return setDate(prevMonth, settings.renewalValue);
    default:
      return addDays(current, -30);
  }
}

/**
 * Counts work days in a cycle and returns the percentage per work day.
 */
export function calculateCycleData(date: Date, settings: UserSettings) {
  const { start, end } = getSubscriptionCycle(date, settings);
  
  // Get all days in the cycle interval [start, end)
  // date-fns eachDayOfInterval is inclusive, so we subtract 1 day from end
  const days = eachDayOfInterval({ start, end: addDays(end, -1) });
  
  const workDays = days.filter(d => isWorkDay(d, settings));
  const workDaysCount = workDays.length;
  
  const percentage = workDaysCount > 0 ? settings.maxPercentage / workDaysCount : 0;
  
  return {
    workDaysCount,
    percentage,
    cycleStart: start,
    cycleEnd: end
  };
}

/**
 * Calculates both daily and cumulative percentage for a specific date.
 */
export function calculateDayValue(date: Date, settings: UserSettings) {
  const { start, end } = getSubscriptionCycle(date, settings);
  const daysInCycle = eachDayOfInterval({ start, end: addDays(end, -1) });
  
  const workDays = daysInCycle.filter(d => isWorkDay(d, settings));
  const workDaysCount = workDays.length;
  const dailyPercentage = workDaysCount > 0 ? settings.maxPercentage / workDaysCount : 0;

  const targetDate = startOfDay(date);
  const workDaysUpToDate = workDays.filter(d => isBefore(d, targetDate) || isSameDay(d, targetDate));
  const cumulativePercentage = workDaysUpToDate.length * dailyPercentage;

  return {
    dailyPercentage,
    cumulativePercentage,
    isWorkDay: isWorkDay(date, settings),
    workDaysCount,
    cycleStart: start,
    cycleEnd: end
  };
}
