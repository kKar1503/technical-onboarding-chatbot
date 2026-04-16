import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { analysisModel } from "~/lib/aws/bedrock";
import { uploadKnowledgeDoc } from "~/lib/aws/s3";
import { z } from "zod";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ANALYSIS_INSTRUCTIONS = `You are a senior software engineer tasked with creating comprehensive documentation for a code repository. Your goal is to produce knowledge documents that will help both engineers and non-technical team members understand the repository.

For each document you write, include TWO sections:
1. **Technical Summary** — Detailed technical information with file paths, function names, patterns, and implementation details.
2. **Business Summary** — Plain language explanation of what this component does, why it exists, and what business value it provides.

When analyzing a repository:
1. First, list the repository structure to understand the overall layout
2. Read key files (README, package.json, config files) to understand the tech stack
3. Systematically analyze each major module/directory
4. Document APIs, data models, workflows, and conventions
5. Write each knowledge document using the writeKnowledgeDoc tool

Be thorough but concise. Focus on information that would help someone new to the codebase become productive quickly.`;

export function createAnalysisAgent(repoPath: string, repoId: string) {
  return new ToolLoopAgent({
    model: analysisModel,
    instructions: ANALYSIS_INSTRUCTIONS,
    stopWhen: stepCountIs(100),
    // Cache the system prompt + tool defs. Within one analysis run the
    // tool loop reuses these every step, so cache reads dominate writes.
    providerOptions: {
      bedrock: { cachePoint: { type: "default" } },
    },
    tools: {
      listRepoFiles: tool({
        description:
          "List files and directories in the repository. Returns a tree of file paths relative to the repo root. Excludes node_modules, .git, build artifacts, and other non-essential files.",
        inputSchema: z.object({
          directory: z
            .string()
            .default(".")
            .describe(
              "Directory to list relative to repo root. Use '.' for root.",
            ),
          maxDepth: z
            .number()
            .default(3)
            .describe("Maximum depth of directory traversal"),
        }),
        execute: async ({ directory, maxDepth }) => {
          const fullPath = join(repoPath, directory);
          const files: string[] = [];

          const IGNORE = new Set([
            "node_modules",
            ".git",
            "dist",
            "build",
            ".next",
            "__pycache__",
            ".cache",
            "coverage",
            ".idea",
            ".vscode",
            "vendor",
            "target",
          ]);

          function walk(dir: string, depth: number) {
            if (depth > maxDepth) return;
            try {
              const entries = readdirSync(dir);
              for (const entry of entries) {
                if (IGNORE.has(entry) || entry.startsWith(".")) continue;
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
          return { files: files.slice(0, 500) };
        },
      }),

      readFile: tool({
        description:
          "Read the contents of a specific file from the repository. Use this to understand implementation details.",
        inputSchema: z.object({
          filePath: z
            .string()
            .describe("File path relative to the repository root"),
        }),
        execute: async ({ filePath }) => {
          try {
            const fullPath = join(repoPath, filePath);
            const content = readFileSync(fullPath, "utf-8");
            // Truncate very large files
            if (content.length > 50000) {
              return {
                content: content.slice(0, 50000),
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
        description:
          "Write a knowledge document to S3. Use this after analyzing a module, API, data model, or other aspect of the repository. Each document should contain both a Technical Summary and a Business Summary section.",
        inputSchema: z.object({
          path: z
            .string()
            .describe(
              "Document path within the knowledge base (e.g., 'overview.md', 'modules/auth.md', 'apis/users-api.md')",
            ),
          content: z
            .string()
            .describe(
              "Full markdown content of the knowledge document, including Technical Summary and Business Summary sections",
            ),
        }),
        execute: async ({ path, content }) => {
          await uploadKnowledgeDoc(repoId, path, content);
          return { success: true, path };
        },
      }),
    },
  });
}
