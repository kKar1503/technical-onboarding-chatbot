import { openSync, readdirSync, readSync, closeSync, statSync } from "fs";
import { join, relative, basename, extname } from "path";
import { SOURCE_INGEST } from "~/lib/config";

/**
 * Directory names that should never be walked — build artifacts, dependency
 * caches, IDE folders, version control. Shared between the analysis agent's
 * listRepoFiles tool, the full-analysis file counter, and the source uploader
 * so the three stay consistent.
 */
export const IGNORED_DIRECTORIES = new Set([
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
  ".vs",
  "vendor",
  "target",
  "bin",
  "obj",
  "packages", // NuGet local cache
  "TestResults",
]);

/**
 * Extensions we'll upload as source. Allow-list keeps binaries and generated
 * blobs out by default. Files with no extension are checked against
 * ALLOWED_FILENAMES below.
 */
const ALLOWED_EXTENSIONS = new Set([
  // .NET / C#
  ".cs",
  ".csproj",
  ".sln",
  ".fs",
  ".fsproj",
  ".vb",
  ".xaml",
  ".razor",
  ".cshtml",
  // JS/TS
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  // Other mainstream languages
  ".py",
  ".go",
  ".java",
  ".kt",
  ".rs",
  ".rb",
  ".php",
  ".swift",
  ".scala",
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".hpp",
  // Docs, config, IaC
  ".md",
  ".mdx",
  ".txt",
  ".yaml",
  ".yml",
  ".json",
  ".xml",
  ".config",
  ".toml",
  ".ini",
  ".env.example",
  ".tf",
  ".tfvars",
  // Web
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  // Other
  ".sql",
  ".sh",
  ".bash",
  ".ps1",
  ".proto",
  ".graphql",
  ".gql",
]);

/** Files we want even though they have no extension. */
const ALLOWED_FILENAMES = new Set([
  "Dockerfile",
  "Makefile",
  "Procfile",
  "README",
  "LICENSE",
  "CHANGELOG",
  ".dockerignore",
  ".gitignore",
  ".editorconfig",
]);

/**
 * Filename patterns to always skip even if the extension is allowed.
 * Generated code, bundled/minified JS, lockfiles, snapshots.
 */
const DENY_FILENAME_PATTERNS: RegExp[] = [
  /\.designer\.cs$/i,
  /\.g\.cs$/i,
  /\.g\.i\.cs$/i,
  /\.min\.(js|css)$/i,
  /\.bundle\.(js|css)$/i,
  /\.map$/i,
  /\.snap$/i,
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-lock\.yaml$/i,
  /composer\.lock$/i,
  /Gemfile\.lock$/i,
  /Cargo\.lock$/i,
  /\.lock$/i,
];

/** Returns true if the file at this path, with this size, should be uploaded. */
export function isEligibleSourceFile(
  relPath: string,
  size: number,
  absPath?: string,
): boolean {
  if (size <= 0) return false;
  if (size > SOURCE_INGEST.maxFileBytes) return false;

  const name = basename(relPath);
  if (DENY_FILENAME_PATTERNS.some((re) => re.test(name))) return false;

  if (ALLOWED_FILENAMES.has(name)) {
    return absPath ? !isBinary(absPath) : true;
  }

  const ext = extname(name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;

  return absPath ? !isBinary(absPath) : true;
}

/**
 * Reads the first few KB of a file and treats any null byte as evidence
 * that the file is binary. Cheap catch-all on top of the extension list.
 */
function isBinary(absPath: string): boolean {
  const fd = openSync(absPath, "r");
  try {
    const buf = Buffer.alloc(SOURCE_INGEST.binarySniffBytes);
    const bytesRead = readSync(fd, buf, 0, buf.length, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } catch {
    return true; // can't read → safer to skip
  } finally {
    closeSync(fd);
  }
}

export interface SourceFile {
  absPath: string;
  relPath: string;
  size: number;
}

/** Walks the repo and yields files eligible for source-ingest upload. */
export function collectSourceFiles(repoPath: string): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry)) continue;
      // Skip dotfiles except the ones we explicitly allow
      if (entry.startsWith(".") && !ALLOWED_FILENAMES.has(entry)) continue;

      const absPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(absPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(absPath);
        continue;
      }

      const relPath = relative(repoPath, absPath);
      if (isEligibleSourceFile(relPath, stat.size, absPath)) {
        out.push({ absPath, relPath, size: stat.size });
      }
    }
  };
  walk(repoPath);
  return out;
}

/** Total number of files under the repo that the ignore rules would keep. */
export function countAnalyzableFiles(repoPath: string): number {
  let count = 0;
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry) || entry.startsWith(".")) continue;
      const p = join(dir, entry);
      try {
        const s = statSync(p);
        if (s.isDirectory()) walk(p);
        else count++;
      } catch {
        // skip
      }
    }
  };
  walk(repoPath);
  return count;
}

/** MIME content type for an S3 upload. Conservative — text/plain for unknowns. */
export function contentTypeFor(relPath: string): string {
  const ext = extname(relPath).toLowerCase();
  switch (ext) {
    case ".md":
    case ".mdx":
      return "text/markdown";
    case ".json":
      return "application/json";
    case ".xml":
    case ".csproj":
    case ".config":
      return "application/xml";
    case ".yaml":
    case ".yml":
      return "application/yaml";
    case ".html":
    case ".htm":
      return "text/html";
    case ".css":
    case ".scss":
    case ".sass":
    case ".less":
      return "text/css";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "application/javascript";
    case ".ts":
    case ".tsx":
      return "application/typescript";
    case ".cs":
      return "text/x-csharp";
    default:
      return "text/plain";
  }
}
