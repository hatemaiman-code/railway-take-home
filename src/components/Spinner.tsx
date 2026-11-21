"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ContainerState = "starting" | "running" | "stopped" | "removed" | "failed" | "none";

export interface ContainerView {
  id: string;
  name: string;
  image: string | null;
  createdAt: string;
  url: string | null;
  deploymentStatus: string | null;
  state: ContainerState;
}

interface Preset {
  image: string;
  label: string;
}

interface ListResponse {
  containers: ContainerView[];
  presets: Preset[];
  max: number;
}

const STATE_STYLE: Record<ContainerState, string> = {
  starting: "bg-amber-100 text-amber-800",
  running: "bg-emerald-100 text-emerald-800",
  stopped: "bg-slate-200 text-slate-700",
  removed: "bg-slate-100 text-slate-500",
  failed: "bg-rose-100 text-rose-800",
  none: "bg-slate-100 text-slate-500",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

export default function Spinner() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<ListResponse>("/api/containers");
      setData(d);
      setImage((cur) => cur || d.presets[0]?.image || "");
      setError(null);
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, []);

  // Poll faster while something is changing, slower when everything is settled.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const d = await load();
      if (!alive) return;
      const changing = d?.containers.some((c) => c.state === "starting");
      timer.current = setTimeout(tick, changing ? 3000 : 10000);
    };
    tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const live = data?.containers.filter((c) => c.state !== "removed") ?? [];
  const atLimit = data ? live.length >= data.max : false;

  return (
    <div className="space-y-8">
      <form
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          act("create", () =>
            api("/api/containers", { method: "POST", body: JSON.stringify({ image, name }) }).then(() =>
              setName(""),
            ),
          );
        }}
      >
        <h2 className="text-lg font-semibold">Spin up a container</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Image</span>
            <select
              aria-label="Image"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={image}
              onChange={(e) => setImage(e.target.value)}
            >
              {data?.presets.map((p) => (
                <option key={p.image} value={p.image}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Name (optional)</span>
            <input
              aria-label="Name"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="demo"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={!image || atLimit || busy !== null}
            className="self-end rounded-md bg-violet-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy === "create" ? "Spinning up…" : "Spin up"}
          </button>
        </div>
        {atLimit && (
          <p className="mt-3 text-sm text-slate-600">
            Limit of {data?.max} containers reached. Delete one to spin up another.
          </p>
        )}
      </form>

      {error && (
        <p role="alert" className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Containers</h2>
        {!data && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {data && live.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No containers yet. Spin one up above.
          </p>
        )}
        <ul className="space-y-3">
          {live.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{c.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[c.state]}`}>
                    {c.state}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {c.image} · created {new Date(c.createdAt).toLocaleTimeString()}
                  {c.deploymentStatus ? ` · Railway: ${c.deploymentStatus}` : ""}
                </div>
                {c.url && c.state === "running" && (
                  <a className="mt-1 block text-xs text-violet-700 underline" href={c.url} target="_blank" rel="noreferrer">
                    {c.url}
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                {c.state === "running" && (
                  <button
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => act(`stop-${c.id}`, () => api(`/api/containers/${c.id}/stop`, { method: "POST" }))}
                  >
                    {busy === `stop-${c.id}` ? "Stopping…" : "Stop"}
                  </button>
                )}
                {(c.state === "stopped" || c.state === "failed" || c.state === "none") && (
                  <button
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => act(`start-${c.id}`, () => api(`/api/containers/${c.id}/start`, { method: "POST" }))}
                  >
                    {busy === `start-${c.id}` ? "Starting…" : "Start"}
                  </button>
                )}
                <button
                  className="rounded-md border border-rose-300 px-3 py-1.5 text-sm text-rose-700 disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(`Delete ${c.name}? This removes the service and its deployments.`)) return;
                    act(`del-${c.id}`, () => api(`/api/containers/${c.id}`, { method: "DELETE" }));
                  }}
                >
                  {busy === `del-${c.id}` ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
