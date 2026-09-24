export function parseBedtimeLabel(label: string): { hour: number; minute: number } | null {
  const match = label.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null
  const mer = match[3]
  if (hour === 12) hour = 0
  if (mer === "pm") hour += 12
  if (hour > 23) return null
  return { hour, minute }
}

/** Dream night rolls at 4:47 AM in the recipient's local timezone. */
export const DREAM_NIGHT_RESET_MINUTES = 4 * 60 + 47

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format()
    return true
  } catch {
    return false
  }
}

/**
 * Calendar date of the dream night containing `at` in `timeZone`.
 * Before 4:47 AM local, this is still the previous calendar date.
 * The day boundary is calendar arithmetic in that zone, so DST shifts do not move the reset.
 */
export function dreamNightDate(timeZone: string, at = new Date()): string {
  const clock = zonedClock(timeZone, at)
  if (clock.minutes >= DREAM_NIGHT_RESET_MINUTES) return clock.dateKey
  const prior = new Date(Date.UTC(clock.year, clock.month - 1, clock.day))
  prior.setUTCDate(prior.getUTCDate() - 1)
  const year = prior.getUTCFullYear()
  const month = prior.getUTCMonth() + 1
  const day = prior.getUTCDate()
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function zonedClock(timeZone: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  const year = read("year")
  const month = read("month")
  const day = read("day")
  const rawHour = read("hour")
  const hour = rawHour === 24 ? 0 : rawHour
  const minute = read("minute")
  return {
    year,
    month,
    day,
    hour,
    minute,
    dateKey: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    minutes: hour * 60 + minute,
  }
}

/**
 * True from the local bedtime until the 4:47 AM dream-night reset.
 * One send per night is enforced by last_notified_on, so a late cron
 * still delivers instead of missing a 15-minute slot.
 */
export function bedtimeDue(
  bedtime: string | null,
  timeZone: string,
  at = new Date(),
): { due: boolean; dateKey: string } {
  const night = dreamNightDate(timeZone, at)
  const clock = zonedClock(timeZone, at)
  const parsed = bedtime ? parseBedtimeLabel(bedtime) : null
  if (!parsed) return { due: false, dateKey: night }
  const target = parsed.hour * 60 + parsed.minute
  const pastBedtime =
    target >= DREAM_NIGHT_RESET_MINUTES
      ? clock.minutes >= target || clock.minutes < DREAM_NIGHT_RESET_MINUTES
      : clock.minutes >= target && clock.minutes < DREAM_NIGHT_RESET_MINUTES
  return { due: pastBedtime, dateKey: night }
}
