import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { BizError } from "./util.mjs";

const COOKIE = "faberp_sid";

export function hashPassword(pw) {
  const salt = randomBytes(12).toString("hex");
  const hash = scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(pw, salt, 32);
  const target = Buffer.from(hash, "hex");
  return test.length === target.length && timingSafeEqual(test, target);
}

export async function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await db.insert(sessions).values({ token, userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  jar.delete(COOKIE);
}

export async function getUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      businessId: users.businessId,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.token, token))
    .limit(1);
  const u = rows[0];
  if (!u || !u.active) return null;
  return u;
}

export async function requireUser() {
  const u = await getUser();
  if (!u) throw new BizError("Not authenticated", 401);
  return u;
}

export async function login(email, password) {
  const rows = await db.select().from(users).where(eq(users.email, String(email).toLowerCase().trim())).limit(1);
  const u = rows[0];
  if (!u || !u.active) throw new BizError("Invalid email or password", 401);
  if (!verifyPassword(password, u.passwordHash)) throw new BizError("Invalid email or password", 401);
  await createSession(u.id);
  return u;
}

// naive request-rate guard (in-memory) for auth endpoint
const hits = new Map();
export function rateLimit(key, max = 10, windowMs = 60000) {
  const now = Date.now();
  const rec = hits.get(key) || { count: 0, start: now };
  if (now - rec.start > windowMs) {
    rec.count = 0;
    rec.start = now;
  }
  rec.count += 1;
  hits.set(key, rec);
  return rec.count <= max;
}

export function sha1(s) {
  return createHash("sha1").update(s).digest("hex");
}
