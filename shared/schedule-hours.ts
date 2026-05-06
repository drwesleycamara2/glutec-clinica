export const SCHEDULE_DAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"] as const;
export type ScheduleDayKey = (typeof SCHEDULE_DAY_KEYS)[number];

export const SCHEDULE_DAY_LABELS: Record<ScheduleDayKey, string> = {
  "0": "Domingo",
  "1": "Segunda-feira",
  "2": "Terça-feira",
  "3": "Quarta-feira",
  "4": "Quinta-feira",
  "5": "Sexta-feira",
  "6": "Sábado",
};

export type ScheduleDay = {
  enabled: boolean;
  start: string;
  end: string;
};

export type WeeklySchedule = {
  intervalMinutes: number;
  days: Record<ScheduleDayKey, ScheduleDay>;
};

export type ClinicOpeningHoursConfig = {
  version: 1;
  timezone: string;
  intervalMinutes: number;
  clinic: WeeklySchedule;
  professionals: Record<string, WeeklySchedule>;
};

const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

function defaultDayFor(key: ScheduleDayKey): ScheduleDay {
  if (key === "0") return { enabled: false, start: "08:30", end: "19:00" };
  if (key === "6") return { enabled: true, start: "09:30", end: "13:00" };
  return { enabled: true, start: "08:30", end: "19:00" };
}

export function createDefaultWeeklySchedule(): WeeklySchedule {
  return {
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    days: SCHEDULE_DAY_KEYS.reduce((acc, key) => {
      acc[key] = defaultDayFor(key);
      return acc;
    }, {} as Record<ScheduleDayKey, ScheduleDay>),
  };
}

export function createDefaultOpeningHoursConfig(): ClinicOpeningHoursConfig {
  return {
    version: 1,
    timezone: DEFAULT_TIMEZONE,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    clinic: createDefaultWeeklySchedule(),
    professionals: {},
  };
}

export const DEFAULT_OPENING_HOURS_CONFIG = createDefaultOpeningHoursConfig();

function parseJsonMaybe(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function timeToMinutes(value: unknown, fallback = 0) {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;
  return hours * 60 + minutes;
}

export function minutesToTime(value: number) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeTime(value: unknown, fallback: string) {
  return minutesToTime(timeToMinutes(value, timeToMinutes(fallback)));
}

function dayKeyFromLegacy(value: unknown): ScheduleDayKey | null {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (/^[0-6]$/.test(text)) return text as ScheduleDayKey;
  if (text.startsWith("dom")) return "0";
  if (text.startsWith("seg")) return "1";
  if (text.startsWith("ter")) return "2";
  if (text.startsWith("qua")) return "3";
  if (text.startsWith("qui")) return "4";
  if (text.startsWith("sex")) return "5";
  if (text.startsWith("sab")) return "6";
  return null;
}

function normalizeLegacyOpeningHoursArray(input: unknown[]): WeeklySchedule {
  const weekly = createDefaultWeeklySchedule();
  for (const row of input) {
    const item = row as any;
    const key = dayKeyFromLegacy(item?.day ?? item?.weekday ?? item?.weekDay);
    if (!key) continue;
    const start = normalizeTime(item?.start ?? item?.open ?? item?.from, weekly.days[key].start);
    const end = normalizeTime(item?.end ?? item?.close ?? item?.to, weekly.days[key].end);
    weekly.days[key] = {
      enabled: item?.enabled === undefined ? true : Boolean(item.enabled),
      start,
      end,
    };
  }
  return normalizeWeeklySchedule(weekly);
}

export function normalizeWeeklySchedule(value: unknown): WeeklySchedule {
  if (Array.isArray(value)) return normalizeLegacyOpeningHoursArray(value);

  const parsed = parseJsonMaybe(value) as any;
  const base = createDefaultWeeklySchedule();
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const sourceDays = source.days && typeof source.days === "object" ? source.days : {};
  const intervalMinutes = Math.max(5, Math.min(Number(source.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES) || DEFAULT_INTERVAL_MINUTES, 240));

  for (const key of SCHEDULE_DAY_KEYS) {
    const incoming = sourceDays[key] ?? sourceDays[Number(key)] ?? {};
    const start = normalizeTime(incoming.start, base.days[key].start);
    const end = normalizeTime(incoming.end, base.days[key].end);
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);
    base.days[key] = {
      enabled: Boolean(incoming.enabled ?? base.days[key].enabled),
      start,
      end,
    };
  }

  return { intervalMinutes, days: base.days };
}

