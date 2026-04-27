const fs = require("fs");
const path = require("path");
const { parse } = require("yaml");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const packageJsonPath = path.resolve(__dirname, "..", "package.json");
const graphDocumentPath = path.resolve(__dirname, "..", "graph", "agent-catalog.graph.yaml");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const graphDocument = parse(fs.readFileSync(graphDocumentPath, "utf8"));

if (!packageJson.version || typeof packageJson.version !== "string") {
  fail("package.json must declare a version string.");
}

if (!graphDocument.catalogVersion || typeof graphDocument.catalogVersion !== "string") {
  fail("agent-catalog.graph.yaml must declare catalogVersion.");
}

if (!graphDocument.evidencePolicy || typeof graphDocument.evidencePolicy !== "object") {
  fail("agent-catalog.graph.yaml must declare an object evidencePolicy.");
}

if (!packageJson.files || !packageJson.files.includes("graph")) {
  fail("package.json must publish the graph directory.");
}

if (!packageJson.files.includes("evidence")) {
  fail("package.json must publish the evidence directory.");
}

const requiredScripts = [
  "generate:evidence",
  "build",
  "test",
  "validate:evidence:freshness",
  "ci:evidence",
  "policy:check",
  "ci:test",
  "version:check",
];
const missingScripts = requiredScripts.filter((name) => !packageJson.scripts || !packageJson.scripts[name]);
if (missingScripts.length > 0) {
  fail(`Missing required scripts: ${missingScripts.join(", ")}`);
}

console.log(
  JSON.stringify(
    {
      packageVersion: packageJson.version,
      catalogVersion: graphDocument.catalogVersion,
      requiredScripts,
    },
    null,
    2,
  ),
);
