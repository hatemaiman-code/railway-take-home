import { configFromEnv, stopContainer } from "@/lib/railway";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(() => stopContainer(configFromEnv(), id));
}
