// Server-only wrapper around Railway's public GraphQL API.
// The token is read from the environment and never leaves the server.
import "server-only";

export const RAILWAY_API = "https://backboard.railway.com/graphql/v2";

/** Services this app creates are named with this prefix; it only ever touches those. */
export const MANAGED_PREFIX = "spin-";

/** Free plan allows 3 services per project; keep room for the app itself. */
export const MAX_CONTAINERS = 2;

export type DeploymentStatus =
  | "BUILDING"
  | "CRASHED"
  | "DEPLOYING"
  | "FAILED"
  | "INITIALIZING"
  | "NEEDS_APPROVAL"
  | "QUEUED"
  | "REMOVED"
  | "REMOVING"
  | "SKIPPED"
  | "SLEEPING"
  | "SUCCESS"
  | "WAITING";

/** What the UI shows for a container. "stopped" = deploymentStopped flag on a SUCCESS deployment. */
export type ContainerState =
  | "starting"
  | "running"
  | "stopped"
  | "removed"
  | "failed"
  | "none";

export interface Container {
  id: string;
  name: string;
  image: string | null;
  createdAt: string;
  url: string | null;
  deploymentId: string | null;
  deploymentStatus: DeploymentStatus | null;
  state: ContainerState;
}

export class RailwayError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "RailwayError";
  }
}

export interface RailwayConfig {
  token: string;
  projectId: string;
  environmentId: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): RailwayConfig {
  const token = env.RAILWAY_TOKEN;
  const projectId = env.SPIN_PROJECT_ID;
  const environmentId = env.SPIN_ENVIRONMENT_ID;
  if (!token || !projectId || !environmentId) {
    throw new RailwayError(
      "Server is not configured: set RAILWAY_TOKEN, SPIN_PROJECT_ID and SPIN_ENVIRONMENT_ID.",
      500,
    );
  }
  return { token, projectId, environmentId };
}

type Fetch = typeof fetch;

