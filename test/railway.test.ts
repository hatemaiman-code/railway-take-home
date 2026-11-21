import { describe, expect, it, vi } from "vitest";
import {
  deleteContainer,
  gql,
  listContainers,
  RailwayError,
  sanitizeName,
  spinUp,
  stopContainer,
  toState,
} from "@/lib/railway";

const cfg = { token: "t0ken", projectId: "proj", environmentId: "env" };

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

type Dep = null | { id: string; status: string; deploymentStopped: boolean };

function service(id: string, name: string, dep: Dep, domain?: string) {
  return {
    node: {
      id,
      name,
      createdAt: `2026-11-21T11:0${id.length}:00Z`,
      serviceInstances: {
        edges: [
          {
            node: {
              environmentId: "env",
              source: { image: "traefik/whoami" },
              domains: { serviceDomains: domain ? [{ domain }] : [] },
              latestDeployment: dep,
            },
          },
        ],
      },
    },
  };
}

function listReply(...edges: ReturnType<typeof service>[]) {
  return reply({ data: { project: { services: { edges } } } });
}

describe("gql", () => {
  it("sends the bearer token and returns data", async () => {
    const f = vi.fn().mockResolvedValue(reply({ data: { me: { email: "x" } } }));
    const out = await gql<{ me: { email: string } }>(cfg, "{ me { email } }", {}, f);
    expect(out.me.email).toBe("x");
    const [, init] = f.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer t0ken");
  });

  it("turns GraphQL errors into RailwayError", async () => {
    const f = vi.fn().mockResolvedValue(reply({ errors: [{ message: "Not Authorized" }] }));
    await expect(gql(cfg, "{x}", {}, f)).rejects.toThrow("Not Authorized");
  });

  it("maps 401 to a token error", async () => {
    const f = vi.fn().mockResolvedValue(reply({}, 401));
    await expect(gql(cfg, "{x}", {}, f)).rejects.toThrow(/token/);
  });

  it("maps network failure", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(gql(cfg, "{x}", {}, f)).rejects.toBeInstanceOf(RailwayError);
  });
});

describe("toState", () => {
  it("maps Railway statuses to UI states", () => {
    expect(toState("SUCCESS", false)).toBe("running");
    expect(toState("SUCCESS", true)).toBe("stopped");
    expect(toState("DEPLOYING", false)).toBe("starting");
    expect(toState("REMOVED", true)).toBe("removed");
    expect(toState("CRASHED", false)).toBe("failed");
    expect(toState(null, false)).toBe("none");
  });
});

describe("listContainers", () => {
  it("only returns services with the spin- prefix and builds URLs", async () => {
    const f = vi.fn().mockResolvedValue(
      listReply(
        service("a", "spin-demo-1", { id: "d1", status: "SUCCESS", deploymentStopped: false }, "x.up.railway.app"),
        service("bb", "the-app-itself", { id: "d2", status: "SUCCESS", deploymentStopped: false }),
      ),
    );
    const out = await listContainers(cfg, f);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "spin-demo-1", state: "running", url: "https://x.up.railway.app" });
  });
});

describe("spinUp", () => {
  it("rejects images outside the allowlist", async () => {
    const f = vi.fn();
    await expect(spinUp(cfg, { image: "evil/miner" }, f)).rejects.toMatchObject({ status: 400 });
    expect(f).not.toHaveBeenCalled();
  });

  it("enforces the container limit", async () => {
    const f = vi.fn().mockResolvedValue(
      listReply(
        service("a", "spin-a", { id: "d1", status: "SUCCESS", deploymentStopped: false }),
        service("bb", "spin-b", { id: "d2", status: "DEPLOYING", deploymentStopped: false }),
      ),
    );
    await expect(spinUp(cfg, { image: "traefik/whoami" }, f)).rejects.toMatchObject({ status: 409 });
  });

  it("creates the service from the image and adds a domain", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(listReply())
      .mockResolvedValueOnce(reply({ data: { serviceCreate: { id: "s1", name: "spin-demo-ab12" } } }))
      .mockResolvedValueOnce(reply({ data: { serviceDomainCreate: { domain: "d.up.railway.app" } } }));
    const out = await spinUp(cfg, { image: "traefik/whoami", name: "Demo!" }, f);
    expect(out).toEqual({ id: "s1", name: "spin-demo-ab12", url: "https://d.up.railway.app" });
    const createBody = JSON.parse(f.mock.calls[1][1].body);
    expect(createBody.variables.input).toMatchObject({
      projectId: "proj",
      environmentId: "env",
      source: { image: "traefik/whoami" },
    });
    expect(createBody.variables.input.name).toMatch(/^spin-demo-/);
  });
});

describe("stop and delete", () => {
  it("stops the latest deployment of a running managed container", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(listReply(service("a", "spin-a", { id: "dep9", status: "SUCCESS", deploymentStopped: false })))
      .mockResolvedValueOnce(reply({ data: { deploymentStop: true } }));
    await stopContainer(cfg, "a", f);
    expect(JSON.parse(f.mock.calls[1][1].body).variables).toEqual({ id: "dep9" });
  });

  it("refuses to delete a service it does not manage", async () => {
    const f = vi.fn().mockResolvedValue(listReply(service("bb", "the-app-itself", null)));
    await expect(deleteContainer(cfg, "bb", f)).rejects.toMatchObject({ status: 404 });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("sanitizeName", () => {
  it("prefixes and cleans names", () => {
    expect(sanitizeName("My App!!")).toMatch(/^spin-my-app-[a-z0-9]{1,4}$/);
    expect(sanitizeName(undefined)).toMatch(/^spin-box-/);
  });
});
