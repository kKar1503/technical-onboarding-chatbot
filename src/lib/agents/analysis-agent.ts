import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { analysisModel } from "~/lib/aws/bedrock";
import { uploadKnowledgeDoc } from "~/lib/aws/s3";
import { AGENT_LIMITS, getAnalysisMaxSteps, type AnalysisMode } from "~/lib/config";
import { IGNORED_DIRECTORIES } from "~/lib/source-ingest";
import {
  SYSTEM_ANALYSIS,
  TOOL_LIST_REPO_FILES,
  TOOL_LIST_REPO_FILES_DEPTH,
  TOOL_LIST_REPO_FILES_DIRECTORY,
  TOOL_READ_FILE,
  TOOL_READ_FILE_PATH,
  TOOL_WRITE_KNOWLEDGE_DOC,
  TOOL_WRITE_KNOWLEDGE_DOC_CONTENT,
  TOOL_WRITE_KNOWLEDGE_DOC_PATH,
} from "~/lib/prompts";
import { z } from "zod";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

export function createAnalysisAgent(
  repoPath: string,
  repoId: string,
  mode: AnalysisMode,
  stepContext: { totalFiles?: number; changedFiles?: number } = {},
) {
  return new ToolLoopAgent({
    model: analysisModel,
    instructions: SYSTEM_ANALYSIS,
    stopWhen: stepCountIs(getAnalysisMaxSteps(mode, stepContext)),
    // Cache the system prompt + tool defs. Within one analysis run the
    // tool loop reuses these every step, so cache reads dominate writes.
    providerOptions: {
      bedrock: { cachePoint: { type: "default" } },
    },
    tools: {
      listRepoFiles: tool({
        description: TOOL_LIST_REPO_FILES,
        inputSchema: z.object({
          directory: z
            .string()
            .default(".")
            .describe(TOOL_LIST_REPO_FILES_DIRECTORY),
          maxDepth: z
            .number()
            .default(AGENT_LIMITS.defaultListDepth)
            .describe(TOOL_LIST_REPO_FILES_DEPTH),
        }),
        execute: async ({ directory, maxDepth }) => {
          const fullPath = join(repoPath, directory);
          const files: string[] = [];

          function walk(dir: string, depth: number) {
            if (depth > maxDepth) return;
            try {
              const entries = readdirSync(dir);
              for (const entry of entries) {
                if (IGNORED_DIRECTORIES.has(entry) || entry.startsWith(".")) continue;
                const entryPath = join(dir, entry);
                const rel = relative(repoPath, entryPath);
                try {
                  const stat = statSync(entryPath);
                  if (stat.isDirectory()) {
                    files.push(`${rel}/`);
                    walk(entryPath, depth + 1);
                  } else {
                    files.push(rel);
                  }
                } catch {
                  // Skip files we can't stat
                }
              }
            } catch {
              // Skip directories we can't read
            }
          }

          walk(fullPath, 0);
          return { files: files.slice(0, AGENT_LIMITS.maxFilesListed) };
        },
      }),

      readFile: tool({
        description: TOOL_READ_FILE,
        inputSchema: z.object({
          filePath: z.string().describe(TOOL_READ_FILE_PATH),
        }),
        execute: async ({ filePath }) => {
          try {
            const fullPath = join(repoPath, filePath);
            const content = readFileSync(fullPath, "utf-8");
            if (content.length > AGENT_LIMITS.maxFileChars) {
              return {
                content: content.slice(0, AGENT_LIMITS.maxFileChars),
                truncated: true,
                totalLength: content.length,
              };
            }
            return { content, truncated: false, totalLength: content.length };
          } catch {
            return { error: `Could not read file: ${filePath}` };
          }
        },
      }),

      writeKnowledgeDoc: tool({
        description: TOOL_WRITE_KNOWLEDGE_DOC,
        inputSchema: z.object({
          path: z.string().describe(TOOL_WRITE_KNOWLEDGE_DOC_PATH),
          content: z.string().describe(TOOL_WRITE_KNOWLEDGE_DOC_CONTENT),
        }),
        execute: async ({ path, content }) => {
          await uploadKnowledgeDoc(repoId, path, content);
          return { success: true, path };
        },
      }),
    },
  });
}
