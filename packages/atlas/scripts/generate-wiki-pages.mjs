/**
 * generate-wiki-pages.mjs
 *
 * Pre-build generator that walks library specialization and methodology
 * README.md files and produces atlas wiki pages with proper frontmatter.
 *
 * Output: packages/atlas/graph/wiki/library/<slug>.md
 *
 * These generated pages are gitignored and rebuilt on every atlas build.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Path resolution ─────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const libraryDir = path.resolve(__dirname, "..", "..", "..", "library");
const outputDir = path.resolve(__dirname, "..", "graph", "wiki", "library");
const repoRoot = path.resolve(__dirname, "..", "..", "..");

// ── Helpers ─────────────────────────────────────────────────────────────────

function findReadmes(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      findReadmes(full, results);
    } else if (entry.name === "README.md") {
      results.push(full);
    }
  }
  return results;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Extract a human-friendly specialization/methodology name from the README
 * content or from the directory path.
 *
 * Strategy:
 *   1. Use the first H1 heading if present.
 *   2. Otherwise, title-case the parent directory name.
 */
function extractTitle(content, dirName) {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  // Title-case the directory name
  return dirName
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Derive the specialization slug from a library-relative path.
 *
 * Examples:
 *   specializations/web-development/README.md          -> web-development
 *   specializations/domains/business/finance/README.md  -> finance
 *   methodologies/tdd/README.md                         -> tdd
 *   methodologies/scrum/README.md                       -> scrum
 */
function deriveSlug(relPath) {
  // Normalise to forward slashes
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  // Remove trailing README.md
  if (parts[parts.length - 1] === "README.md") parts.pop();
  // The slug is the last directory segment
  const dirName = parts[parts.length - 1];
  if (!dirName) return null;
  return slugify(dirName);
}

/**
 * Determine the category label for a README based on its library path.
 */
function deriveCategory(relPath) {
  if (relPath.startsWith("methodologies")) return "methodology";
  if (relPath.includes("domains/")) return "domain-specialization";
  return "specialization";
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log("[generate-wiki-pages] scanning library READMEs...");

  // Clean and recreate output dir
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  if (!fs.existsSync(libraryDir)) {
    console.log("[generate-wiki-pages] library dir not found, skipping");
    return;
  }

  const readmes = [];
  findReadmes(path.join(libraryDir, "specializations"), readmes);
  findReadmes(path.join(libraryDir, "methodologies"), readmes);

  // Track slugs to avoid collisions
  const usedSlugs = new Map();
  let count = 0;

  for (const readme of readmes) {
    const content = fs.readFileSync(readme, "utf8");
    const relPath = path.relative(libraryDir, readme).split(path.sep).join("/");

    const slug = deriveSlug(relPath);
    if (!slug) continue;

    // Handle slug collisions by appending category prefix
    const category = deriveCategory(relPath);
    let finalSlug = slug;
    if (usedSlugs.has(slug)) {
      // If this slug already exists from a different category, prefix it
      const existing = usedSlugs.get(slug);
      if (existing.category !== category) {
        // Rename existing if it hasn't been renamed yet
        if (!existing.renamed) {
          const oldPath = path.join(outputDir, `${slug}.md`);
          const newSlug = `${existing.category}-${slug}`;
          const newPath = path.join(outputDir, `${newSlug}.md`);
          if (fs.existsSync(oldPath)) {
            // Rewrite with updated id/slug
            const oldContent = fs.readFileSync(oldPath, "utf8");
            fs.writeFileSync(
              newPath,
              oldContent
                .replace(`id: page:library-${slug}`, `id: page:library-${newSlug}`)
                .replace(`slug: "library/${slug}"`, `slug: "library/${newSlug}"`)
            );
            fs.unlinkSync(oldPath);
          }
          existing.renamed = true;
          existing.finalSlug = newSlug;
        }
        finalSlug = `${category}-${slug}`;
      } else {
        // Same category collision — append a counter
        let counter = 2;
        while (usedSlugs.has(`${slug}-${counter}`)) counter++;
        finalSlug = `${slug}-${counter}`;
      }
    }
    usedSlugs.set(finalSlug, { category, renamed: false, finalSlug });

    const relDir = path.dirname(relPath);
    const dirName = relDir.split("/").pop();
    const title = extractTitle(content, dirName);

    // Build the document reference ID matching generated-library-nodes conventions
    const specId = `specialization:${slug}`;

    const page = `---
id: page:library-${finalSlug}
nodeKind: Page
title: "${title.replace(/"/g, '\\"')} (Library)"
slug: "library/${finalSlug}"
articlePath: "wiki/library/${finalSlug}.md"
documents:
  - ${specId}
---

${content}
`;

    fs.writeFileSync(path.join(outputDir, `${finalSlug}.md`), page);
    count++;
  }

  console.log(`[generate-wiki-pages] done: ${count} pages written to graph/wiki/library/`);
}

main();
