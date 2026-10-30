import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, demoGrants, businesses } from "@/db/schema";
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

export async function createSession(userId, grantId = null) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  // capture the browser identity for the "Your active sessions" panel;
  // headers() only exists inside a request — scripts/tests fall back to null
  let agent = null;
  try { agent = ((await headers()).get("user-agent") || "").slice(0, 140) || null; } catch { /* outside request context */ }
  await db.insert(sessions).values({ token, userId, grantId, agent, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // Secure over HTTPS in prod; kept off for local http dev
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

// ── "Your active sessions" — visibility + control over one's own login tokens.
// Tokens are never exposed; only metadata + an isCurrent flag leave the server.
export async function mySessions(userId, keepToken) {
  if (userId === undefined) {
    const jar = await cookies();
    keepToken = jar.get(COOKIE)?.value;
    const u = await getUser();
    if (!u) return [];
    userId = u.id;
  }
  const rows = await db.select({
    token: sessions.token, agent: sessions.agent, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt,
  }).from(sessions).where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date()))).orderBy(sessions.createdAt);
  return rows.map(({ token, ...rest }) => ({ ...rest, isCurrent: token === keepToken }));
}

// deletes every session of this user except the one being used right now
// (same mechanism the password-reset flow uses, exposed as a button)
export async function signOutOtherSessions(userId, keepToken) {
  if (keepToken === undefined) keepToken = (await cookies()).get(COOKIE)?.value;
  const rows = keepToken
    ? await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.token, keepToken))).returning({ token: sessions.token })
    : await db.delete(sessions).where(eq(sessions.userId, userId)).returning({ token: sessions.token });
  return rows.length;
}

export async function getUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return resolveSession(token);
}

// Single authentication truth: a token only works while (1) the session row
// exists and has NOT expired (revoke & password-reset expire sessions this way)
// and (2) the user is active and, for demo logins, the grant is still "active"
// and unexpired. Revoking demo access therefore kicks the open session on its
// very next request — no logout needed.
export async function resolveSession(token) {
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      businessId: users.businessId,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      grantId: sessions.grantId,
      grantStatus: demoGrants.status,
      grantExpiresAt: demoGrants.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(demoGrants, eq(demoGrants.id, sessions.grantId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u || !u.active) return null;
  if (u.grantId && u.grantStatus !== "active") return null;
  if (u.grantId && u.grantExpiresAt && new Date(u.grantExpiresAt) < new Date()) return null;
  delete u.grantStatus;
  delete u.grantExpiresAt;
  return u;
}

export async function requireUser() {
  const u = await getUser();
  if (!u) throw new BizError("Not authenticated", 401);
  return u;
}

export async function demoLogin(code) {
  const clean = String(code || "").trim();
  if (!clean) throw new BizError("Enter your demo access code", 400);
  const [grant] = await db.select().from(demoGrants).where(eq(demoGrants.code, clean)).limit(1);
  if (!grant) throw new BizError("Invalid demo access code — ask the business owner for authorization", 403);
  if (grant.status !== "active") throw new BizError("This demo access has been revoked by the owner", 403);
  if (grant.expiresAt && new Date(grant.expiresAt) < new Date()) throw new BizError("This demo access code has expired — ask the owner for a new code", 403);
  const [biz] = await db.select().from(businesses).where(eq(businesses.isDemo, true)).limit(1);
  if (!biz) throw new BizError("Demo environment is not available", 404);
  const email = `demo-grant-${grant.id}@demo.local`;
  let du = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!du.length) {
    du = await db.insert(users).values({
      businessId: biz.id, name: `${grant.clientName} (Demo)`, email,
      passwordHash: randomBytes(16).toString("hex"), role: "demo",
    }).returning();
  }
  if (!du[0].active) throw new BizError("Demo user disabled", 403);
  await createSession(du[0].id, grant.id);
  return { grant, user: du[0] };
}

export async function login(email, password) {
  const rows = await db.select().from(users).where(eq(users.email, String(email).toLowerCase().trim())).limit(1);
  const u = rows[0];
  if (!u || !u.active) throw new BizError("Invalid email or password", 401);
  if (!verifyPassword(password, u.passwordHash)) throw new BizError("Invalid email or password", 401);
  const [biz] = await db.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, u.businessId)).limit(1);
  if (biz && biz.status === "pending") {
    throw new BizError("This business is awaiting owner verification. Enter the 6-digit code the owner shared with you, or use Resend code.", 403);
  }
  await createSession(u.id);
  return u;
}

// request-rate guard (in-memory) for auth endpoints; sweeps stale keys periodically
// so the map can't grow without bound under abuse.
const hits = new Map();
let lastSweep = Date.now();
export function rateLimit(key, max = 10, windowMs = 60000) {
  const now = Date.now();
  if (now - lastSweep > 5 * 60 * 1000) {
    for (const [k, rec] of hits) if (now - rec.start > 10 * 60 * 1000) hits.delete(k);
    lastSweep = now;
  }
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
