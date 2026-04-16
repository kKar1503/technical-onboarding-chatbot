import { execSync } from "child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getRepo, updateRepoStatus } from "~/lib/db/repos";
import { startIngestionJob } from "~/lib/aws/bedrock-kb";
import {
  deleteSourceFile,
  uploadSourceFile,
} from "~/lib/aws/s3";
import { createAnalysisAgent } from "~/lib/agents/analysis-agent";
import { SOURCE_INGEST, WORKER } from "~/lib/config";
import {
  FULL_ANALYSIS_PROMPT,
  buildIncrementalAnalysisPrompt,
} from "~/lib/prompts";
import {
  collectSourceFiles,
  countAnalyzableFiles,
  isEligibleSourceFile,
} from "~/lib/source-ingest";
import type { ChangedFile } from "~/lib/gitlab";
import type { AnalysisJob } from "~/types";

export async function processAnalysisJob(job: AnalysisJob): Promise<void> {
  const repo = await getRepo(job.repoId);
  if (!repo) {
    console.error(`[processor] Repository ${job.repoId} not found`);
    return;
  }

  await updateRepoStatus(job.repoId, "analyzing");

  const workDir = mkdtempSync(join(tmpdir(), "onboarding-analysis-"));

  try {
    // Clone the repository
    const gitToken = process.env.GITLAB_ACCESS_TOKEN;
    const cloneUrl = repo.gitUrl.replace(
      "https://",
      `https://oauth2:${gitToken}@`,
    );

    console.log(`[processor] Cloning ${repo.name} (${repo.branch})...`);
    execSync(
      `git clone --depth 1 --branch ${repo.branch} ${cloneUrl} ${workDir}/repo`,
      { stdio: "pipe", timeout: WORKER.gitCloneTimeoutMs },
    );

    const repoPath = join(workDir, "repo");

    if (job.type === "full") {
      // Mirror all eligible source files to S3 first. The KB will ingest
      // them alongside whatever docs the agent produces, so retrieval can
      // hit real code for specific technical questions.
      const sourceStats = await uploadAllSourceFiles(repoPath, job.repoId);
      const totalFiles = countAnalyzableFiles(repoPath);
      console.log(
        `[processor] Running full analysis for ${repo.name} (${totalFiles} files in scope, ${sourceStats.uploaded} source files uploaded, ${sourceStats.skipped} skipped)...`,
      );
      const agent = createAnalysisAgent(repoPath, job.repoId, "full", {
        totalFiles,
      });

      await agent.generate({ prompt: FULL_ANALYSIS_PROMPT });
    } else {
      // Incremental analysis — scope strictly to the files the MR touched.
      console.log(
        `[processor] Running incremental analysis for ${repo.name} (MR ${job.mrIid}, ${job.changedFiles?.length ?? 0} files)...`,
      );

      if (!job.changedFiles || job.changedFiles.length === 0) {
        console.log(
          `[processor] No changed files supplied; skipping incremental run for MR ${job.mrIid}`,
        );
      } else {
        // Reconcile source mirror: uploads for add/modify, deletes for delete.
        await syncChangedSourceFiles(repoPath, job.repoId, job.changedFiles);

        const agent = createAnalysisAgent(repoPath, job.repoId, "incremental", {
          changedFiles: job.changedFiles.length,
        });
        await agent.generate({
          prompt: buildIncrementalAnalysisPrompt(
            job.mrIid ?? "unknown",
            job.changedFiles,
          ),
        });
      }
    }

    // Trigger Bedrock Knowledge Base re-ingestion
    if (repo.knowledgeBaseId && repo.dataSourceId) {
      console.log(
        `[processor] Triggering KB ingestion for ${repo.name}...`,
      );
      await startIngestionJob(repo.knowledgeBaseId, repo.dataSourceId);
    }

    await updateRepoStatus(
      job.repoId,
      "ready",
      new Date().toISOString(),
    );
  } catch (err) {
    console.error(`[processor] Analysis failed for ${repo.name}:`, err);
    await updateRepoStatus(job.repoId, "error");
    throw err;
  } finally {
    // Cleanup cloned repo
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // Cleanup failure is non-fatal
    }
  }
}

interface UploadStats {
  uploaded: number;
  skipped: number;
}

/**
 * Uploads every eligible source file to S3 with bounded concurrency. Called
 * during full analyses so the KB has the whole repo's current code to RAG
 * against.
 */
async function uploadAllSourceFiles(
  repoPath: string,
  repoId: string,
): Promise<UploadStats> {
  const files = collectSourceFiles(repoPath);
  let uploaded = 0;
  let skipped = 0;

  const queue = [...files];
  const workers = Array.from(
    { length: Math.min(SOURCE_INGEST.uploadConcurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        if (!file) break;
        try {
          await uploadSourceFile(repoId, file.relPath, file.absPath);
          uploaded++;
        } catch (err) {
          skipped++;
          console.warn(
            `[processor] Failed to upload source ${file.relPath}:`,
            err,
          );
        }
      }
    },
  );
  await Promise.all(workers);

  return { uploaded, skipped };
}

/**
 * Applies the MR's file changes to the S3 source mirror. Added/modified
 * files (that are still eligible) are re-uploaded; deleted files — and any
 * file that became ineligible (e.g. grew past the size cap) — are removed.
 */
async function syncChangedSourceFiles(
  repoPath: string,
  repoId: string,
  changed: ChangedFile[],
): Promise<void> {
  for (const change of changed) {
    if (change.changeType === "deleted") {
      try {
        await deleteSourceFile(repoId, change.path);
      } catch (err) {
        console.warn(
          `[processor] Failed to delete source ${change.path}:`,
          err,
        );
      }
      continue;
    }

    const absPath = join(repoPath, change.path);
    if (!existsSync(absPath)) continue; // Shouldn't happen but be safe.

    let size = 0;
    try {
      size = statSync(absPath).size;
    } catch {
      continue;
    }

    if (!isEligibleSourceFile(change.path, size, absPath)) {
      // File exists but the filter rejects it — make sure we're not holding
      // a stale version in S3 from before it became ineligible.
      try {
        await deleteSourceFile(repoId, change.path);
      } catch {
        // Best-effort cleanup.
      }
      continue;
    }

    try {
      await uploadSourceFile(repoId, change.path, absPath);
    } catch (err) {
      console.warn(`[processor] Failed to upload source ${change.path}:`, err);
    }
  }
}
