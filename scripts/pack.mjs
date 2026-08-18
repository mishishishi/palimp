#!/usr/bin/env node

// Packs every @palimp/* package into a tarball a host can install with `file:`.
//
//   pnpm pack:all
//   pnpm pack:all --out ../nano-pro-web/vendor
//   pnpm pack:all --verify-only --out ../nano-pro-web/vendor
//
// The load-bearing part is not the packing — it is the assertions afterwards. `@palimp/core` is a
// `workspace:*` **peer** of the other four packages, and `workspace:*` does not resolve outside
// this monorepo. `pnpm pack` rewrites it to a real version; if it ever stops doing so, the symptom
// appears in the consumer's install log rather than here. So we read each tarball back out and
// check, instead of trusting it.
//
// Versions are lockstep: all five packages carry one version and are packed together. The script
// refuses to pack a set whose versions have drifted.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const libsDir = join(root, "libs");

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "dist-packages" },
    "verify-only": { type: "boolean", default: false },
  },
});
const outDir = resolve(process.cwd(), values.out);

const DEPENDENCY_FIELDS = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
  "devDependencies",
];
const RUNTIME_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"];

/** `@palimp/fe-next` + `1.0.0` -> `palimp-fe-next-1.0.0.tgz`, npm's own naming. */
const tarballName = (name, version) =>
  `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;

const readTarballFile = (tarball, member) =>
  execFileSync("tar", ["-xzOf", tarball, `package/${member}`], { encoding: "utf8" });

const listTarball = (tarball) =>
  execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).split("\n").filter(Boolean);

/** Every relative target reachable from an `exports` map, however deeply conditioned. */
const exportTargets = (node) => {
  if (typeof node === "string") return node.startsWith("./") ? [node] : [];
  if (node && typeof node === "object") return Object.values(node).flatMap(exportTargets);
  return [];
};

const die = (message) => {
  console.error(`pack: ${message}`);
  process.exit(1);
};

// --- Reading the workspace ---------------------------------------------------------------------

const readSourcePackages = () =>
  readdirSync(libsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(libsDir, entry.name, "package.json"))
    .filter(existsSync)
    .map((file) => ({ dir: dirname(file), source: JSON.parse(readFileSync(file, "utf8")) }))
    .filter((pkg) => pkg.source.name?.startsWith("@palimp/"))
    .sort((a, b) => a.source.name.localeCompare(b.source.name));

/** All packages ship together, so one version across the set is the invariant, not a convention. */
const lockstepVersion = (entries, describe) => {
  const versions = [...new Set(entries.map((entry) => entry.version))];
  if (versions.length === 1) return versions[0];

  console.error("pack: versions have drifted. All @palimp/* packages ship together at one version.\n");
  for (const entry of entries) console.error(`  ${entry.version.padEnd(10)} ${entry.name}`);
  die(describe);
};

// --- The assertions ------------------------------------------------------------------------------

/** Reads each tarball back out and checks what a consumer will actually install. */
const verify = (tarballs) => {
  const failures = [];
  const fail = (message) => failures.push(message);

  const packages = tarballs.map((file) => ({
    file,
    manifest: JSON.parse(readTarballFile(file, "package.json")),
    entries: listTarball(file),
  }));

  const version = lockstepVersion(
    packages.map((pkg) => pkg.manifest),
    "these tarballs cannot have been packed from one build.",
  );
  const packedVersions = new Map(packages.map((pkg) => [pkg.manifest.name, pkg.manifest.version]));

  for (const { file, manifest, entries } of packages) {
    const name = manifest.name;

    if (basename(file) !== tarballName(name, manifest.version))
      fail(`${basename(file)}: contains ${name}@${manifest.version}, which is not what the name says`);

    // The assertion this whole script exists for.
    for (const field of DEPENDENCY_FIELDS)
      for (const [dep, range] of Object.entries(manifest[field] ?? {}))
        if (String(range).startsWith("workspace:"))
          fail(
            `${name}: ${field}.${dep} is still "${range}" — the workspace protocol was not ` +
              `rewritten, and it will not resolve outside this monorepo`,
          );

    // A host installing fe-next whose core peer names a version it does not have gets a confusing
    // peer warning and a runtime type mismatch.
    for (const field of RUNTIME_FIELDS)
      for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
        if (!dep.startsWith("@palimp/") || String(range).startsWith("workspace:")) continue;
        if (!packedVersions.has(dep)) fail(`${name}: ${field}.${dep} was not packed`);
        else if (range !== packedVersions.get(dep))
          fail(`${name}: ${field}.${dep} is "${range}", but ${dep} packed at ${packedVersions.get(dep)}`);
      }

    // dist/ is gitignored, so an absent or stale build is the likeliest way to ship a tarball that
    // installs cleanly and then fails at import. Confirm every exports target actually shipped.
    const targets = [...new Set(exportTargets(manifest.exports ?? {}))];
    if (targets.length === 0) fail(`${name}: the packed package.json has no exports map`);
    for (const target of targets)
      if (!entries.includes(`package/${target.slice(2)}`))
        fail(`${name}: exports points at ${target}, which is not in the tarball`);
  }

  if (failures.length > 0) {
    console.error(`\npack: ${failures.length} assertion(s) failed.\n`);
    for (const message of failures) console.error(`  ✗ ${message}`);
    console.error("");
    process.exit(1);
  }

  return { packages, version };
};

// --- verify-only ---------------------------------------------------------------------------------

if (values["verify-only"]) {
  const tarballs = existsSync(outDir)
    ? readdirSync(outDir)
        .filter((file) => /^palimp-.*\.tgz$/.test(file))
        .sort()
        .map((file) => join(outDir, file))
    : [];
  if (tarballs.length === 0) die(`no palimp-*.tgz found in ${outDir}`);

  const { packages, version } = verify(tarballs);
  console.log(`pack: ${packages.length} tarballs at ${version} verified in ${relative(process.cwd(), outDir) || "."}`);
  for (const pkg of packages) console.log(`  ✓ ${basename(pkg.file)}`);
  process.exit(0);
}

// --- 1. Collect ----------------------------------------------------------------------------------

const packages = readSourcePackages();
if (packages.length === 0) die("found no @palimp/* packages under libs/ — nothing to do.");

// Checked before the build, so a bookkeeping slip costs a second rather than a minute.
const version = lockstepVersion(
  packages.map((pkg) => pkg.source),
  "set one version in every libs/*/package.json, then pack again.",
);

// --- 2. Build first, always ----------------------------------------------------------------------

// libs/*/dist is gitignored. Packing an absent or stale dist yields a tarball that installs
// cleanly and then fails at import — a module-not-found the host will spend an hour blaming on its
// own config. This is not a flag.
console.log("pack: building libs…\n");
execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });

// --- 3. Pack ---------------------------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });

const packed = [];
for (const pkg of packages) {
  const file = join(outDir, tarballName(pkg.source.name, version));

  // Drop any same-named tarball first, so the existence check below proves *this* run wrote it.
  rmSync(file, { force: true });
  execFileSync("pnpm", ["pack", "--pack-destination", outDir], { cwd: pkg.dir, stdio: "pipe" });

  if (!existsSync(file))
    die(`${pkg.source.name}: expected ${basename(file)}, which pnpm pack did not produce`);
  packed.push(file);
}

if (packed.length === 0) die("packed zero packages.");

// --- 4. Verify ---------------------------------------------------------------------------------

verify(packed);

// --- 5. Report -----------------------------------------------------------------------------------

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const dirty = git(["status", "--porcelain"]) !== "";

// The same version gets packed from different commits while pre-1.0, so the version alone does not
// answer "which build is in the host?". The manifest travels with the tarballs and does.
writeFileSync(
  join(outDir, "palimp-manifest.json"),
  JSON.stringify(
    {
      version,
      commit: git(["rev-parse", "HEAD"]),
      dirty,
      packedAt: new Date().toISOString(),
      packages: Object.fromEntries(
        packages.map((pkg, i) => [pkg.source.name, basename(packed[i])]),
      ),
    },
    null,
    2,
  ) + "\n",
);

const stale = readdirSync(outDir)
  .filter((file) => /^palimp-.*\.tgz$/.test(file))
  .filter((file) => !packed.some((tarball) => basename(tarball) === file));

const outLabel = relative(process.cwd(), outDir) || ".";
console.log(
  `\npack: ${packed.length} packages at ${version} → ${outLabel}${dirty ? " (working tree dirty)" : ""}\n`,
);
for (const [i, pkg] of packages.entries()) {
  const kb = Math.round(statSync(packed[i]).size / 1024);
  console.log(
    `  ${pkg.source.name.padEnd(24)} ${basename(packed[i]).padEnd(36)} ${String(kb).padStart(4)} KB`,
  );
}

console.log(`\nIn the host's package.json, with the tarballs under ./${basename(outDir)}/:\n`);
for (const [i, pkg] of packages.entries())
  console.log(`  "${pkg.source.name}": "file:./${basename(outDir)}/${basename(packed[i])}",`);
console.log("\nTake core + fe-next + one backend; publish-github is optional.");

if (stale.length > 0)
  console.log(
    `\nLeftovers from an earlier version, not written by this run:\n${stale.map((f) => `  ${f}`).join("\n")}`,
  );
