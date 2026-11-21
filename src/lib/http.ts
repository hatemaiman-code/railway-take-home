import "server-only";
import { NextResponse } from "next/server";
import { RailwayError } from "./railway";

/** Turns any thrown error into a JSON error response with a safe message. */
export async function handle<T>(fn: () => Promise<T>, okStatus = 200) {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true }, { status: okStatus });
  } catch (err) {
    if (err instanceof RailwayError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
