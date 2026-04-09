/**
 * tree.test.ts
 *
 * Tests for the pure function buildTreeLines, which converts a tree of
 * TreeNode objects into a flat list of TreeLine objects suitable for
 * line-by-line terminal rendering.
 *
 * Re-implemented here as a specification contract (TDD Red phase).
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Types (specification)
// ---------------------------------------------------------------------------

interface TreeNode {
  label: string;
  children?: TreeNode[];
  color?: string;
  icon?: string;
}

interface TreeLine {
  prefix: string;
  label: string;
  depth: number;
  color?: string;
  icon?: string;
}

// ---------------------------------------------------------------------------
// Branch characters (spec constants)
// ---------------------------------------------------------------------------

const BRANCH = "\u251c\u2500\u2500 "; // "├── "
const LAST_BRANCH = "\u2514\u2500\u2500 "; // "└── "
const CONTINUATION = "\u2502   "; // "│   "
const SPACING = "    "; // "    "

// ---------------------------------------------------------------------------
// Re-implementation (spec contract)
// ---------------------------------------------------------------------------

function buildTreeLines(
  nodes: TreeNode[],
  parentPrefix: string = "",
  depth: number = 0
): TreeLine[] {
  const lines: TreeLine[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;

    // For root-level nodes with no siblings concept at depth 0,
    // still use branch characters if there are multiple roots
    let prefix: string;
    if (depth === 0 && nodes.length === 1 && !node.children?.length) {
      // Single root with no children: empty prefix
      prefix = "";
    } else if (depth === 0) {
      prefix = isLast ? LAST_BRANCH : BRANCH;
    } else {
      prefix = parentPrefix + (isLast ? LAST_BRANCH : BRANCH);
    }

    // Special case: single node, no children, depth 0
    if (depth === 0 && nodes.length === 1 && !node.children?.length) {
      lines.push({
        prefix: "",
        label: node.label,
        depth,
        ...(node.color !== undefined ? { color: node.color } : {}),
        ...(node.icon !== undefined ? { icon: node.icon } : {}),
      });
    } else {
      lines.push({
        prefix: depth === 0 ? (isLast ? LAST_BRANCH : BRANCH) : prefix,
        label: node.label,
        depth,
        ...(node.color !== undefined ? { color: node.color } : {}),
        ...(node.icon !== undefined ? { icon: node.icon } : {}),
      });
    }

    if (node.children && node.children.length > 0) {
      const childPrefix =
        depth === 0
          ? isLast
            ? SPACING
            : CONTINUATION
          : parentPrefix + (isLast ? SPACING : CONTINUATION);

      const childLines = buildTreeLines(node.children, childPrefix, depth + 1);
      lines.push(...childLines);
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildTreeLines", () => {
  describe("empty input", () => {
    it("returns an empty array for empty input", () => {
      expect(buildTreeLines([])).toEqual([]);
    });
  });

  describe("single root, no children", () => {
    it("returns one line with empty prefix", () => {
      const nodes: TreeNode[] = [{ label: "root" }];
      const lines = buildTreeLines(nodes);
      expect(lines).toHaveLength(1);
      expect(lines[0].prefix).toBe("");
      expect(lines[0].label).toBe("root");
      expect(lines[0].depth).toBe(0);
    });
  });

  describe("flat list (multiple roots, no children)", () => {
    it("uses branch chars for non-last, last-branch for last", () => {
      const nodes: TreeNode[] = [
        { label: "alpha" },
        { label: "beta" },
        { label: "gamma" },
      ];
      const lines = buildTreeLines(nodes);
      expect(lines).toHaveLength(3);
      expect(lines[0].prefix).toBe(BRANCH);
      expect(lines[1].prefix).toBe(BRANCH);
      expect(lines[2].prefix).toBe(LAST_BRANCH);
    });

    it("all items have depth 0", () => {
      const nodes: TreeNode[] = [{ label: "a" }, { label: "b" }];
      const lines = buildTreeLines(nodes);
      for (const line of lines) {
        expect(line.depth).toBe(0);
      }
    });
  });

  describe("single root with children", () => {
    it("renders parent and children with proper prefixes", () => {
      const nodes: TreeNode[] = [
        {
          label: "parent",
          children: [{ label: "child-1" }, { label: "child-2" }],
        },
      ];
      const lines = buildTreeLines(nodes);
      expect(lines).toHaveLength(3);
      // parent
      expect(lines[0].label).toBe("parent");
      expect(lines[0].depth).toBe(0);
      // children
      expect(lines[1].label).toBe("child-1");
      expect(lines[1].depth).toBe(1);
      expect(lines[2].label).toBe("child-2");
      expect(lines[2].depth).toBe(1);
    });

    it("last child uses last-branch character", () => {
      const nodes: TreeNode[] = [
        {
          label: "root",
          children: [{ label: "a" }, { label: "b" }],
        },
      ];
      const lines = buildTreeLines(nodes);
      // child-2 (last) should end with LAST_BRANCH
      expect(lines[2].prefix).toContain("\u2514");
    });
  });

  describe("nested tree (2 levels)", () => {
    it("renders grandchildren at depth 2", () => {
      const nodes: TreeNode[] = [
        {
          label: "root",
          children: [
            {
              label: "child",
              children: [{ label: "grandchild" }],
            },
          ],
        },
      ];
      const lines = buildTreeLines(nodes);
      expect(lines).toHaveLength(3);
      expect(lines[2].label).toBe("grandchild");
      expect(lines[2].depth).toBe(2);
    });
  });

  describe("deep nesting (3+ levels)", () => {
    it("handles three levels of nesting", () => {
      const nodes: TreeNode[] = [
        {
          label: "L0",
          children: [
            {
              label: "L1",
              children: [
                {
                  label: "L2",
                  children: [{ label: "L3" }],
                },
              ],
            },
          ],
        },
      ];
      const lines = buildTreeLines(nodes);
      expect(lines).toHaveLength(4);
      expect(lines[0].depth).toBe(0);
      expect(lines[1].depth).toBe(1);
      expect(lines[2].depth).toBe(2);
      expect(lines[3].depth).toBe(3);
    });

    it("prefix length increases with depth", () => {
      const nodes: TreeNode[] = [
        {
          label: "L0",
          children: [
            {
              label: "L1",
              children: [
                {
                  label: "L2",
                  children: [{ label: "L3" }],
                },
              ],
            },
          ],
        },
      ];
      const lines = buildTreeLines(nodes);
      // Each subsequent depth should have a longer prefix
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].prefix.length).toBeGreaterThanOrEqual(
          lines[i - 1].prefix.length
        );
      }
    });
  });

  describe("color and icon passthrough", () => {
    it("passes color to output lines", () => {
      const nodes: TreeNode[] = [{ label: "colored", color: "red" }];
      const lines = buildTreeLines(nodes);
      expect(lines[0].color).toBe("red");
    });

    it("passes icon to output lines", () => {
      const nodes: TreeNode[] = [{ label: "with-icon", icon: ">" }];
      const lines = buildTreeLines(nodes);
      expect(lines[0].icon).toBe(">");
    });

    it("omits color and icon when not provided", () => {
      const nodes: TreeNode[] = [{ label: "plain" }];
      const lines = buildTreeLines(nodes);
      expect(lines[0].color).toBeUndefined();
      expect(lines[0].icon).toBeUndefined();
    });
  });

  describe("mixed siblings with and without children", () => {
    it("renders siblings with children before leaf siblings", () => {
      const nodes: TreeNode[] = [
        {
          label: "branch-node",
          children: [{ label: "leaf-child" }],
        },
        { label: "leaf-sibling" },
      ];
      const lines = buildTreeLines(nodes);
      expect(lines).toHaveLength(3);
      expect(lines[0].label).toBe("branch-node");
      expect(lines[1].label).toBe("leaf-child");
      expect(lines[2].label).toBe("leaf-sibling");
    });
  });

  describe("continuation vs spacing prefixes", () => {
    it("uses continuation for children of non-last siblings", () => {
      const nodes: TreeNode[] = [
        {
          label: "first",
          children: [{ label: "first-child" }],
        },
        { label: "second" },
      ];
      const lines = buildTreeLines(nodes);
      // first-child should have continuation prefix (parent is not last)
      expect(lines[1].prefix).toContain("\u2502");
    });
  });
});
