// Re-exported from the shared module so the app and the emailed report cannot
// disagree about what a day's numbers are. See supabase/functions/_shared/report.ts.
export {
  buildDailySeries,
  rollingAverage,
  totals,
  pctChange,
  LOWER_IS_BETTER,
  daysAgo,
} from '../../supabase/functions/_shared/report.ts'
