export const isVersionGreater = (a: string, b: string): boolean => {
  const parse = (v: string) =>
    v.split('.').map((n) => {
      const parsed = parseInt(n, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    });

  const aParts = parse(a);
  const bParts = parse(b);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const x = aParts[i] ?? 0;
    const y = bParts[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
};
