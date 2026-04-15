import { DateTime } from "luxon";

export const DEFAULT_TIMEZONE = "Europe/Paris";

export function normalizeDateArgs(args = {}) {
  const hasDate = Boolean(args.date);
  const hasStart = Boolean(args.start_date);
  const hasEnd = Boolean(args.end_date);

  if (hasDate && (hasStart || hasEnd)) {
    throw new Error("Provide either date or start_date/end_date, not both.");
  }
  if (!hasDate && hasStart !== hasEnd) {
    throw new Error("Both start_date and end_date are required for a date range.");
  }
  if (!hasDate && !hasStart && !hasEnd) {
    throw new Error("Provide a date or a start_date/end_date range.");
  }

  const startDate = hasDate ? args.date : args.start_date;
  const endDate = hasDate ? args.date : args.end_date;
  assertIsoDate(startDate, "start date");
  assertIsoDate(endDate, "end date");

  return {
    start_date: startDate,
    end_date: endDate,
    timezone: args.timezone ?? DEFAULT_TIMEZONE,
  };
}

export function dateWindow(args = {}) {
  const normalized = normalizeDateArgs(args);
  const start = DateTime.fromISO(normalized.start_date, { zone: normalized.timezone }).startOf("day");
  const endInclusive = DateTime.fromISO(normalized.end_date, { zone: normalized.timezone }).startOf("day");

  if (!start.isValid) {
    throw new Error(`Invalid start date: ${normalized.start_date}`);
  }
  if (!endInclusive.isValid) {
    throw new Error(`Invalid end date: ${normalized.end_date}`);
  }
  if (endInclusive < start) {
    throw new Error("end_date must be on or after start_date.");
  }

  return {
    ...normalized,
    startUtc: start.toUTC(),
    endUtcExclusive: endInclusive.plus({ days: 1 }).toUTC(),
  };
}

function assertIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label}: expected YYYY-MM-DD.`);
  }
}
