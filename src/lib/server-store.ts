import "server-only";

import type { EventDetails, EventRecord, GuestSession, UploadTicket } from "@/lib/types";

function getEdgeConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("SUPABASE_NOT_CONFIGURED");
  return {
    url: `${supabaseUrl}/functions/v1/flashback-api`,
    anonKey,
  };
}

async function edgeRequest<T>(
  path: string,
  init: RequestInit = {},
  admin = false,
): Promise<T> {
  const { url, anonKey } = getEdgeConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", anonKey);
  headers.set("Authorization", `Bearer ${anonKey}`);
  if (init.body) headers.set("Content-Type", "application/json");
  if (admin) {
    const adminToken = process.env.FLASHBACK_ADMIN_TOKEN;
    if (!adminToken) throw new Error("FLASHBACK_ADMIN_NOT_CONFIGURED");
    headers.set("x-flashback-admin", adminToken);
  }

  const response = await fetch(`${url}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    const error = new Error(data.error || "SUPABASE_REQUEST_FAILED") as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function listEvents(): Promise<EventRecord[]> {
  const data = await edgeRequest<{ events: EventRecord[] }>("/events", {}, true);
  return data.events;
}

export async function createEvent(input: {
  title: string;
  date: string;
  location: string;
  guestPhotoLimit: 20 | 50 | 100 | null;
}): Promise<EventRecord> {
  const data = await edgeRequest<{ event: EventRecord }>(
    "/events",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
  return data.event;
}

export async function getEvent(eventId: string): Promise<EventDetails | null> {
  try {
    const data = await edgeRequest<{ event: EventDetails }>(`/events/${eventId}`);
    return data.event;
  } catch (error) {
    if ((error as Error & { status?: number }).status === 404) return null;
    throw error;
  }
}

export async function createPhotoUpload(
  eventId: string,
  input: {
    size: number;
    contentType: "image/jpeg";
    guestId: string;
    guestToken: string;
  },
): Promise<UploadTicket> {
  return edgeRequest<UploadTicket>(`/events/${eventId}/upload-url`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createGuestSession(
  eventId: string,
  input: {
    displayName?: string;
    guestId?: string;
    guestToken?: string;
  },
): Promise<GuestSession> {
  return edgeRequest<GuestSession>(`/events/${eventId}/guests/session`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function completePhotoUpload(
  eventId: string,
  input: Pick<UploadTicket, "photoId" | "completionToken">,
) {
  return edgeRequest<{ ok: true }>(`/events/${eventId}/complete`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchDrivePhoto(eventId: string, photoId: string) {
  const { url, anonKey } = getEdgeConfig();
  return fetch(`${url}/events/${eventId}/photos/${photoId}/content`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    cache: "no-store",
  });
}
