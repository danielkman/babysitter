import Link from "next/link";
import { BookOpenText, GitBranch, Network } from "lucide-react";
import { SearchBar } from "./SearchBar";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="atlas-header">
      <div className="atlas-header__inner">
        <Link href="/" className="atlas-header__brand">
          <Network style={{ width: 22, height: 22 }} />
          <div>
            <strong>Agentic AI Atlas</strong>
            <span>by a5c.ai</span>
          </div>
        </Link>

        <nav className="atlas-header__nav">
          <Link href="/">Overview</Link>
          <Link href="/wiki">Wiki</Link>
          <Link href="/graph">Graph</Link>
          <Link href="/edges">Edges</Link>
          <Link href="/search">Search</Link>
        </nav>

        <div className="atlas-header__actions">
          <div className="atlas-header__search">
            <SearchBar />
          </div>
          <a
            href="https://github.com/a5c-ai/babysitter/tree/main/packages/atlas"
            target="_blank"
            rel="noreferrer"
            className="atlas-header__link"
          >
            <GitBranch style={{ width: 15, height: 15 }} />
            <span>GitHub</span>
          </a>
          <a
            href="https://www.a5c.ai"
            target="_blank"
            rel="noreferrer"
            className="atlas-header__link"
          >
            <BookOpenText style={{ width: 15, height: 15 }} />
            <span>Docs</span>
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