export async function gql<T>(
  cfg: Pick<RailwayConfig, "token">,
  query: string,
  variables: Record<string, unknown> = {},
  fetchImpl: Fetch = fetch,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(RAILWAY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
  } catch {
    throw new RailwayError("Could not reach Railway. Try again in a moment.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new RailwayError("Railway rejected the token.", 502);
  }
  if (res.status === 429) {
    throw new RailwayError("Railway rate limit hit. Wait a few seconds.", 429);
  }
  const body = (await res.json().catch(() => null)) as
    | { data?: T; errors?: { message: string }[] }
    | null;
  if (!body) throw new RailwayError(`Railway returned HTTP ${res.status}.`);
  if (body.errors?.length) {
    throw new RailwayError(body.errors.map((e) => e.message).join("; "));
  }
  if (!res.ok || !body.data) throw new RailwayError(`Railway returned HTTP ${res.status}.`);
  return body.data;
}

export function toState(
  status: DeploymentStatus | null,
  stopped: boolean,
): ContainerState {
  if (!status) return "none";
  switch (status) {
    case "SUCCESS":
      return stopped ? "stopped" : "running";
    case "SLEEPING":
      return "stopped";
    case "REMOVED":
    case "REMOVING":
      return "removed";
    case "CRASHED":
    case "FAILED":
      return "failed";
    default:
      return "starting";
  }
}

const LIST_QUERY = /* GraphQL */ `
  query Services($projectId: String!) {
    project(id: $projectId) {
      services {
        edges {
          node {
            id
            name
            createdAt
            serviceInstances {
              edges {
                node {
                  environmentId
                  source { image }
                  domains { serviceDomains { domain } }
                  latestDeployment { id status deploymentStopped }
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface ListData {
  project: {
    services: {
      edges: {
        node: {
          id: string;
          name: string;
          createdAt: string;
          serviceInstances: {
            edges: {
              node: {
                environmentId: string;
                source: { image: string | null } | null;
                domains: { serviceDomains: { domain: string }[] };
                latestDeployment: {
                  id: string;
                  status: DeploymentStatus;
                  deploymentStopped: boolean;
                } | null;
              };
            }[];
          };
        };
      }[];
    };
  };
}

export async function listContainers(
  cfg: RailwayConfig,
  fetchImpl?: Fetch,
): Promise<Container[]> {
  const data = await gql<ListData>(cfg, LIST_QUERY, { projectId: cfg.projectId }, fetchImpl);
  return data.project.services.edges
    .map((e) => e.node)
    .filter((s) => s.name.startsWith(MANAGED_PREFIX))
    .map((s) => {
      const inst = s.serviceInstances.edges
        .map((e) => e.node)
        .find((n) => n.environmentId === cfg.environmentId);
      const dep = inst?.latestDeployment ?? null;
      const domain = inst?.domains.serviceDomains[0]?.domain ?? null;
      return {
        id: s.id,
        name: s.name,
        image: inst?.source?.image ?? null,
        createdAt: s.createdAt,
        url: domain ? `https://${domain}` : null,
        deploymentId: dep?.id ?? null,
        deploymentStatus: dep?.status ?? null,
        state: toState(dep?.status ?? null, dep?.deploymentStopped ?? false),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Allowed images: small public images only, so a stranger can't run arbitrary code on the account. */
export const IMAGE_PRESETS: { image: string; port: number; label: string }[] = [
  { image: "traefik/whoami", port: 80, label: "whoami (tiny echo server)" },
  { image: "nginx:alpine", port: 80, label: "nginx (alpine)" },
  { image: "hashicorp/http-echo", port: 5678, label: "http-echo" },
];

export function sanitizeName(raw: string | undefined): string {
  const base = (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${MANAGED_PREFIX}${base || "box"}-${suffix}`;
}

export async function spinUp(
  cfg: RailwayConfig,
  input: { image: string; name?: string },
  fetchImpl?: Fetch,
): Promise<{ id: string; name: string; url: string | null }> {
  const preset = IMAGE_PRESETS.find((p) => p.image === input.image);
  if (!preset) throw new RailwayError("That image is not allowed.", 400);

  const current = await listContainers(cfg, fetchImpl);
  const live = current.filter((c) => c.state !== "removed");
  if (live.length >= MAX_CONTAINERS) {
    throw new RailwayError(
      `Limit reached: at most ${MAX_CONTAINERS} containers. Delete one first.`,
      409,
    );
  }

  const name = sanitizeName(input.name);
  // serviceCreate with an image source also triggers the first deployment.
  const created = await gql<{ serviceCreate: { id: string; name: string } }>(
    cfg,
    /* GraphQL */ `
      mutation Create($input: ServiceCreateInput!) {
        serviceCreate(input: $input) { id name }
      }
    `,
    {
      input: {
        projectId: cfg.projectId,
        environmentId: cfg.environmentId,
        name,
        source: { image: preset.image },
      },
    },
    fetchImpl,
  );

  let url: string | null = null;
  try {
    const d = await gql<{ serviceDomainCreate: { domain: string } }>(
      cfg,
      /* GraphQL */ `
        mutation Domain($input: ServiceDomainCreateInput!) {
          serviceDomainCreate(input: $input) { domain }
        }
      `,
      {
        input: {
          serviceId: created.serviceCreate.id,
          environmentId: cfg.environmentId,
          targetPort: preset.port,
        },
      },
      fetchImpl,
    );
    url = `https://${d.serviceDomainCreate.domain}`;
  } catch {
    // The container still runs without a public URL; the UI shows that.
  }
  return { id: created.serviceCreate.id, name: created.serviceCreate.name, url };
}

async function getManaged(cfg: RailwayConfig, serviceId: string, fetchImpl?: Fetch) {
  const list = await listContainers(cfg, fetchImpl);
  const c = list.find((x) => x.id === serviceId);
  if (!c) throw new RailwayError("Not a container managed by this app.", 404);
  return c;
}

/** Stop: stop the running deployment but keep the service (can be started again). */
export async function stopContainer(cfg: RailwayConfig, serviceId: string, fetchImpl?: Fetch) {
  const c = await getManaged(cfg, serviceId, fetchImpl);
  if (!c.deploymentId || c.state !== "running") {
    throw new RailwayError("Container is not running.", 409);
  }
  await gql(cfg, `mutation Stop($id: String!) { deploymentStop(id: $id) }`, { id: c.deploymentId }, fetchImpl);
}

/** Start again: redeploy the service's image. */
export async function startContainer(cfg: RailwayConfig, serviceId: string, fetchImpl?: Fetch) {
  const c = await getManaged(cfg, serviceId, fetchImpl);
  if (c.state === "running" || c.state === "starting") {
    throw new RailwayError("Container is already up.", 409);
  }
  await gql(
    cfg,
    `mutation Redeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId, environmentId: cfg.environmentId },
    fetchImpl,
  );
}

/** Delete: remove the service and all its deployments. */
export async function deleteContainer(cfg: RailwayConfig, serviceId: string, fetchImpl?: Fetch) {
  await getManaged(cfg, serviceId, fetchImpl);
  await gql(
    cfg,
    `mutation Delete($id: String!, $environmentId: String!) {
      serviceDelete(id: $id, environmentId: $environmentId)
    }`,
    { id: serviceId, environmentId: cfg.environmentId },
    fetchImpl,
  );
}
