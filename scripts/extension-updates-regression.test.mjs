import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, rename, mkdir, access } from "node:fs/promises";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { createLoader } from "./helpers/load-typescript.mjs";

const load = createLoader();
const { ExtensionService } = load("src/main-process/services/extensions/extensionService.ts");
const { ExtensionRepository } = load("src/main-process/services/extensions/extensionRepository.ts");
const { verifyCatalog, compareVersions, releaseUrl } = load("src/main-process/services/extensions/extensionCatalog.ts");
const { unpackPackage } = load("src/main-process/services/extensions/extensionPackage.ts");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const source = {
  url: "https://github.com/leezhian/navo/releases/download/session-trace-catalog/catalog.json",
  publicKey: publicKey.export({ type: "spki", format: "pem" }),
};
function bundle(version, hostMajor = 1, apiVersion = 1) {
  const bytes = Buffer.from(
    JSON.stringify({
      manifest: { id: "session-trace", version, hostMajor, apiVersion, runtime: "runtime/index.cjs" },
      files: { "runtime/index.cjs": "module.exports={ version: \"" + version + "\" }" },
    }),
  );
  return {
    bytes,
    release: {
      version,
      hostMajor,
      apiVersion,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      url: releaseUrl(version),
    },
  };
}
const initial = bundle("0.1.0"),
  next = bundle("0.2.0"),
  future = bundle("2.0.0", 2),
  incompatibleApi = bundle("3.0.0", 1, 2);
function catalog(
  releases = [initial.release, next.release, future.release, incompatibleApi.release],
  publishedAt = "2026-11-06T08:00:00Z",
) {
  const payload = Buffer.from(JSON.stringify({ schemaVersion: 1, id: "session-trace", publishedAt, releases }));
  return { payload: payload.toString("base64"), signature: sign(null, payload, privateKey).toString("base64") };
}
async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "navo-extension-updates-"));
  const originalFetch = globalThis.fetch;
  const repository = new ExtensionRepository(path.join(root, "app.db"), "test");
  const directory = path.join(root, "extension");
  const statuses = [],
    downloads = [];
  let stopped = 0;
  const service = new ExtensionService(
    directory,
    repository,
    initial.release,
    (status) => statuses.push(status),
    () => {
      stopped++;
    },
    1,
    source,
  );
  const pkg = path.join(root, "initial.navo-extension");
  await writeFile(pkg, initial.bytes);
  globalThis.fetch = async (url) => {
    downloads.push(url);
    return new Response(url === source.url ? JSON.stringify(catalog()) : next.bytes);
  };
  try {
    await service.initialize();
    await run({ root, directory, repository, service, pkg, statuses, downloads, stopped: () => stopped });
  } finally {
    await service.shutdown();
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
}

test("signed catalog rejects tampering, wrong identities, unsafe URLs and duplicate versions; compares numeric versions", () => {
  assert.equal(verifyCatalog(catalog(), source.publicKey).releases.length, 4);
  const tampered = catalog();
  tampered.payload = Buffer.from("{}").toString("base64");
  assert.throws(() => verifyCatalog(tampered, source.publicKey), /CATALOG_INVALID/);
  const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
  assert.throws(() => verifyCatalog(catalog(), other), /CATALOG_INVALID/);
  for (const entries of [
    [{ ...next.release, url: "https://example.com/plugin" }],
    [next.release, next.release],
    [{ ...next.release, bytes: 999999999 }],
    [{ ...next.release, version: "0.2.0-beta" }],
  ])
    assert.throws(() => verifyCatalog(catalog(entries), source.publicKey), /CATALOG_INVALID/);
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
  assert.ok(compareVersions("1.0.0", "0.99.99") > 0);
});

test("checks deduplicate and only fetch metadata; update keeps enable preference and verifies offline after restart", () =>
  fixture(async ({ service, pkg, downloads, stopped, repository, directory }) => {
    await service.install(pkg);
    await service.setEnabled(true);
    await Promise.all([service.checkForUpdates(), service.checkForUpdates()]);
    assert.deepEqual(downloads, [source.url]);
    assert.equal(stopped(), 0);
    assert.equal(service.status.updateAvailable, true);
    assert.equal(service.status.availableVersion, "0.2.0");
    assert.equal(service.status.version, "0.1.0");
    assert.equal(service.status.enabled, true);
    await service.update();
    assert.equal(service.status.version, "0.2.0");
    assert.equal(service.status.enabled, true);
    assert.equal(service.status.updateAvailable, false);
    assert.equal(stopped(), 1);
    assert.deepEqual(downloads, [source.url, next.release.url]);
    globalThis.fetch = async () => {
      throw Error("offline");
    };
    const restarted = new ExtensionService(
      directory,
      repository,
      initial.release,
      () => {},
      () => {},
      1,
      source,
    );
    await restarted.initialize();
    assert.equal(restarted.status.enabled, true);
    assert.equal(restarted.status.compatible, true);
    await restarted.setEnabled(false);
    await restarted.setEnabled(true);
    await writeFile(path.join(restarted.installedDirectory, "catalog.json"), JSON.stringify({ payload: "e30=", signature: "invalid" }));
    await assert.rejects(restarted.setEnabled(true), /CATALOG_INVALID/);
    await restarted.shutdown();
  }));

