#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const run = (cmd, fallback = "") => {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return fallback;
  }
};

const bumpVersion = (version, level) => {
  const [major, minor, patch] = version.split(".").map((n) => parseInt(n, 10));
  if ([major, minor, patch].some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid semver detected in package.json: ${version}`);
  }
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

const isValidSemver = (version) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version);

const parseExplicitVersion = (argv) => {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--version") {
      return argv[index + 1] ?? null;
    }
    if (value.startsWith("--version=")) {
      return value.slice("--version=".length);
    }
    if (!value.startsWith("--")) {
      return value;
    }
  }
  return null;
};

const writeJson = (path, data) => {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
};

const updateVersionField = (path, version) => {
  if (!existsSync(path)) {
    return;
  }
  const data = JSON.parse(readFileSync(path, "utf8"));
  data.version = version;
  writeJson(path, data);
};

const syncDependencyVersion = (path, packageName, version) => {
  if (!existsSync(path)) {
    return;
  }
  const data = JSON.parse(readFileSync(path, "utf8"));
  let changed = false;
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"]) {
    if (data[field]?.[packageName]) {
      data[field][packageName] = version;
      changed = true;
    }
  }
  if (changed) {
    writeJson(path, data);
  }
};

const updateLockVersion = (path, version) => {
  if (!existsSync(path)) {
    return;
  }
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (data.version) {
    data.version = version;
  }
  if (data.packages && data.packages[""]) {
    data.packages[""].version = version;
  }
  writeJson(path, data);
};

const workspaceManifestPaths = [
  "package.json",
  "packages/sdk/package.json",
  "packages/babysitter/package.json",
  "packages/babysitter-harness/package.json",
  "packages/unified-plugins/package.json",
  "packages/hooks-proxy/core/package.json",
  "packages/hooks-proxy/cli/package.json",
  "packages/hooks-proxy/adapter-claude/package.json",
  "packages/hooks-proxy/adapter-codex/package.json",
  "packages/hooks-proxy/adapter-gemini/package.json",
  "packages/hooks-proxy/adapter-copilot/package.json",
  "packages/hooks-proxy/adapter-cursor/package.json",
  "packages/hooks-proxy/adapter-pi/package.json",
  "packages/hooks-proxy/adapter-oh-my-pi/package.json",
  "packages/hooks-proxy/adapter-opencode/package.json",
  "packages/hooks-proxy/adapter-openclaw/package.json",
];

const pluginPackageManifestPaths = [
  "plugins/babysitter-codex/package.json",
  "plugins/babysitter-github/package.json",
  "plugins/babysitter-cursor/package.json",
  "plugins/babysitter-gemini/package.json",
  "plugins/babysitter-pi/package.json",
  "plugins/babysitter-omp/package.json",
  "plugins/babysitter-opencode/package.json",
  "plugins/babysitter-openclaw/package.json",
  "plugins/babysitter-paperclip/package.json",
];

const pluginManifestPaths = [
  "plugins/babysitter/.claude-plugin/plugin.json",
  "plugins/babysitter/plugin.json",
  "plugins/babysitter-gemini/plugin.json",
  "plugins/babysitter-gemini/gemini-extension.json",
  "plugins/babysitter-github/plugin.json",
  "plugins/babysitter-cursor/plugin.json",
  "plugins/babysitter-opencode/plugin.json",
  "plugins/babysitter-openclaw/plugin.json",
  "plugins/babysitter-openclaw/openclaw.plugin.json",
];

const versionsJsonPaths = [
  "plugins/babysitter/versions.json",
  "plugins/babysitter-codex/versions.json",
  "plugins/babysitter-gemini/versions.json",
  "plugins/babysitter-omp/versions.json",
  "plugins/babysitter-opencode/versions.json",
  "plugins/babysitter-pi/versions.json",
  "plugins/babysitter-github/versions.json",
  "plugins/babysitter-cursor/versions.json",
  "plugins/babysitter-openclaw/versions.json",
  "plugins/babysitter-paperclip/versions.json",
];

const lockPaths = ["package-lock.json"];

const rootManifest = JSON.parse(readFileSync("package.json", "utf8"));
const currentVersion = rootManifest.version;
const explicitVersion = parseExplicitVersion(process.argv.slice(2));

if (explicitVersion && !isValidSemver(explicitVersion)) {
  throw new Error(`Invalid version argument: ${explicitVersion}`);
}

let newVersion = explicitVersion;
if (!newVersion) {
  const lastTag = run("git describe --tags --abbrev=0");
  const logRange = lastTag ? `${lastTag}..HEAD` : "";
  const logCmd = lastTag
    ? `git log ${logRange} --pretty=%s`
    : "git log -n 50 --pretty=%s";
  const commits = run(logCmd, "");

  let bumpTarget = "patch";
  if (/#major\b/i.test(commits)) {
    bumpTarget = "major";
  } else if (/#minor\b/i.test(commits)) {
    bumpTarget = "minor";
  }

  newVersion = bumpVersion(currentVersion, bumpTarget);
}

for (const path of [...workspaceManifestPaths, ...pluginPackageManifestPaths, ...pluginManifestPaths]) {
  updateVersionField(path, newVersion);
}

for (const path of [
  "packages/babysitter/package.json",
  "packages/babysitter-harness/package.json",
  "plugins/babysitter-codex/package.json",
  "plugins/babysitter-github/package.json",
  "plugins/babysitter-cursor/package.json",
  "plugins/babysitter-gemini/package.json",
  "plugins/babysitter-pi/package.json",
  "plugins/babysitter-omp/package.json",
  "plugins/babysitter-opencode/package.json",
  "plugins/babysitter-openclaw/package.json",
  "plugins/babysitter-paperclip/package.json",
]) {
  syncDependencyVersion(path, "@a5c-ai/babysitter-sdk", newVersion);
}

for (const path of [
  "packages/hooks-proxy/cli/package.json",
  "packages/hooks-proxy/adapter-claude/package.json",
  "packages/hooks-proxy/adapter-codex/package.json",
  "packages/hooks-proxy/adapter-gemini/package.json",
  "packages/hooks-proxy/adapter-copilot/package.json",
  "packages/hooks-proxy/adapter-cursor/package.json",
  "packages/hooks-proxy/adapter-pi/package.json",
  "packages/hooks-proxy/adapter-oh-my-pi/package.json",
  "packages/hooks-proxy/adapter-opencode/package.json",
  "packages/hooks-proxy/adapter-openclaw/package.json",
]) {
  syncDependencyVersion(path, "@a5c-ai/hooks-proxy-core", newVersion);
}

for (const path of versionsJsonPaths) {
  const data = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  data.sdkVersion = newVersion;
  if (path === "plugins/babysitter-gemini/versions.json" && "extensionVersion" in data) {
    data.extensionVersion = newVersion;
  }
  writeJson(path, data);
}

const marketplacePath = ".claude-plugin/marketplace.json";
if (existsSync(marketplacePath)) {
  const marketplaceData = JSON.parse(readFileSync(marketplacePath, "utf8"));
  if (Array.isArray(marketplaceData.plugins)) {
    const babysitterPlugin = marketplaceData.plugins.find((plugin) => plugin.name === "babysitter");
    if (babysitterPlugin) {
      babysitterPlugin.version = newVersion;
    }
  }
  writeJson(marketplacePath, marketplaceData);
}

for (const path of lockPaths) {
  updateLockVersion(path, newVersion);
}

const changelogPath = "CHANGELOG.md";
if (!existsSync(changelogPath)) {
  throw new Error("CHANGELOG.md is required to build release notes.");
}

const changelog = readFileSync(changelogPath, "utf8");
const unreleasedPattern = /## \[Unreleased\](?<body>[\s\S]*?)(?=^## \[|$)/m;
const matches = changelog.match(unreleasedPattern);
if (!matches || !matches.groups) {
  throw new Error('Unable to locate "## [Unreleased]" section in CHANGELOG.md.');
}

const unreleasedBody = matches.groups.body.trim();
const isPlaceholder = unreleasedBody === "" || unreleasedBody === "- No unreleased changes.";
const releaseBody = !isPlaceholder ? `${unreleasedBody}\n` : "- No notable changes.\n";
const placeholder = "- No unreleased changes.\n";
const isoDate = new Date().toISOString().split("T")[0];
const replacement = `## [Unreleased]\n\n${placeholder}\n\n## [${newVersion}] - ${isoDate}\n${releaseBody}\n`;
const updatedChangelog = changelog.replace(unreleasedPattern, replacement);
writeFileSync(changelogPath, updatedChangelog);

process.stdout.write(newVersion);
