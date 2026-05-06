import Link from "next/link";

export default function NotFound() {
  return (
    <div className="p-12 max-w-2xl mx-auto text-center">
      <h1 className="text-4xl font-semibold mb-2">404</h1>
      <p className="text-muted-foreground mb-6">
        That record, NodeKind, or EdgeKind doesn&apos;t exist in the catalog index.
      </p>
      <div className="flex justify-center gap-3 text-sm">
        <Link href="/" className="px-3 py-1.5 border rounded hover:bg-accent">
          Home
        </Link>
        <Link href="/search" className="px-3 py-1.5 border rounded hover:bg-accent">
          Search
        </Link>
        <Link href="/edges" className="px-3 py-1.5 border rounded hover:bg-accent">
          EdgeKinds
        </Link>
      </div>
    </div>
  );
}
