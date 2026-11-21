import { configFromEnv, deleteContainer } from "@/lib/railway";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(() => deleteContainer(configFromEnv(), id));
}
