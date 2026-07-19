import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "flashback_organizer";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_VERSION = "v1";

function getAuthConfig() {
  const password = process.env.FLASHBACK_ORGANIZER_PASSWORD?.trim();
  const secret = process.env.FLASHBACK_SESSION_SECRET?.trim();

  if (!password || !secret) {
    throw new Error("ORGANIZER_AUTH_NOT_CONFIGURED");
  }

  return { password, secret };
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function signSession(expiresAt: number, secret: string) {
  return createHmac("sha256", secret)
    .update(`${SESSION_VERSION}:${expiresAt}`, "utf8")
    .digest("base64url");
}

function createSessionValue(secret: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return `${SESSION_VERSION}.${expiresAt}.${signSession(expiresAt, secret)}`;
}

function verifySessionValue(value: string | undefined, secret: string) {
  if (!value) return false;

  const [version, expiresRaw, signature, ...extra] = value.split(".");
  const expiresAt = Number(expiresRaw);
  const now = Math.floor(Date.now() / 1000);

  if (
    extra.length > 0 ||
    version !== SESSION_VERSION ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + SESSION_TTL_SECONDS
  ) {
    return false;
  }

  const expected = digest(signSession(expiresAt, secret));
  const received = digest(signature ?? "");
  return timingSafeEqual(expected, received);
}

export function verifyOrganizerPassword(candidate: string) {
  const { password } = getAuthConfig();
  return timingSafeEqual(digest(candidate), digest(password));
}

export async function isOrganizerAuthenticated() {
  const { secret } = getAuthConfig();
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  return verifySessionValue(cookie, secret);
}

export async function createOrganizerSession() {
  const { secret } = getAuthConfig();
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSessionValue(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    priority: "high",
  });
}

export async function deleteOrganizerSession() {
  (await cookies()).delete(COOKIE_NAME);
}
