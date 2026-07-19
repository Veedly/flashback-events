import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "event-photos";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-flashback-admin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const secret = keys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) throw new Error("Supabase admin environment is missing");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireAdmin(
  request: Request,
  admin: ReturnType<typeof getAdminClient>,
) {
  const supplied = request.headers.get("x-flashback-admin");
  if (!supplied) throw new ApiError(401, "Admin access required");
  const { data, error } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "admin_token_sha256")
    .maybeSingle();
  if (error || !data || (await sha256(supplied)) !== data.value) {
    throw new ApiError(401, "Admin access required");
  }
}

function routeParts(request: Request) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const functionIndex = parts.lastIndexOf("flashback-api");
  return functionIndex >= 0 ? parts.slice(functionIndex + 1) : parts;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function getDriveOAuthConfig() {
  const clientId = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

async function getSetting(
  admin: ReturnType<typeof getAdminClient>,
  key: string,
) {
  const { data, error } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

async function getGoogleAccessToken() {
  const config = getDriveOAuthConfig();
  if (!config) return null;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json();
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(`Google token refresh failed (${response.status})`);
  }
  return data.access_token as string;
}

function safeDriveName(value: string) {
  return value.replace(/[^\p{L}\p{N}._ -]/gu, "").trim().slice(0, 80) || "event";
}

async function uploadBlobToDrive(
  accessToken: string,
  rootFolderId: string,
  fileName: string,
  image: Blob,
) {
  const boundary = `flashback-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: fileName, parents: [rootFolderId] });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
    image,
    `\r\n--${boundary}--`,
  ]);
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const data = await response.json();
  if (!response.ok || typeof data.id !== "string") {
    throw new Error(`Google Drive upload failed (${response.status})`);
  }
  return data as { id: string; webViewLink?: string };
}

async function syncDrivePhoto(
  photoId: number,
  admin: ReturnType<typeof getAdminClient>,
) {
  const config = getDriveOAuthConfig();
  const rootFolderId = await getSetting(admin, "drive_root_folder_id");
  if (!config || !rootFolderId) return { configured: false, synced: false };

  const { data: job, error: jobError } = await admin
    .from("drive_sync_jobs")
    .select("id, status, attempts")
    .eq("photo_id", photoId)
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job) return { configured: true, synced: false };

  const { data: claimed, error: claimError } = await admin
    .from("drive_sync_jobs")
    .update({ status: "processing", locked_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", job.status)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { configured: true, synced: false };

  try {
    const { data: photo, error: photoError } = await admin
      .from("photos")
      .select("id, event_id, storage_path, drive_file_id")
      .eq("id", photoId)
      .eq("status", "ready")
      .single();
    if (photoError) throw photoError;
    if (photo.drive_file_id) {
      await admin.from("drive_sync_jobs").update({
        status: "synced",
        locked_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      return { configured: true, synced: true };
    }

    const { data: event, error: eventError } = await admin
      .from("events")
      .select("public_id, title, event_date")
      .eq("id", photo.event_id)
      .single();
    if (eventError) throw eventError;
    const { data: image, error: downloadError } = await admin.storage
      .from(BUCKET)
      .download(photo.storage_path);
    if (downloadError) throw downloadError;

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return { configured: false, synced: false };
    const fileName = `${event.event_date}_${safeDriveName(event.title)}_${event.public_id}_${photo.id}.jpg`;
    const driveFile = await uploadBlobToDrive(accessToken, rootFolderId, fileName, image);

    const { error: photoUpdateError } = await admin.from("photos").update({
      drive_file_id: driveFile.id,
      drive_sync_status: "synced",
    }).eq("id", photo.id);
    if (photoUpdateError) throw photoUpdateError;
    const { error: jobUpdateError } = await admin.from("drive_sync_jobs").update({
      status: "synced",
      locked_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    if (jobUpdateError) throw jobUpdateError;
    return { configured: true, synced: true };
  } catch (error) {
    const attempts = job.attempts + 1;
    const failed = attempts >= 8;
    await admin.from("drive_sync_jobs").update({
      status: failed ? "failed" : "pending",
      attempts,
      locked_at: null,
      last_error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
      next_attempt_at: new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    await admin.from("photos").update({ drive_sync_status: failed ? "failed" : "pending" })
      .eq("id", photoId);
    throw error;
  }
}

async function syncDriveQueue(admin: ReturnType<typeof getAdminClient>, limit = 5) {
  const { data, error } = await admin
    .from("drive_sync_jobs")
    .select("photo_id")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 10)));
  if (error) throw error;
  let synced = 0;
  for (const job of data ?? []) {
    const result = await syncDrivePhoto(job.photo_id, admin);
    if (result.synced) synced += 1;
    if (!result.configured) return { configured: false, processed: synced };
  }
  return { configured: Boolean(getDriveOAuthConfig()), processed: synced };
}

let bucketPromise: Promise<void> | null = null;

async function ensureBucket(admin: ReturnType<typeof getAdminClient>) {
  if (!bucketPromise) {
    bucketPromise = (async () => {
      const { data } = await admin.storage.getBucket(BUCKET);
      if (data) return;
      const { error } = await admin.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 12 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg"],
      });
      if (error && !error.message.toLowerCase().includes("already exists")) throw error;
    })().catch((error) => {
      bucketPromise = null;
      throw error;
    });
  }
  await bucketPromise;
}

async function listEvents(admin: ReturnType<typeof getAdminClient>) {
  const { data, error } = await admin
    .from("events")
    .select("id, public_id, title, event_date, location, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const events = await Promise.all(
    (data ?? []).map(async (event) => {
      const { count } = await admin
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("status", "ready");
      return {
        id: event.public_id,
        title: event.title,
        date: event.event_date,
        location: event.location,
        createdAt: event.created_at,
        photoCount: count ?? 0,
      };
    }),
  );
  return json({ events });
}

async function createEvent(request: Request, admin: ReturnType<typeof getAdminClient>) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const date = typeof body.date === "string" ? body.date : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  if (!title || title.length > 80 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || location.length > 100) {
    throw new ApiError(400, "Invalid event data");
  }

  const { data, error } = await admin
    .from("events")
    .insert({ title, event_date: date, location })
    .select("public_id, title, event_date, location, created_at")
    .single();
  if (error) throw error;
  return json({
    event: {
      id: data.public_id,
      title: data.title,
      date: data.event_date,
      location: data.location,
      createdAt: data.created_at,
      photoCount: 0,
    },
  }, 201);
}

async function findEvent(publicId: string, admin: ReturnType<typeof getAdminClient>) {
  if (!/^[a-f0-9]{24}$/.test(publicId)) throw new ApiError(404, "Event not found");
  const { data, error } = await admin
    .from("events")
    .select("id, public_id, title, event_date, location, created_at, is_open")
    .eq("public_id", publicId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "Event not found");
  return data;
}

async function getEvent(publicId: string, admin: ReturnType<typeof getAdminClient>) {
  const event = await findEvent(publicId, admin);
  const { data: photos, error } = await admin
    .from("photos")
    .select("id, storage_path, created_at")
    .eq("event_id", event.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const paths = (photos ?? []).map((photo) => photo.storage_path);
  const signedByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUrls(paths, 60 * 60);
    if (signedError) throw signedError;
    (signed ?? []).forEach((item) => {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
    });
  }

  const readyPhotos = (photos ?? []).map((photo) => ({
    id: String(photo.id),
    url: signedByPath.get(photo.storage_path) ?? "",
    createdAt: photo.created_at,
  })).filter((photo) => photo.url);

  return json({
    event: {
      id: event.public_id,
      title: event.title,
      date: event.event_date,
      location: event.location,
      createdAt: event.created_at,
      photoCount: readyPhotos.length,
      photos: readyPhotos,
    },
  });
}

async function createUploadUrl(
  request: Request,
  publicId: string,
  admin: ReturnType<typeof getAdminClient>,
) {
  const event = await findEvent(publicId, admin);
  if (!event.is_open) throw new ApiError(403, "Event is closed");
  const body = await request.json();
  const size = Number(body.size);
  if (body.contentType !== "image/jpeg" || !Number.isSafeInteger(size) || size < 1 || size > 12 * 1024 * 1024) {
    throw new ApiError(400, "Invalid photo");
  }

  const storagePath = `${publicId}/${crypto.randomUUID()}.jpg`;
  const completionToken = randomToken();
  const completionTokenHash = await sha256(completionToken);
  const { data: photo, error: photoError } = await admin
    .from("photos")
    .insert({
      event_id: event.id,
      storage_path: storagePath,
      size_bytes: size,
      completion_token_hash: completionTokenHash,
    })
    .select("id")
    .single();
  if (photoError) throw photoError;

  const { data: signed, error: signedError } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);
  if (signedError) throw signedError;
  return json({
    photoId: String(photo.id),
    path: storagePath,
    uploadToken: signed.token,
    completionToken,
  }, 201);
}

async function completeUpload(
  request: Request,
  publicId: string,
  admin: ReturnType<typeof getAdminClient>,
) {
  const event = await findEvent(publicId, admin);
  const body = await request.json();
  const photoId = Number(body.photoId);
  const completionToken = typeof body.completionToken === "string" ? body.completionToken : "";
  if (!Number.isSafeInteger(photoId) || !completionToken) throw new ApiError(400, "Invalid completion data");
  const completionTokenHash = await sha256(completionToken);

  const { data: photo, error } = await admin
    .from("photos")
    .update({ status: "ready", uploaded_at: new Date().toISOString() })
    .eq("id", photoId)
    .eq("event_id", event.id)
    .eq("status", "uploading")
    .eq("completion_token_hash", completionTokenHash)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!photo) {
    const { data: existing } = await admin
      .from("photos")
      .select("id")
      .eq("id", photoId)
      .eq("event_id", event.id)
      .eq("status", "ready")
      .eq("completion_token_hash", completionTokenHash)
      .maybeSingle();
    if (!existing) throw new ApiError(409, "Upload cannot be completed");
  }

  await admin.from("drive_sync_jobs").upsert(
    { photo_id: photoId, status: "pending", next_attempt_at: new Date().toISOString() },
    { onConflict: "photo_id", ignoreDuplicates: true },
  );
  EdgeRuntime.waitUntil(
    syncDrivePhoto(photoId, admin).catch((error) => console.error("Drive sync failed", error)),
  );
  return json({ ok: true });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = getAdminClient();
    await ensureBucket(admin);
    const parts = routeParts(request);

    if (request.method === "GET" && parts[0] === "health") return json({ ok: true });
    if (request.method === "POST" && parts[0] === "drive-sync") {
      await requireAdmin(request, admin);
      const body = await request.json().catch(() => ({}));
      return json(await syncDriveQueue(admin, Number(body.limit) || 5));
    }
    if (parts[0] !== "events") throw new ApiError(404, "Not found");

    if (parts.length === 1) {
      await requireAdmin(request, admin);
      if (request.method === "GET") return await listEvents(admin);
      if (request.method === "POST") return await createEvent(request, admin);
    }

    const publicId = parts[1];
    if (request.method === "GET" && parts.length === 2) return await getEvent(publicId, admin);
    if (request.method === "POST" && parts[2] === "upload-url") {
      return await createUploadUrl(request, publicId, admin);
    }
    if (request.method === "POST" && parts[2] === "complete") {
      return await completeUpload(request, publicId, admin);
    }
    throw new ApiError(404, "Not found");
  } catch (error) {
    console.error(error);
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    return json({ error: "Internal error" }, 500);
  }
});
