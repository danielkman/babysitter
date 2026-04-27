const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

const packageJson = JSON.parse(readText(path.join(packageRoot, "package.json")));
const readme = readText(path.join(packageRoot, "README.md"));
const ciWorkflow = readText(path.join(repoRoot, ".github", "workflows", "ci.yml"));
const releaseWorkflow = readText(path.join(repoRoot, ".github", "workflows", "release.yml"));
const stagingWorkflow = readText(path.join(repoRoot, ".github", "workflows", "staging-publish.yml"));
const workspaceValidationDoc = readText(path.join(repoRoot, "docs", "workspace-validation.md"));

if (packageJson.private !== true) {
  fail("@a5c-ai/agent-catalog must remain private while its lifecycle policy is internal-only.");
}

if ("publishConfig" in packageJson) {
  fail("@a5c-ai/agent-catalog must not declare publishConfig while it is internal-only.");
}

if (packageJson.scripts?.prepack || packageJson.scripts?.prepublishOnly) {
  fail("@a5c-ai/agent-catalog must not declare publish-only package scripts while it is internal-only.");
}

if (packageJson.scripts?.["ci:staging"] || packageJson.scripts?.["ci:prod"]) {
  fail("@a5c-ai/agent-catalog must not advertise staging/prod release scripts while it is internal-only.");
}

if (!packageJson.scripts?.["policy:check"]) {
  fail("@a5c-ai/agent-catalog must declare policy:check to encode lifecycle policy in CI.");
}

if (!Array.isArray(packageJson.files) || !packageJson.files.includes("README.md")) {
  fail("@a5c-ai/agent-catalog must ship README.md in files so pack/install consumers see the lifecycle policy.");
}

const requiredReadmeSnippets = [
  "internal-only workspace package",
  "not part of the central `release.yml` or `staging-publish.yml` publish set",
  "compatibility contract is lockstep within this repository, not external semver support",
  "Breaking changes to exported APIs, graph documents, evidence layout, or generated discovery data must land in the same change",
];

for (const snippet of requiredReadmeSnippets) {
  if (!readme.includes(snippet)) {
    fail(`packages/agent-catalog/README.md must document: ${snippet}`);
  }
}

if (!ciWorkflow.includes("npm run ci:test --workspace=@a5c-ai/agent-catalog")) {
  fail("CI workflow must validate @a5c-ai/agent-catalog through npm run ci:test --workspace=@a5c-ai/agent-catalog.");
}

if (!workspaceValidationDoc.includes("packages/agent-catalog") || !workspaceValidationDoc.includes("lockstep")) {
  fail("docs/workspace-validation.md must describe the agent-catalog internal-only lockstep compatibility policy.");
}

if (releaseWorkflow.includes("@a5c-ai/agent-catalog")) {
  fail("release.yml must not publish @a5c-ai/agent-catalog while it is internal-only.");
}

if (stagingWorkflow.includes("@a5c-ai/agent-catalog")) {
  fail("staging-publish.yml must not publish @a5c-ai/agent-catalog while it is internal-only.");
}

console.log(
  JSON.stringify(
    {
      package: packageJson.name,
      private: packageJson.private,
      publishStrategy: "internal-only-workspace",
      validationCommand: "npm run ci:test --workspace=@a5c-ai/agent-catalog",
    },
    null,
    2,
  ),
);
