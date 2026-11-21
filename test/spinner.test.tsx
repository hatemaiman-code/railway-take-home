import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Spinner from "@/components/Spinner";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Spinner UI", () => {
  it("lists containers with their state and actions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          containers: [
            {
              id: "a",
              name: "spin-demo-1",
              image: "traefik/whoami",
              createdAt: "2026-11-21T11:00:00Z",
              url: "https://x.up.railway.app",
              deploymentStatus: "SUCCESS",
              state: "running",
            },
          ],
          presets: [{ image: "traefik/whoami", label: "whoami" }],
          max: 2,
        }),
        { status: 200 },
      ),
    );
    render(<Spinner />);
    expect(await screen.findByText("spin-demo-1")).toBeTruthy();
    expect(screen.getByText("running")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("shows server errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Railway rejected the token." }), { status: 502 }),
    );
    render(<Spinner />);
    expect((await screen.findByRole("alert")).textContent).toContain("rejected the token");
  });
});
