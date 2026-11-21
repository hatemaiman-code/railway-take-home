import Spinner from "@/components/Spinner";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Railway container spinner</h1>
        <p className="mt-2 text-sm text-slate-600">
          Spin containers up and down through Railway&apos;s GraphQL API. <strong>Stop</strong> keeps the
          service and stops its deployment; <strong>Delete</strong> removes the service and all its
          deployments.
        </p>
      </header>
      <Spinner />
    </main>
  );
}
