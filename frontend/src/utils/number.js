export const toFa = (n) => {
  try {
    return Number(n).toLocaleString("fa-IR");
  } catch {
    return String(n);
  }
};
