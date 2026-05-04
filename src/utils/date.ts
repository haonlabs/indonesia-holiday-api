export function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
