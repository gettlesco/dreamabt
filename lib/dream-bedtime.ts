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

export function bedtimeDue(
  bedtime: string | null,
  timeZone: string,
  windowMinutes = 15,
  at = new Date(),
): { due: boolean; dateKey: string } {
  const clock = zonedClock(timeZone, at)
  const parsed = bedtime ? parseBedtimeLabel(bedtime) : null
  if (!parsed) return { due: false, dateKey: clock.dateKey }
  const target = parsed.hour * 60 + parsed.minute
  const delta = clock.minutes - target
  return { due: delta >= 0 && delta < windowMinutes, dateKey: clock.dateKey }
}
