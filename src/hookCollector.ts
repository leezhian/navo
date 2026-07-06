import type { ReviewProvider } from "./domain/types";
import { runHookCollectorFromStdin } from "./main-process/services/hookCollectorService";

runHookCollectorFromStdin(parseHookCollectorArgs(process.argv))
  .then((output) => {
    if (output) {
      process.stdout.write(output);
    }
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

function parseHookCollectorArgs(argv: string[]) {
  const provider = readArgValue(argv, "--provider");

  if (!isReviewProvider(provider)) {
    throw new Error("Missing or unsupported Vibe Reviewer hook provider.");
  }

  return { provider };
}

function readArgValue(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function isReviewProvider(value: unknown): value is ReviewProvider {
  return value === "codex" || value === "claude";
}
