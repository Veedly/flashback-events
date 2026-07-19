import { createEvent, listEvents } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ events: await listEvents() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    date?: string;
    location?: string;
  };

  if (!body.title?.trim() || !body.date) {
    return Response.json(
      { error: "Укажите название и дату события." },
      { status: 400 },
    );
  }

  const event = await createEvent({
    title: body.title,
    date: body.date,
    location: body.location ?? "",
  });
  return Response.json({ event }, { status: 201 });
}
