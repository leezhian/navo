import { generateKeyPairSync, createPublicKey, sign, verify } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "init-key": { type: "boolean" },
    key: { type: "string" },
    release: { type: "string" },
    previous: { type: "string" },
    output: { type: "string" },
  },
});
const keyPath = values.key ?? path.join(os.homedir(), ".config/navo/release-keys/session-trace-ed25519.pem");
const trustPath = "src/main-process/services/extensions/sessionTraceTrust.json";
if (values["init-key"]) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  await mkdir(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  // 私钥只写入仓库外的发布目录，不打印、不复制到应用和插件包中，也不覆盖已有密钥。
  await writeFile(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600, flag: "wx" });
  await writeFile(
    trustPath,
    JSON.stringify(
      {
        url: "https://github.com/leezhian/navo/releases/download/session-trace-catalog/catalog.json",
        publicKey: publicKey.export({ type: "spki", format: "pem" }),
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log("Created signing key outside the repository; pinned its public key in " + trustPath);
} else {
  if (!values.release) throw Error("Pass --release extension-dist/session-trace-VERSION.release.json");
  const trust = JSON.parse(await readFile(trustPath, "utf8"));
  const privateKey = await readFile(keyPath);
  if (createPublicKey(privateKey).export({ type: "spki", format: "pem" }) !== trust.publicKey)
    throw Error("Signing key does not match the pinned public key");
  const releases = [];
  if (values.previous) {
    const envelope = JSON.parse(await readFile(values.previous, "utf8"));
    const payload = Buffer.from(envelope.payload, "base64");
    if (!verify(null, payload, trust.publicKey, Buffer.from(envelope.signature, "base64")))
      throw Error("Previous catalog signature is invalid");
    releases.push(...JSON.parse(payload.toString("utf8")).releases);
  }
  const release = { ...JSON.parse(await readFile(values.release, "utf8")), apiVersion: 1, hostMajor: 1 };
  const existing = releases.find((item) => item.version === release.version);
  if (existing && (existing.sha256 !== release.sha256 || existing.bytes !== release.bytes))
    throw Error("Published versions are immutable; increment the version");
  if (!existing) releases.push(release);
  const payload = Buffer.from(JSON.stringify({ schemaVersion: 1, id: "session-trace", publishedAt: new Date().toISOString(), releases }));
  const envelope = { payload: payload.toString("base64"), signature: sign(null, payload, privateKey).toString("base64") };
  const output = values.output ?? "extension-dist/catalog.json";
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(envelope, null, 2) + "\n");
  console.log("Signed catalog: " + output + " (not published)");
}
