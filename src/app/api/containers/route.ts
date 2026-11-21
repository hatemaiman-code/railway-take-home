import { configFromEnv, listContainers, spinUp, IMAGE_PRESETS, MAX_CONTAINERS, RailwayError } from "@/lib/railway";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({
    containers: await listContainers(configFromEnv()),
    presets: IMAGE_PRESETS.map(({ image, label }) => ({ image, label })),
    max: MAX_CONTAINERS,
  }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => null)) as { image?: unknown; name?: unknown } | null;
    if (!body || typeof body.image !== "string") {
      throw new RailwayError("Pick an image.", 400);
    }
    const name = typeof body.name === "string" ? body.name : undefined;
    return spinUp(configFromEnv(), { image: body.image, name });
  }, 201);
}
