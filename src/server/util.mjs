// Shared server-side utilities. Amounts stored as numeric(14,2) come back as strings.

export const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
export const n0 = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const TZ = { timeZone: "Asia/Karachi" };

export function todayStr() {
  return new Intl.DateTimeFormat("en-CA", TZ).format(new Date());
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Monday of the week containing dateStr
export function weekMonday(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function monthStart(dateStr) {
  return dateStr.slice(0, 8) + "01";
}

export const canOverride = (role) => ["owner", "manager"].includes(role);
export const canManageMoney = (role) => ["owner", "manager", "accountant", "cashier"].includes(role);

export class BizError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
