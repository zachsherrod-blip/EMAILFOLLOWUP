export function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function subHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() - hours);
  return result;
}

export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current < end) {
    if (isWeekday(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
