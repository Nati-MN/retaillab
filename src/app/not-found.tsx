import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="text-center">
        <div className="label">404</div>
        <h1 className="mt-1 text-lg">Not found</h1>
        <p className="mt-1 text-ink-2">This page does not exist, or it belongs to another organization.</p>
        <Link href="/overview" className="btn-primary mt-4">Back to overview</Link>
      </div>
    </div>
  );
}
