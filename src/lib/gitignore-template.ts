// Comprehensive .gitignore auto-attached to every generated project.
// Rule set requested by the user — keep comments (# Security etc.) intact.

export const GITIGNORE_TEMPLATE = `# Security
.env
.env.*
!.env.example
*.local
*.pem
*.key
*.crt
.firebase/
google-services.json
GoogleService-Info.plist
.aws/credentials
amplify/

# Dependencies
node_modules/

# Build Output
dist/
build/
.next/
.output/
.turbo/
.vinxi/
.tanstack/
.vercel/

# Cache
.cache/
.parcel-cache/
*.tsbuildinfo
.eslintcache
.stylelintcache

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*

# Testing
coverage/
.nyc_output/
test-results/
playwright-report/

# OS & Editor
.DS_Store
Thumbs.db
desktop.ini
.vscode/*
!.vscode/extensions.json
.idea/

# Database & Sensitive Data
*.sql
*.db
*.sqlite
`;

const SKIP_DIRS = /^(src|public|assets|components)\//i;
const KEEP_FILES = /^(readme\.md|license|\.env\.example)$/i;

/** Detect framework build-output dirs from package.json deps and merge rules. */
export function detectFrameworkRules(files: Record<string, string>): string[] {
  const extra: string[] = [];
  const pkg = files["package.json"];
  let deps = "";
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      deps = Object.keys({ ...parsed.dependencies, ...parsed.devDependencies }).join(" ");
    } catch {
      deps = pkg;
    }
  }
  const all = `${deps} ${Object.keys(files).join(" ")}`;
  if (/expo|react-native/.test(all)) extra.push(".expo/");
  if (/svelte/.test(all)) extra.push(".svelte-kit/");
  if (/astro/.test(all)) extra.push(".astro/");
  if (/electron/.test(all)) extra.push("out/");
  return extra;
}

/** Ensure a .gitignore exists in the file set; merge with an existing one if present. */
export function ensureGitignore(files: Record<string, string>): {
  files: Record<string, string>;
  added: boolean;
} {
  const key = Object.keys(files).find((n) => n === ".gitignore" || n.endsWith("/.gitignore"));
  if (!key) {
    const extra = detectFrameworkRules(files);
    const extraBlock = extra.length
      ? `\n# Framework\n${[...new Set(extra)].join("\n")}\n`
      : "";
    return {
      files: { ...files, ".gitignore": GITIGNORE_TEMPLATE + extraBlock },
      added: true,
    };
  }
  // Merge: add any missing template rules into the existing .gitignore
  const existing = files[key]!;
  const existingRules = new Set(
    existing
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );
  // Safety: never allow ignoring src/, public/, assets/, components/ or docs
  const cleaned = existing
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      if (!t || t.startsWith("#")) return true;
      return !SKIP_DIRS.test(t) && !KEEP_FILES.test(t);
    })
    .join("\n");
  const missing = GITIGNORE_TEMPLATE.split(/\r?\n/).filter(
    (l) => l.trim() && !l.startsWith("#") && !existingRules.has(l.trim()),
  );
  const merged =
    missing.length > 0 ? `${cleaned.replace(/\n+$/, "")}\n\n# GHIGHAIS auto-rules\n${missing.join("\n")}\n` : `${cleaned.replace(/\n+$/, "")}\n`;
  return { files: { ...files, [key]: merged }, added: false };
}
