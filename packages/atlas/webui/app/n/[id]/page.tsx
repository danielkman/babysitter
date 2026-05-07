import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getRecord,
  getOutgoing,
  getIncoming,
  getDisplayName,
  getPagesForRecord,
} from "@a5c-ai/atlas";
import { Badge } from "@/components/ui/badge";
import {
  AtlasDocsScaffold,
  atlasLeadFromMarkdown,
  atlasReadingTime,
} from "@/components/AtlasDocsScaffold";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AttributeTable } from "@/components/AttributeTable";
import { EdgeList } from "@/components/EdgeList";
import { MiniGraph } from "@/components/MiniGraph";
import { MarkdownArticle } from "@/components/MarkdownArticle";

export const dynamicParams = true;

type SearchParams = { tab?: string };

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const { tab } = await searchParams;
  const id = decodeURIComponent(rawId);
  const rec = getRecord(id);
  if (!rec) notFound();

  const out = getOutgoing(id);
  const inc = getIncoming(id);
  const relatedPages = getPagesForRecord(id)
    .slice()
    .sort((a, b) => String(a.slug ?? a.id).localeCompare(String(b.slug ?? b.id)));
  const selfArticlePage = rec._kind === "Page" && typeof rec.article === "string" ? rec : null;
  const relatedArticlePage = relatedPages.find((page) => typeof page.article === "string") ?? null;
  const articlePage = selfArticlePage ?? relatedArticlePage;
  const hasArticle = Boolean(articlePage);
  const tabActive = tab === "json"
    ? "json"
    : tab === "graph"
      ? "graph"
      : tab === "overview"
        ? "overview"
        : tab === "article" && hasArticle
          ? "article"
          : hasArticle
            ? "article"
            : "overview";

  const basePath = `/n/${encodeURIComponent(id)}`;
  const baseTabHref = (t: string) => {
    if (hasArticle) {
      return t === "article" ? basePath : `${basePath}?tab=${t}`;
    }
    return t === "overview" ? basePath : `${basePath}?tab=${t}`;
  };

  return (
    <div className="max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: rec._kind, href: `/kind/${encodeURIComponent(rec._kind)}` },
          { label: id },
        ]}
      />

      <div className="mt-2 mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs" style={{ color: 'var(--fg-3)' }}>{getDisplayName(rec)}</div>
          <h1 className="text-xl font-mono break-all" style={{ color: 'var(--fg)' }}>{id}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--fg-2)' }}>
            <Link href={`/kind/${encodeURIComponent(rec._kind)}`}>
              <Badge variant="secondary">{rec._kind}</Badge>
            </Link>
            <span className="font-mono">{rec._file}</span>
            <span>·</span>
            <Link href={`/graph?seed=${encodeURIComponent(id)}`} className="hover:underline" style={{ color: 'var(--brass)' }}>
              Open in Graph →
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-4 text-sm" style={{ borderBottom: '1px solid var(--rule)' }}>
        {(["overview", ...(hasArticle ? ["article"] : []), "json", "graph"] as const).map((t) => (
          <Link
            key={t}
            href={baseTabHref(t)}
            className={`px-1 pb-2 -mb-px border-b-2 transition-colors capitalize ${
              tabActive === t ? "cpd-tab-active" : "cpd-tab-inactive"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      {tabActive === "overview" && (
        <div className="grid grid-cols-12 gap-6">
          <section className="col-span-12 md:col-span-7">
            <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--fg-2)' }}>Attributes</h2>
            <AttributeTable attributes={rec as Record<string, unknown>} />
          </section>
          <section className="col-span-12 md:col-span-5 space-y-4">
            {relatedPages.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--fg-2)' }}>Wiki pages</h2>
                <ul className="space-y-1">
                  {relatedPages.map((page) => (
                    <li key={page.id} className="text-xs">
                      <Link href={`/wiki/${String(page.slug ?? "").split("/").map(encodeURIComponent).join("/")}`} className="hover:underline" style={{ color: 'var(--brass)' }}>
                        {String(page.title ?? page.id)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--fg-2)' }}>
                Outgoing edges <span className="text-xs" style={{ color: 'var(--fg-3)' }}>({out.length})</span>
              </h2>
              <EdgeList edges={out} direction="outgoing" />
            </div>
            <div>
              <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--fg-2)' }}>
                Incoming edges <span className="text-xs" style={{ color: 'var(--fg-3)' }}>({inc.length})</span>
              </h2>
              <EdgeList edges={inc} direction="incoming" />
            </div>
          </section>
        </div>
      )}

      {tabActive === "article" && articlePage && (
        <AtlasDocsScaffold
          runningLeft={
            <>
              <span className="folio">ii</span>
              <span>Record</span>
            </>
          }
          runningTitle={
            <>
              Agentic AI Atlas · <em>{getDisplayName(rec)}</em>
            </>
          }
          runningRight={
            <>
              <span>{id}</span>
              <span>a5c.ai</span>
            </>
          }
          tocSearchLabel="Search related records"
          tocBookLabel="Record · linked articles"
          tocTitle="Current article and related pages"
          chapters={[
            {
              num: "II.",
              title: "Reference article",
              pages: "pp. 1 - 1",
              current: true,
              items: [
                { label: String(articlePage.title ?? articlePage.id), current: true },
                ...relatedPages
                  .filter((page) => page.id !== articlePage.id)
                  .slice(0, 5)
                  .map((page) => ({
                    label: String(page.title ?? page.id),
                    href: `/wiki/${String(page.slug ?? "").split("/").map(encodeURIComponent).join("/")}`,
                  })),
              ],
            },
          ]}
          chapterMark={{
            num: "II.",
            subtitle: `${rec._kind} reference`,
            context: id,
            readingTime: atlasReadingTime(String(articlePage.article)),
          }}
          articleTitle={
            <>
              {getDisplayName(rec)} <em>reference</em>
            </>
          }
          lead={atlasLeadFromMarkdown(String(articlePage.article), `Reference article for ${id} and its linked atlas edges.`)}
          meta={
            <>
              <Badge variant="secondary">{rec._kind}</Badge>
              <span>{typeof articlePage.articlePath === "string" ? articlePage.articlePath : articlePage._file}</span>
              <span>Outgoing · {out.length}</span>
              <span>Incoming · {inc.length}</span>
            </>
          }
          marginSections={[
            {
              title: "Article source",
              items: articlePage.id !== rec.id
                ? [
                    <Link
                      key="article-source"
                      href={`/wiki/${String(articlePage.slug ?? "").split("/").map(encodeURIComponent).join("/")}`}
                    >
                      {String(articlePage.title ?? articlePage.id)}
                    </Link>,
                    <p key="article-note" className="atlas-docs-note">This record inherits its article from a related Page node.</p>,
                  ]
                : [<p key="self-article" className="atlas-docs-note">The article body is owned directly by this record.</p>],
            },
            {
              title: "Related pages",
              items: relatedPages.length
                ? relatedPages.slice(0, 8).map((page) => (
                    <Link
                      key={page.id}
                      href={`/wiki/${String(page.slug ?? "").split("/").map(encodeURIComponent).join("/")}`}
                    >
                      {String(page.title ?? page.id)}
                    </Link>
                  ))
                : [<p key="no-pages" className="atlas-docs-note">No related wiki pages for this record.</p>],
            },
          ]}
        >
          <MarkdownArticle
            markdown={String(articlePage.article)}
            articlePath={typeof articlePage.articlePath === "string" ? articlePage.articlePath : articlePage._file}
            variant="docs"
          />
        </AtlasDocsScaffold>
      )}

      {tabActive === "json" && (
        <pre
          className="text-xs font-mono rounded-md p-4 overflow-x-auto"
          style={{
            background: 'var(--ground-ink)',
            border: '1px solid var(--rule)',
            color: 'var(--glyph-bone)',
          }}
        >
          {JSON.stringify(
            {
              id,
              _kind: rec._kind,
              _file: rec._file,
              _cluster: rec._cluster,
              attributes: Object.fromEntries(
                Object.entries(rec).filter(([k]) => !k.startsWith("_") && k !== "id")
              ),
              outgoingEdges: out,
              incomingEdges: inc,
            },
            null,
            2
          )}
        </pre>
      )}

      {tabActive === "graph" && (
        <MiniGraph
          centerId={id}
          centerKind={rec._kind}
          outgoing={out.map((e) => ({ to: e.to, kind: e.kind, toKind: getRecord(e.to)?._kind }))}
          incoming={inc.map((e) => ({ from: e.from, kind: e.kind, fromKind: getRecord(e.from)?._kind }))}
        />
      )}
    </div>
  );
}
