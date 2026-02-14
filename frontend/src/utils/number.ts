export const toFa = (n: number | string): string => {
  try {
    return Number(n).toLocaleString("fa-IR");
  } catch {
    return String(n);
  }
};
