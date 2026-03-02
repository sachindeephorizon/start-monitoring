const MONTH_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

export const formatFullDateLabel = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

export const parseFullDateLabel = (label: string): Date => {
  const regex = /^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d+),\s+(\d{4})$/;
  const match = label.match(regex);
  if (match) {
    const [, monthName, dayStr, yearStr] = match;
    const monthIndex = MONTH_INDEX[monthName.toLowerCase()];
    const day = parseInt(dayStr, 10);
    const year = parseInt(yearStr, 10);

    if (Number.isFinite(monthIndex) && Number.isFinite(day) && Number.isFinite(year)) {
      const date = new Date(year, monthIndex, day);
      date.setHours(0, 0, 0, 0);
      return date;
    }
  }

  const fallback = new Date(label);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

