/**
 * Centralized tuning knobs. Numbers that are expected to change as the product
 * grows live here so we don't have to hunt through agent/worker code.
 *
 * When adjusting, remember:
 *   - Bigger caps = more Bedrock tokens per run = more $$$ and slower runs.
 *   - Smaller caps = cheaper but risks truncated/incomplete analysis.
 */

/**
 * Knowledge doc categories produced per repo. Drives the doc-write budget:
 * the seven top-level docs (overview, architecture, setup-guide, conventions,
 * plus one each for modules/apis/data-models/workflows — each may have
 * multiple files under it). Used as a baseline to compute step budgets.
 */
export const KNOWLEDGE_DOCS = {
  /** Fixed top-level docs: overview, architecture, setup-guide, conventions. */
  fixedDocs: 4,

  /**
   * Expected max grouped docs (modules/<name>.md, apis/<group>.md,
   * data-models/<name>.md, workflows/<name>.md). For a small C#/ASP.NET
   * microservice we'd expect ~8-12 grouped docs total across all categories.
   */
  maxGroupedDocs: 12,
} as const;

export const AGENT_LIMITS = {
  /**
   * Baseline steps consumed before the agent starts reading files: initial
   * listRepoFiles calls, re-reads of the tree after writing docs, etc.
   */
  baselineSteps: 5,

  // --- Full analysis --------------------------------------------------------

  /**
   * Fraction of the repo's files that the agent is expected to actually read
   * during a full analysis. For small microservices most source files are
   * meaningful; for larger repos the agent samples and relies on file names.
   */
  fullAnalysisReadFraction: 0.5,

  /**
   * Absolute ceiling on steps for a full analysis, regardless of repo size.
   * Protects against runaway cost if a repo is huge or the discovery loop
   * misbehaves. 120 steps ≈ several minutes of Bedrock work.
   */
  fullAnalysisMaxSteps: 120,

  /**
   * Floor for full analysis — even an almost-empty repo should get enough
   * budget to produce the baseline doc set.
   */
  fullAnalysisMinSteps: 40,

  // --- Incremental analysis -------------------------------------------------

  /**
   * Absolute ceiling on steps for an incremental run. An MR touching dozens
   * of files should still bound its Bedrock cost; anything bigger is usually
   * a refactor that should trigger a fresh full analysis manually.
   */
  incrementalAnalysisMaxSteps: 40,

  /**
   * Floor for incremental — even a single-file MR needs room to read the
   * file, re-read the affected doc for context, and write the update.
   */
  incrementalAnalysisMinSteps: 8,

  // --- File tooling ---------------------------------------------------------

  /** Max files returned from listRepoFiles in one call. */
  maxFilesListed: 200,

  /** Default traversal depth for listRepoFiles. */
  defaultListDepth: 3,

  /** Character cutoff for readFile before we truncate. Keeps huge generated
   *  files (lockfiles, bundled output) from blowing the context window. */
  maxFileChars: 20_000,
} as const;

export type AnalysisMode = "full" | "incremental";

/**
 * Compute the agent step budget dynamically.
 *
 * For full:        baseline + (totalFiles × readFraction) + allDocs
 * For incremental: baseline + changedFiles + guessed doc updates
 *
 * Both are clamped to [min, max] so runaway values never escape.
 */
export function getAnalysisMaxSteps(
  mode: AnalysisMode,
  context: { totalFiles?: number; changedFiles?: number } = {},
): number {
  const { baselineSteps } = AGENT_LIMITS;
  const docsBudget = KNOWLEDGE_DOCS.fixedDocs + KNOWLEDGE_DOCS.maxGroupedDocs;

  if (mode === "full") {
    const totalFiles = context.totalFiles ?? 0;
    const readBudget = Math.ceil(
      totalFiles * AGENT_LIMITS.fullAnalysisReadFraction,
    );
    const dynamic = baselineSteps + readBudget + docsBudget;
    return clamp(
      dynamic,
      AGENT_LIMITS.fullAnalysisMinSteps,
      AGENT_LIMITS.fullAnalysisMaxSteps,
    );
  }

  // incremental: one read per changed file, plus at most a handful of doc
  // writes (the MR usually affects 1-3 docs, rarely more).
  const changedFiles = context.changedFiles ?? 0;
  const docWriteBudget = Math.min(
    KNOWLEDGE_DOCS.fixedDocs + KNOWLEDGE_DOCS.maxGroupedDocs,
    Math.max(2, Math.ceil(changedFiles / 3)),
  );
  const dynamic = baselineSteps + changedFiles + docWriteBudget;
  return clamp(
    dynamic,
    AGENT_LIMITS.incrementalAnalysisMinSteps,
    AGENT_LIMITS.incrementalAnalysisMaxSteps,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const RETRIEVAL = {
  /** Top-k chunks the chat agent pulls from the Bedrock KB per query. */
  chatTopK: 5,
} as const;

export const WORKER = {
  /** SQS long-poll wait time — max 20s per AWS. */
  sqsWaitTimeSeconds: 20,

  /** How many messages to grab per receive. Keep at 1 so each task processes
   *  exactly one repo analysis (simpler ownership, easier retry semantics). */
  sqsMaxMessages: 1,

  /** Must exceed the longest expected analysis run. 15 min matches sqs.tf. */
  sqsVisibilityTimeoutSeconds: 15 * 60,

  /** Sleep between polls when the queue is empty. */
  pollIntervalMs: 5_000,

  /** Hard cap on the git clone step so a hung network doesn't stall the task. */
  gitCloneTimeoutMs: 2 * 60_000,
} as const;

/**
 * S3 layout under the per-repo prefix:
 *   knowledge/<repoId>/<docsPrefix>/overview.md        ← agent-written summaries
 *   knowledge/<repoId>/<sourcePrefix>/Controllers/X.cs ← raw source mirrored from git
 *
 * Bedrock KB ingests the whole `knowledge/<repoId>/` prefix so both trees
 * feed into retrieval. The split just makes S3 browsable.
 */
export const KB_LAYOUT = {
  docsPrefix: "docs",
  sourcePrefix: "source",
} as const;

/**
 * Source-file ingestion into the Bedrock Knowledge Base. These are pure S3
 * uploads (no LLM involved) so the main concerns are size, binariness, and
 * upload parallelism.
 */
export const SOURCE_INGEST = {
  /** Hard cap per file. Bedrock KB allows up to 50 MB text, but anything
   *  above this on a source repo is almost certainly a checked-in artifact. */
  maxFileBytes: 10 * 1024 * 1024,

  /** How many S3 PutObjects to run in parallel per analysis. */
  uploadConcurrency: 16,

  /** Number of bytes to sniff for a null byte before deciding a file is
   *  binary. Catches images/binaries that slipped past the extension filter. */
  binarySniffBytes: 4096,
} as const;

export const UI = {
  /** Max knowledge-source chips rendered inline in a chat message. */
  maxInlineSources: 3,

  /** Character cutoff when auto-titling a conversation from the first message. */
  conversationTitleMaxChars: 50,
} as const;
