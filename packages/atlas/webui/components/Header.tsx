import Link from "next/link";
import { Network } from "lucide-react";
import { SearchBar } from "./SearchBar";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Network className="h-5 w-5" />
          <span>Atlas Graph Explorer</span>
        </Link>
        <div className="flex-1 flex justify-center">
          <SearchBar />
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/wiki" className="hover:text-foreground">Wiki</Link>
          <Link href="/graph" className="hover:text-foreground">Graph</Link>
          <Link href="/edges" className="hover:text-foreground">Edges</Link>
        </nav>
      </div>
    </header>
  );
}