export function normalizeOpeningHoursConfig(value: unknown): ClinicOpeningHoursConfig {
  const parsed = parseJsonMaybe(value) as any;
  if (Array.isArray(parsed)) {
    return {
      ...createDefaultOpeningHoursConfig(),
      clinic: normalizeLegacyOpeningHoursArray(parsed),
    };
  }

  if (parsed && typeof parsed === "object" && parsed.days) {
    return {
      ...createDefaultOpeningHoursConfig(),
      clinic: normalizeWeeklySchedule(parsed),
    };
  }

  const source = parsed && typeof parsed === "object" ? parsed : {};
  const defaultConfig = createDefaultOpeningHoursConfig();
  const intervalMinutes = Math.max(5, Math.min(Number(source.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES) || DEFAULT_INTERVAL_MINUTES, 240));
  const professionals: Record<string, WeeklySchedule> = {};
  const sourceProfessionals = source.professionals && typeof source.professionals === "object" ? source.professionals : {};

  for (const [professionalId, schedule] of Object.entries(sourceProfessionals)) {
    professionals[String(professionalId)] = normalizeWeeklySchedule(schedule);
  }

  return {
    version: 1,
    timezone: String(source.timezone || DEFAULT_TIMEZONE),
    intervalMinutes,
    clinic: normalizeWeeklySchedule(source.clinic ?? defaultConfig.clinic),
    professionals,
  };
}

export function cloneWeeklySchedule(schedule: WeeklySchedule): WeeklySchedule {
  return normalizeWeeklySchedule(JSON.parse(JSON.stringify(schedule)));
}

export function cloneOpeningHoursConfig(config: ClinicOpeningHoursConfig): ClinicOpeningHoursConfig {
  return normalizeOpeningHoursConfig(JSON.parse(JSON.stringify(config)));
}

export function ensureProfessionalSchedules(config: ClinicOpeningHoursConfig, professionals: Array<{ id: number | string }>) {
  const next = cloneOpeningHoursConfig(config);
  for (const professional of professionals) {
    const key = String(professional.id);
    if (!next.professionals[key]) {
      next.professionals[key] = createDefaultWeeklySchedule();
    }
  }
  return next;
}

export function intersectWeeklySchedules(clinic: WeeklySchedule, professional: WeeklySchedule): WeeklySchedule {
  const next = createDefaultWeeklySchedule();
  next.intervalMinutes = Math.max(Number(clinic.intervalMinutes || DEFAULT_INTERVAL_MINUTES), Number(professional.intervalMinutes || DEFAULT_INTERVAL_MINUTES));

  for (const key of SCHEDULE_DAY_KEYS) {
    const clinicDay = clinic.days[key];
    const professionalDay = professional.days[key];
    const start = Math.max(timeToMinutes(clinicDay.start), timeToMinutes(professionalDay.start));
    const end = Math.min(timeToMinutes(clinicDay.end), timeToMinutes(professionalDay.end));
    next.days[key] = {
      enabled: Boolean(clinicDay.enabled && professionalDay.enabled && end > start),
      start: minutesToTime(start),
      end: minutesToTime(end),
    };
  }

  return next;
}

export function getScheduleForProfessional(config: ClinicOpeningHoursConfig, professionalId?: string | number | null) {
  const normalized = normalizeOpeningHoursConfig(config);
  if (professionalId === null || professionalId === undefined || String(professionalId) === "" || String(professionalId) === "all") {
    return normalized.clinic;
  }
  const professionalSchedule = normalized.professionals[String(professionalId)] ?? createDefaultWeeklySchedule();
  return intersectWeeklySchedules(normalized.clinic, professionalSchedule);
}

export function generateTimeSlotsForDate(date: Date, schedule: WeeklySchedule) {
  const dayKey = String(date.getDay()) as ScheduleDayKey;
  const day = schedule.days[dayKey];
  if (!day?.enabled) return [];

  const interval = Math.max(5, Number(schedule.intervalMinutes || DEFAULT_INTERVAL_MINUTES));
  const start = timeToMinutes(day.start);
  const end = timeToMinutes(day.end);
  if (end <= start) return [];

  const slots: string[] = [];
  for (let minute = start; minute <= end; minute += interval) {
    slots.push(minutesToTime(minute));
  }
  return slots;
}

export function isDateTimeInsideSchedule(date: Date, schedule: WeeklySchedule, _durationMinutes = DEFAULT_INTERVAL_MINUTES) {
  const dayKey = String(date.getDay()) as ScheduleDayKey;
  const day = schedule.days[dayKey];
  if (!day?.enabled) return false;
  const start = timeToMinutes(day.start);
  const end = timeToMinutes(day.end);
  const current = date.getHours() * 60 + date.getMinutes();
  return current >= start && current <= end;
}

export function sortTimeSlots(slots: string[]) {
  return Array.from(new Set(slots)).sort((left, right) => timeToMinutes(left) - timeToMinutes(right));
}