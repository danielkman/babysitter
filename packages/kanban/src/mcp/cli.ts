import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createKanbanMcpServer } from "@/mcp/server";

declare const __KANBAN_MCP_VERSION__: string | undefined;

function printUsage(): void {
  process.stdout.write(
    [
      "kanban-mcp-server",
      "",
      "Usage:",
      "  kanban-mcp-server",
      "  kanban-mcp-server --version",
      "  kanban-mcp-server --help",
      "",
      "Starts the kanban MCP server on stdio.",
    ].join("\n") + "\n",
  );
}

function printVersion(): void {
  process.stdout.write(`${typeof __KANBAN_MCP_VERSION__ === "string" ? __KANBAN_MCP_VERSION__ : "unknown"}\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    printVersion();
    return;
  }

  const server = createKanbanMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Kanban MCP server running on stdio\n");

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await new Promise<void>(() => {});
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
