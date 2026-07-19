import { fetchDrivePhoto } from "@/lib/server-store";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/events/[eventId]/photos/[photoId]">,
) {
  const { eventId, photoId } = await context.params;

  try {
    const response = await fetchDrivePhoto(eventId, photoId);
    if (!response.ok || !response.body) {
      return new Response(null, {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": response.headers.get("Cache-Control") ?? "public, max-age=3600",
      },
    });
  } catch {
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