test("disabled extension stays disabled after update; uninstalled extension can install the verified remote version", () =>
  fixture(async ({ service, pkg, repository }) => {
    await service.install(pkg);
    await service.checkForUpdates();
    await service.update();
    assert.equal(service.status.enabled, false);
    assert.equal((await repository.load()).enabled, false);
    await service.uninstall();
    await service.install();
    assert.equal(service.status.version, "0.2.0");
    assert.equal(service.status.enabled, false);
  }));

test("failed checks preserve the verified candidate and never report success; incompatible releases cannot be installed", () =>
  fixture(async ({ service, pkg }) => {
    await service.install(pkg);
    await service.checkForUpdates();
    const checkedAt = service.status.checkedAt;
    for (const response of [
      new Response("offline", { status: 500 }),
      new Response("{"),
      new Response(JSON.stringify(catalog([future.release]))),
      new Response(JSON.stringify(catalog([initial.release], "2026-11-05T08:00:00Z"))),
    ]) {
      globalThis.fetch = async () => response;
      await assert.rejects(service.checkForUpdates());
      assert.equal(service.status.checking, false);
      assert.ok(service.status.updateError);
      assert.equal(service.status.checkedAt, checkedAt);
      assert.equal(service.status.availableVersion, "0.2.0");
    }
    globalThis.fetch = async () =>
      new Response(JSON.stringify(catalog([{ ...next.release, sha256: "0".repeat(64) }], "2026-11-07T08:00:00Z")));
    await assert.rejects(service.checkForUpdates(), /CATALOG_INVALID/);
    assert.equal(service.status.version, "0.1.0");
  }));

test("download failure, cancellation and tampered packages leave old package enabled and retryable", () =>
  fixture(async ({ service, pkg }) => {
    await service.install(pkg);
    await service.setEnabled(true);
    await service.checkForUpdates();
    for (const response of [new Response("failure", { status: 503 }), new Response("tampered")]) {
      globalThis.fetch = async () => response;
      await assert.rejects(service.update());
      assert.equal(service.status.version, "0.1.0");
      assert.equal(service.status.enabled, true);
      assert.equal(service.status.operation, "idle");
      assert.deepEqual(await readFile(path.join(service.installedDirectory, "package.navo-extension")), initial.bytes);
    }
    let started;
    const downloading = new Promise((resolve) => {
      started = resolve;
    });
    globalThis.fetch = async (_url, { signal }) => {
      started();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    };
    const updating = service.update();
    await downloading;
    await assert.rejects(service.uninstall(), /BUSY/);
    await assert.rejects(service.checkForUpdates(), /BUSY/);
    service.cancel();
    await updating;
    assert.equal(service.status.enabled, true);
    assert.equal(service.status.version, "0.1.0");
    globalThis.fetch = async () => new Response(next.bytes);
    await service.update();
    assert.equal(service.status.version, "0.2.0");
  }));

test("database commit failure rolls back the file swap; initial journal failure leaves state untouched", () =>
  fixture(async ({ directory, repository, pkg }) => {
    let failJournal = false,
      failCommit = true;
    const guarded = {
      load: () => repository.load(),
      save: (record) => {
        if ((record.operation === "updating" && failJournal) || (record.version === "0.2.0" && record.operation === "idle" && failCommit))
          throw Error("SQLITE_BUSY");
        return repository.save(record);
      },
    };
    const service = new ExtensionService(
      directory,
      guarded,
      initial.release,
      () => {},
      () => {},
      1,
      source,
    );
    await service.initialize();
    await service.install(pkg);
    await service.setEnabled(true);
    await service.checkForUpdates();
    await assert.rejects(service.update(), /OPERATION_FAILED/);
    assert.equal(service.status.version, "0.1.0");
    assert.equal(service.status.enabled, true);
    assert.equal((await repository.load()).operation, "idle");
    assert.deepEqual(await readFile(path.join(service.installedDirectory, "package.navo-extension")), initial.bytes);
    await assert.rejects(access(path.join(directory, "backup")));
    failJournal = true;
    await assert.rejects(service.update(), /OPERATION_FAILED/);
    assert.equal(service.status.operation, "idle");
    failJournal = false;
    failCommit = false;
    await service.update();
    assert.equal(service.status.version, "0.2.0");
    await service.shutdown();
  }));

