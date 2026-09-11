import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import JSZip from "jszip";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GHIGHAIS BRAIN | Smart Merge Code Workspace" },
      {
        name: "description",
        content:
          "Build projects from pasted code, smart-patch files inside a ZIP, preview live and export a ready-to-ship archive.",
      },
      { property: "og:title", content: "GHIGHAIS BRAIN | Smart Merge" },
      {
        property: "og:description",
        content:
          "Paste full project code or patch files inside an uploaded ZIP, preview instantly, download the result.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type FileMap = Record<string, string>;

const FILE_HEADER = /^\s*(?:\/\/|#|<!--)?\s*([\w.\-/]+\.[a-zA-Z0-9]+)\s*:\s*(?:-->)?\s*$/;

function parseMultiFile(text: string): FileMap {
  const lines = text.split(/\r?\n/);
  const out: FileMap = {};
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current) out[current] = buffer.join("\n").replace(/^\s*```[\w]*\s*\n?/, "").replace(/\n?```\s*$/, "").trim() + "\n";
    buffer = [];
  };

  for (const line of lines) {
    const m = line.match(FILE_HEADER);
    if (m) {
      flush();
      current = m[1];
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return out;
}

function buildPreview(files: FileMap): string {
  const entryName =
    Object.keys(files).find((n) => n.toLowerCase().endsWith("index.html")) ??
    Object.keys(files).find((n) => n.toLowerCase().endsWith(".html"));
  if (!entryName) return "";
  let html = files[entryName];

  html = html.replace(
    /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi,
    (full, href: string) => {
      const key = Object.keys(files).find((n) => n.endsWith(href.replace(/^\.?\//, "")));
      return key ? `<style>\n${files[key]}\n</style>` : full;
    },
  );
  html = html.replace(
    /<script[^>]+src=["']([^"']+\.js)["'][^>]*>\s*<\/script>/gi,
    (full, src: string) => {
      const key = Object.keys(files).find((n) => n.endsWith(src.replace(/^\.?\//, "")));
      return key ? `<script>\n${files[key]}\n</script>` : full;
    },
  );
  return html;
}

function Index() {
  const [tab, setTab] = useState<"build" | "patch">("build");
  const [fullCode, setFullCode] = useState("");
  const [patchCode, setPatchCode] = useState("");
  const [projectName, setProjectName] = useState("ghighais-project");
  const [files, setFiles] = useState<FileMap>({});
  const [logs, setLogs] = useState<{ text: string; kind: "info" | "success" | "error" }[]>([
    { text: "> GHIGHAIS BRAIN Ready.", kind: "success" },
  ]);
  const zipInput = useRef<HTMLInputElement>(null);

  const log = (text: string, kind: "info" | "success" | "error" = "info") =>
    setLogs((l) => [...l, { text: `> ${text}`, kind }]);

  const fileNames = Object.keys(files);
  const preview = useMemo(() => buildPreview(files), [files]);

  const generate = () => {
    if (!fullCode.trim()) return log("Nothing to generate — paste project code first.", "error");
    let parsed = parseMultiFile(fullCode);
    if (Object.keys(parsed).length === 0) parsed = { "index.html": fullCode };
    setFiles(parsed);
    log(`Generated ${Object.keys(parsed).length} file(s): ${Object.keys(parsed).join(", ")}`, "success");
  };

  const loadZip = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);
      const next: FileMap = {};
      const entries = Object.values(zip.files).filter((f) => !f.dir);
      for (const entry of entries) next[entry.name] = await entry.async("string");
      setFiles(next);
      setProjectName(file.name.replace(/\.zip$/i, "") || projectName);
      log(`Loaded ${Object.keys(next).length} file(s) from ${file.name}`, "success");
    } catch {
      log("Could not read that ZIP file.", "error");
    }
  };

  const applyPatch = () => {
    const patches = parseMultiFile(patchCode);
    const names = Object.keys(patches);
    if (names.length === 0)
      return log("No file paths found. Use `path/to/file.ext:` before each block.", "error");
    const next = { ...files };
    const updated: string[] = [];
    const added: string[] = [];
    for (const name of names) {
      const match =
        Object.keys(next).find((n) => n === name) ??
        Object.keys(next).find((n) => n.endsWith("/" + name) || n.split("/").pop() === name.split("/").pop());
      if (match) {
        next[match] = patches[name];
        updated.push(match);
      } else {
        next[name] = patches[name];
        added.push(name);
      }
    }
    setFiles(next);
    if (updated.length) log(`Updated: ${updated.join(", ")}`, "success");
    if (added.length) log(`Added: ${added.join(", ")}`, "info");
  };

  const download = async () => {
    if (fileNames.length === 0) return log("Nothing to export yet.", "error");
    const zip = new JSZip();
    for (const [name, content] of Object.entries(files)) zip.file(name, content);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName || "project"}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    log(`Exported ${projectName || "project"}.zip (${fileNames.length} files)`, "success");
  };

  const tabClass = (active: boolean) =>
    `flex-1 px-4 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${
      active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"
    }`;

  const field =
    "w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <header className="relative border-b-2 border-primary pb-4 text-center">
        <h1 className="text-glow text-2xl font-bold tracking-[0.2em] text-primary md:text-3xl">
          GHIGHAIS BRAIN
        </h1>
        <p className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">Smart Merge Edition</p>
        <span className="absolute right-0 top-0 rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
          v2
        </span>
      </header>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex border-b border-border">
            <button className={tabClass(tab === "build")} onClick={() => setTab("build")}>
              🏗️ Build New
            </button>
            <button className={tabClass(tab === "patch")} onClick={() => setTab("patch")}>
              🔧 Smart Patch
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {tab === "build" ? (
              <>
                <label className="block text-xs uppercase tracking-widest text-muted-foreground">
                  Paste full project code
                </label>
                <textarea
                  value={fullCode}
                  onChange={(e) => setFullCode(e.target.value)}
                  spellCheck={false}
                  placeholder={"index.html:\n<!DOCTYPE html> ...\n\nstyle.css:\nbody { }"}
                  className={`${field} h-56 resize-y font-mono`}
                />
                <button
                  onClick={generate}
                  className="w-full rounded-md border border-primary px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-[0_0_15px_var(--primary)]"
                >
                  ⚡ Generate Project
                </button>
              </>
            ) : (
              <>
                <label className="block text-xs uppercase tracking-widest text-muted-foreground">
                  1. Upload project ZIP
                </label>
                <input
                  ref={zipInput}
                  type="file"
                  accept=".zip"
                  onChange={(e) => e.target.files?.[0] && loadZip(e.target.files[0])}
                  className={`${field} file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground`}
                />
                <label className="block pt-2 text-xs uppercase tracking-widest text-muted-foreground">
                  2. Paste fixed code (multiple files supported)
                </label>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Format: <span className="text-primary">path/to/file.ext:</span> then the code. Matching
                  files in the ZIP are replaced automatically.
                </p>
                <textarea
                  value={patchCode}
                  onChange={(e) => setPatchCode(e.target.value)}
                  spellCheck={false}
                  placeholder={"src/app.js:\nconsole.log('fixed')"}
                  className={`${field} h-48 resize-y font-mono`}
                />
                <button
                  onClick={applyPatch}
                  className="w-full rounded-md border border-primary px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-[0_0_15px_var(--primary)]"
                >
                  🧠 Apply Smart Patch
                </button>
              </>
            )}
          </div>

          <div className="space-y-2 border-t border-border p-4">
            <label className="block text-xs uppercase tracking-widest text-muted-foreground">Export</label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="project name"
              className={field}
            />
            <button
              onClick={download}
              className="w-full rounded-md border border-accent px-4 py-3 text-sm font-bold uppercase tracking-widest text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              📥 Download .zip
            </button>
          </div>
        </section>

        <section className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 text-xs uppercase tracking-widest">
            <span className="text-primary">Live Preview</span>
            <span className="text-muted-foreground">{fileNames.length} files</span>
          </div>
          {preview ? (
            <iframe
              title="Live preview"
              srcDoc={preview}
              sandbox="allow-scripts allow-modals allow-forms"
              className="flex-1 bg-white"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              No HTML entry file yet. Generate a project or upload a ZIP to see it here.
            </div>
          )}
          {fileNames.length > 0 && (
            <ul className="scrollbar-thin-dark max-h-28 overflow-y-auto border-t border-border p-3 text-xs text-muted-foreground">
              {fileNames.map((n) => (
                <li key={n} className="truncate">
                  · {n}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="scrollbar-thin-dark mt-5 h-28 overflow-y-auto rounded-lg border border-border bg-background p-3 text-xs">
        {logs.map((l, i) => (
          <p
            key={i}
            className={
              l.kind === "success"
                ? "text-primary"
                : l.kind === "error"
                  ? "text-destructive"
                  : "text-accent"
            }
          >
            {l.text}
          </p>
        ))}
      </div>
    </main>
  );
}
