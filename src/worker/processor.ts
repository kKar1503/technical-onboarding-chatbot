import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getRepo, updateRepoStatus } from "~/lib/db/repos";
import { startIngestionJob } from "~/lib/aws/bedrock-kb";
import { createAnalysisAgent } from "~/lib/agents/analysis-agent";
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
      { stdio: "pipe", timeout: 120000 },
    );

    const repoPath = join(workDir, "repo");

    if (job.type === "full") {
      console.log(`[processor] Running full analysis for ${repo.name}...`);
      const agent = createAnalysisAgent(repoPath, job.repoId);

      await agent.generate({
        prompt: `Analyze the repository at the current directory and create comprehensive knowledge documents.

Start by listing the root directory structure, then read key configuration files (README, package.json, etc.) to understand the tech stack.
Then systematically analyze each major module/directory and create knowledge documents for:
1. overview.md — Repository overview, tech stack, purpose
2. architecture.md — System architecture, service boundaries, data flow
3. modules/<name>.md — One per major module/directory
4. apis/<group>.md — API endpoints (if applicable)
5. data-models/<name>.md — Database schemas (if applicable)
6. setup-guide.md — How to set up and run locally
7. conventions.md — Coding patterns and conventions

Use the writeKnowledgeDoc tool for each document.`,
      });
    } else {
      // Incremental analysis — only re-analyze affected areas
      console.log(
        `[processor] Running incremental analysis for ${repo.name} (MR ${job.mrIid})...`,
      );
      const changedDesc = job.changedFiles
        ? `Changed files: ${job.changedFiles.join(", ")}`
        : `Merge request IID: ${job.mrIid}`;

      const agent = createAnalysisAgent(repoPath, job.repoId);
      await agent.generate({
        prompt: `An incremental update is needed for this repository's knowledge base. ${changedDesc}

Analyze the affected files and update only the relevant knowledge documents. Use the listRepoFiles and readFile tools to understand what changed, then use writeKnowledgeDoc to update the affected documents.`,
      });
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