test("interrupted updates recover old package at each swap boundary; committed updates keep the new version", () =>
  fixture(async ({ service, pkg, directory, repository }) => {
    await service.install(pkg);
    await service.setEnabled(true);
    for (const phase of ["prepared", "old-moved", "new-moved"]) {
      await repository.save({ version: "0.1.0", enabled: true, operation: "updating" });
      await unpackPackage(next.bytes, next.release, path.join(directory, "staging"));
      if (phase !== "prepared") await rename(path.join(directory, "installed"), path.join(directory, "backup"));
      if (phase === "new-moved") await rename(path.join(directory, "staging"), path.join(directory, "installed"));
      const restarted = new ExtensionService(
        directory,
        repository,
        initial.release,
        () => {},
        () => {},
        1,
        source,
      );
      await restarted.initialize();
      assert.equal(restarted.status.version, "0.1.0");
      assert.equal(restarted.status.enabled, true);
      assert.deepEqual(await readFile(path.join(restarted.installedDirectory, "package.navo-extension")), initial.bytes);
      await assert.rejects(access(path.join(directory, "staging")));
      await assert.rejects(access(path.join(directory, "backup")));
      await restarted.shutdown();
    }
    await service.checkForUpdates();
    await service.update();
    await mkdir(path.join(directory, "backup"));
    await writeFile(path.join(directory, "backup/leftover"), "old");
    const restarted = new ExtensionService(
      directory,
      repository,
      initial.release,
      () => {},
      () => {},
      1,
      source,
    );
    await restarted.initialize();
    assert.equal(restarted.status.version, "0.2.0");
    assert.equal(restarted.status.enabled, true);
    await assert.rejects(access(path.join(directory, "backup")));
    await restarted.shutdown();
  }));

test("background checks skip uninstalled plugins, only fetch metadata and stop on shutdown", async (context) => {
  await fixture(async ({ service, pkg, downloads }) => {
    context.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    service.startUpdateChecks();
    context.mock.timers.tick(30000);
    assert.equal(downloads.length, 0);
    await service.install(pkg);
    context.mock.timers.tick(4 * 60 * 60 * 1000);
    await service.checkForUpdates();
    assert.deepEqual(downloads, [source.url]);
    assert.equal(service.status.version, "0.1.0");
    await service.shutdown();
    context.mock.timers.tick(4 * 60 * 60 * 1000);
    assert.equal(downloads.length, 1);
    context.mock.timers.reset();
  });
});

test("unfinished rollback remains disabled and is reconciled after storage recovers", () => fixture(async ({ directory, repository, pkg }) => {
  let failWrites = false;
  const guarded = { load: () => repository.load(), save: record => {
    if (failWrites && record.operation === "idle") throw Error("SQLITE_BUSY");
    return repository.save(record);
  } };
  const service = new ExtensionService(directory, guarded, initial.release, () => {}, () => {}, 1, source);
  await service.initialize(); await service.install(pkg); await service.setEnabled(true); await service.checkForUpdates();
  failWrites = true;
  await assert.rejects(service.update(), /UPDATE_ROLLBACK_FAILED/);
  assert.equal(service.status.enabled, false); assert.equal(service.status.operation, "updating");
  assert.equal((await repository.load()).operation, "updating");
  await service.shutdown();
  const restarted = new ExtensionService(directory, repository, initial.release, () => {}, () => {}, 1, source);
  await restarted.initialize(); assert.equal(restarted.status.version, "0.1.0"); assert.equal(restarted.status.enabled, true);
  await restarted.shutdown();
}));

test("update checks time out and can be retried; shutdown aborts an outstanding check", async context => {
  await fixture(async ({ service }) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    try {
      globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Error("aborted")), { once: true }));
      const timedOut = assert.rejects(service.checkForUpdates(), /UPDATE_CHECK_FAILED/);
      context.mock.timers.tick(20000); await timedOut;
      assert.equal(service.status.checking, false); assert.equal(service.status.checkedAt, null);
      globalThis.fetch = async () => new Response(JSON.stringify(catalog()));
      await service.checkForUpdates(); assert.equal(service.status.updateError, null);
      globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Error("aborted")), { once: true }));
      const cancelled = assert.rejects(service.checkForUpdates(), /UPDATE_CHECK_FAILED/);
      await service.shutdown(); await cancelled; assert.equal(service.status.checking, false);
    } finally { context.mock.timers.reset(); }
  });
});
