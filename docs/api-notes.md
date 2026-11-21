# Railway GraphQL API notes

Checked 2026-11-21 by schema introspection and by calling each operation by hand against a sandbox project.

Endpoint: `https://backboard.railway.com/graphql/v2`, header `Authorization: Bearer <token>`.

## Operations used

| Need | Operation | Notes |
|---|---|---|
| List services and their state | `project(id) { services { edges { node { id name createdAt serviceInstances { edges { node { environmentId source { image } domains { serviceDomains { domain } } latestDeployment { id status deploymentStopped } } } } } } } }` | One query gives everything the UI needs. |
| Create project (setup only) | `projectCreate(input: ProjectCreateInput!)` | `{ name, workspaceId }`. Returns the default `production` environment. |
| Spin up | `serviceCreate(input: ServiceCreateInput!)` | `{ projectId, environmentId, name, source: { image } }`. Creating a service with an image source **triggers the first deployment by itself**; no separate deploy call needed. |
| Public URL | `serviceDomainCreate(input: { serviceId, environmentId, targetPort })` | Returns `*.up.railway.app`. `traefik/whoami` and `nginx` listen on 80, `hashicorp/http-echo` on 5678. |
| Stop (keep service) | `deploymentStop(id)` | Container stops (URL answers 502). **Status stays `SUCCESS`**; the `deploymentStopped` flag becomes `true`. The UI uses that flag. |
| Start again | `serviceInstanceRedeploy(serviceId, environmentId)` | Creates a new deployment from the same image. Works after stop or remove. |
| Remove a deployment | `deploymentRemove(id)` | Status becomes `REMOVED`, URL answers 404. Not used in the UI (Stop + Delete cover it). |
| Delete | `serviceDelete(id, environmentId)` | Removes the service and all its deployments. |
| Deployment history | `deployments(first, input: { projectId, environmentId, serviceId })` | Used while exploring. |

## Deployment status values

`BUILDING, CRASHED, DEPLOYING, FAILED, INITIALIZING, NEEDS_APPROVAL, QUEUED, REMOVED, REMOVING, SKIPPED, SLEEPING, SUCCESS, WAITING`

Mapping in the app (`toState`): `SUCCESS` → running (or stopped if `deploymentStopped`), `SLEEPING` → stopped, `REMOVED`/`REMOVING` → removed, `CRASHED`/`FAILED` → failed, everything else → starting.

## Timings seen

- Image service from create to `SUCCESS`: about 5 seconds for `traefik/whoami`.
- Public URL answering 200: about 15-20 seconds after create.
