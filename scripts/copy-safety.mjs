import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const allowedPhrases = [
  "does not determine eligibility",
  "does not approve",
  "does not make housing decisions",
  "not an eligibility decision",
  "not eligibility",
  "no eligibility",
  "approve, deny, rank, score, predict",
  "does not score",
  "no scoring or decisioning",
  "must not label",
  "disallowed:",
];

const unsafePatterns = [
  /\byou qualify\b/i,
  /\byou are eligible\b/i,
  /\byou are ineligible\b/i,
  /\byou will be approved\b/i,
  /\byou will be denied\b/i,
  /\bapproval probability\b/i,
  /\bprobability of approval\b/i,
  /\bapplicant score\b/i,
  /\breadiness score\b/i,
];

const ignoredDirectories = new Set(["node_modules", ".next", ".git"]);

function collectFiles(directory, prefix = "") {
  const entries = readdirSync(directory);
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry)) continue;

    const absolutePath = join(directory, entry);
    const relativePath = prefix ? `${prefix}/${entry}` : entry;
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      files.push(...collectFiles(absolutePath, relativePath));
    } else if ([".ts", ".tsx", ".md"].includes(extname(entry))) {
      files.push(relativePath);
    }
  }

  return files;
}

const files = collectFiles(process.cwd());

const findings = [];

for (const file of files) {
  const text = readFileSync(join(process.cwd(), file), "utf8");
  const lines = text.split("\n");

  for (const [lineIndex, line] of lines.entries()) {
    const lowered = line.toLowerCase();

    for (const pattern of unsafePatterns) {
      const match = line.match(pattern);
      if (!match) continue;

      const isAllowed = allowedPhrases.some((phrase) => lowered.includes(phrase));
      if (!isAllowed) {
        findings.push(`${file}:${lineIndex + 1}: ${match[0]}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Unsafe housing-decision copy found:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Copy-safety check passed.");
