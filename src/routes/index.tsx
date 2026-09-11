import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Bot,
  BoxSelect,
  Code2,
  Download,
  Eye,
  Github,
  Hammer,
  LoaderCircle,
  Maximize2,
  MousePointer2,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { pushToGithub } from "@/lib/github";
import { ensureGitignore } from "@/lib/gitignore-template";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GHIGHAIS BRAIN | AI App Builder" },
      {
        name: "description",
        content: "Bangun, lanjutkan, edit visual, preview, ekspor, dan push proyek web dengan AI canggih.",
      },
      { property: "og:title", content: "GHIGHAIS BRAIN | AI App Builder" },
      {
        property: "og:description",
        content: "Workspace AI berkelanjutan dengan editor visual langsung dan ekspor GitHub.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type FileMap = Record<string, string>;
type ToolTab = "build" | "patch";
type ChatLine = { id: string; role: "user" | "assistant"; content: string; files?: string[] };
type SelectedElement = { path: number[]; tag: string; label: string; width: number; height: number };
type PreviewWidth = "100%" | "390px" | "768px";

const STORAGE_KEY = "ghighais_workspace_v3";
const FILE_HEADER = /^\s*(?:\/\/|#|<!--)?\s*([\w.\-/]+\.[a-zA-Z0-9]+)\s*:\s*(?:-->)?\s*$/;

function parseMultiFile(text: string): FileMap {
  const lines = text.split(/\r?\n/);
  const out: FileMap = {};
  let current: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (!current) return;
    out[current] = `${buffer.join("\n").replace(/^\s*```[\w]*\s*\n?/, "").replace(/\n?```\s*$/, "").trim()}\n`;
    buffer = [];
  };
  for (const line of lines) {
    const match = line.match(FILE_HEADER);
    if (match?.[1]) {
      flush();
      current = match[1];
    } else if (current) buffer.push(line);
  }
  flush();
  return out;
}

function htmlEntry(files: FileMap) {
  return (
    Object.keys(files).find((name) => name.toLowerCase().endsWith("index.html")) ??
    Object.keys(files).find((name) => name.toLowerCase().endsWith(".html"))
  );
}

const EDITOR_SCRIPT = String.raw`<script data-ghighais-editor>
(() => {
  const send = (type, data = {}) => parent.postMessage({ source: 'ghighais-visual-editor', type, ...data }, '*');
  const pathFor = (el) => {
    const path = [];
    while (el && el !== document.body) {
      const parentEl = el.parentElement;
      if (!parentEl) break;
      path.unshift(Array.from(parentEl.children).indexOf(el));
      el = parentEl;
    }
    return path;
  };
  let selected = null;
  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;
  const report = () => {
    if (!selected) return;
    const rect = selected.getBoundingClientRect();
    send('selected', { path: pathFor(selected), tag: selected.tagName.toLowerCase(), label: (selected.textContent || selected.getAttribute('aria-label') || '').trim().slice(0, 44), width: Math.round(rect.width), height: Math.round(rect.height) });
  };
  document.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation();
    if (selected) selected.removeAttribute('data-gh-selected');
    selected = event.target;
    if (selected === document.documentElement || selected === document.body) return;
    selected.setAttribute('data-gh-selected', 'true');
    report();
  }, true);
  document.addEventListener('pointerdown', (event) => {
    if (!selected || event.target !== selected) return;
    const rect = selected.getBoundingClientRect();
    if (event.clientX > rect.right - 18 && event.clientY > rect.bottom - 18) return;
    dragging = true; startX = event.clientX; startY = event.clientY;
    startLeft = parseFloat(selected.style.left) || 0; startTop = parseFloat(selected.style.top) || 0;
    selected.setPointerCapture(event.pointerId);
  }, true);
  document.addEventListener('pointermove', (event) => {
    if (!dragging || !selected) return;
    selected.style.position = selected.style.position === 'absolute' || selected.style.position === 'fixed' ? selected.style.position : 'relative';
    selected.style.left = Math.round(startLeft + event.clientX - startX) + 'px';
    selected.style.top = Math.round(startTop + event.clientY - startY) + 'px';
  }, true);
  document.addEventListener('pointerup', () => { if (dragging) { dragging = false; report(); send('style', { path: pathFor(selected), style: selected.getAttribute('style') || '' }); } }, true);
  new ResizeObserver((entries) => {
    if (!selected || !entries.some((entry) => entry.target === selected)) return;
    clearTimeout(window.__ghResizeTimer);
    window.__ghResizeTimer = setTimeout(() => { report(); send('style', { path: pathFor(selected), style: selected.getAttribute('style') || '' }); }, 180);
  }).observe(document.body);
  const observer = new MutationObserver(() => { if (selected) report(); });
  observer.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['style'] });
  addEventListener('message', (event) => {
    if (event.data?.source !== 'ghighais-parent' || !selected) return;
    if (event.data.type === 'dimensions') {
      if (event.data.width) selected.style.width = Math.max(1, Number(event.data.width)) + 'px';
      if (event.data.height) selected.style.height = Math.max(1, Number(event.data.height)) + 'px';
      report(); send('style', { path: pathFor(selected), style: selected.getAttribute('style') || '' });
    }
  });
})();
</script>`;

function buildPreview(files: FileMap, editMode: boolean): string {
  const entryName = htmlEntry(files);
  if (!entryName) return "";
  const source = files[entryName];
  if (!source) return "";
  let html = source.replace(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi, (full, href: string) => {
    const key = Object.keys(files).find((name) => name.endsWith(href.replace(/^\.?\//, "")));
    return key && files[key] ? `<style>\n${files[key]}\n</style>` : full;
  });
  html = html.replace(/<script[^>]+src=["']([^"']+\.js)["'][^>]*>\s*<\/script>/gi, (full, src: string) => {
    const key = Object.keys(files).find((name) => name.endsWith(src.replace(/^\.?\//, "")));
    return key && files[key] ? `<script>\n${files[key]}\n<\/script>` : full;
  });
  if (editMode) {
    const editorCss = `<style data-ghighais-editor>[data-gh-selected="true"]{outline:2px solid #00d98b!important;outline-offset:2px!important;resize:both!important;overflow:auto!important;cursor:move!important}</style>`;
    html = html.includes("</body>")
      ? html.replace("</body>", `${editorCss}${EDITOR_SCRIPT}</body>`)
      : `${html}${editorCss}${EDITOR_SCRIPT}`;
  }
  return html;
}

function applyInlineStyle(files: FileMap, path: number[], style: string): FileMap {
  const entry = htmlEntry(files);
  const source = entry ? files[entry] : undefined;
  if (!entry || !source) return files;
  const doc = new DOMParser().parseFromString(source, "text/html");
  let element: Element = doc.body;
  for (const index of path) {
    const child = element.children.item(index);
    if (!child) return files;
    element = child;
  }
  if (style) element.setAttribute("style", style);
  else element.removeAttribute("style");
  const doctype = source.trimStart().toLowerCase().startsWith("<!doctype") ? "<!DOCTYPE html>\n" : "";
  return { ...files, [entry]: `${doctype}${doc.documentElement.outerHTML}\n` };
}

function Index() {
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const restored = useRef(false);
  const [tab, setTab] = useState<ToolTab>("build");
  const [fullCode, setFullCode] = useState("");
  const [patchCode, setPatchCode] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [streamFiles, setStreamFiles] = useState<FileMap>({});
  const [history, setHistory] = useState<ChatLine[]>([]);
  const [token, setToken] = useState("");
  const [repo, setRepo] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [pushing, setPushing] = useState(false);
  const [projectName, setProjectName] = useState("ghighais-project");
  const [files, setFiles] = useState<FileMap>({});
  const [editMode, setEditMode] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("100%");
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [logs, setLogs] = useState<{ text: string; kind: "info" | "success" | "error" }[]>([
    { text: "> GHIGHAIS BRAIN Ready.", kind: "success" },
  ]);

  const log = useCallback((text: string, kind: "info" | "success" | "error" = "info") => {
    setLogs((current) => [...current, { text: `> ${text}`, kind }]);
  }, []);
  const fileNames = Object.keys(files);
  const streaming = Object.keys(streamFiles).length > 0;
  const previewFiles = useMemo(() => (streaming ? { ...files, ...streamFiles } : files), [files, streamFiles, streaming]);
  const preview = useMemo(() => buildPreview(previewFiles, editMode && !streaming), [previewFiles, editMode, streaming]);
  const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as { files?: FileMap; history?: ChatLine[]; projectName?: string; repo?: string; previewWidth?: PreviewWidth };
        if (data.files) setFiles(data.files);
        if (data.history) setHistory(data.history);
        if (data.projectName) setProjectName(data.projectName);
        if (data.repo) setRepo(data.repo);
        if (data.previewWidth) setPreviewWidth(data.previewWidth);
      }
      const savedToken = localStorage.getItem("gh_token");
      if (savedToken) setToken(savedToken);
    } catch {
      log("Workspace lama tidak dapat dipulihkan.", "error");
    } finally {
      restored.current = true;
    }
  }, [log]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ files, history, projectName, repo, previewWidth }));
    } catch {
      log("Penyimpanan browser penuh. Unduh ZIP untuk mencadangkan proyek.", "error");
    }
  }, [files, history, projectName, repo, previewWidth, log]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.source !== "ghighais-visual-editor") return;
      if (event.data.type === "selected") {
        setSelected({
          path: Array.isArray(event.data.path) ? event.data.path : [],
          tag: String(event.data.tag ?? "element"),
          label: String(event.data.label ?? ""),
          width: Number(event.data.width) || 1,
          height: Number(event.data.height) || 1,
        });
      }
      if (event.data.type === "style" && Array.isArray(event.data.path)) {
        setFiles((current) => applyInlineStyle(current, event.data.path, String(event.data.style ?? "")));
        log("Perubahan visual disimpan ke kode.", "success");
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [log]);

  const runAi = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) return log("Tulis instruksi AI terlebih dahulu.", "error");
    const hasFiles = fileNames.length > 0;
    const userLine: ChatLine = { id: crypto.randomUUID(), role: "user", content: prompt };
    setHistory((current) => [...current, userLine]);
    setAiPrompt("");
    setAiBusy(true);
    setProgress(2);
    setStreamFiles({});
    log(hasFiles ? "AI melanjutkan proyek aktif…" : "AI membuat proyek baru…");
    let received = "";
    let progressTimer: ReturnType<typeof setInterval> | undefined;
    try {
      const context = hasFiles
        ? Object.entries(files).map(([name, content]) => `${name}:\n${content}`).join("\n\n").slice(0, 55000)
        : undefined;
      const aiHistory = history.slice(-12).map((line) => ({ role: line.role, content: line.content }));
      const requestBody = JSON.stringify({ prompt, mode: hasFiles ? "fix" : "create", context, history: aiHistory });
      progressTimer = setInterval(() => {
        setProgress((current) => (current < 28 ? current + 1 : current));
      }, 1800);

      let lastError = "Permintaan AI gagal.";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
        if (!response.ok || !response.body) {
          lastError = (await response.text()) || lastError;
          if ((response.status === 429 || response.status >= 500) && attempt < 2) {
            const retryAfter = Number(response.headers.get("Retry-After"));
            const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** attempt;
            log(`AI mencoba kembali (${attempt + 2}/3)…`);
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
          }
          throw new Error(lastError);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            received += decoder.decode(value, { stream: true });
            setProgress(Math.min(96, Math.max(30, Math.round((received.length / (received.length + 3500)) * 100))));
            const partial = parseMultiFile(received);
            if (Object.keys(partial).length > 0) setStreamFiles(partial);
          }
          received += decoder.decode();
          break;
        } catch (streamError) {
          lastError = streamError instanceof Error ? streamError.message : lastError;
          if (Object.keys(parseMultiFile(received)).length > 0) break;
          if (attempt >= 2) throw streamError;
          received = "";
          log(`Aliran terputus, AI mencoba kembali (${attempt + 2}/3)…`);
          await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt));
        }
      }

      if (!received.trim()) throw new Error(lastError);
      let parsed = parseMultiFile(received);
      if (Object.keys(parsed).length === 0) parsed = { "index.html": buffer };
      const delivered = Object.keys(parsed);
      setFiles((current) => ensureGitignore({ ...current, ...parsed }).files);
      setProgress(100);
      setHistory((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", content: `Selesai — ${delivered.length} file diperbarui. Proyek aktif tetap dipertahankan.`, files: delivered },
      ]);
      log(`AI memperbarui: ${delivered.join(", ")}`, "success");
    } catch (error) {
      const partial = parseMultiFile(received);
      if (Object.keys(partial).length > 0) {
        const delivered = Object.keys(partial);
        setFiles((current) => ensureGitignore({ ...current, ...partial }).files);
        setProgress(100);
        setHistory((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "assistant", content: `Hasil yang sudah selesai dipulihkan — ${delivered.length} file diperbarui.`, files: delivered },
        ]);
        log(`Hasil generate dipulihkan: ${delivered.join(", ")}`, "success");
        return;
      }
      const message = error instanceof Error ? error.message : "Permintaan AI gagal.";
      setHistory((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: `Gagal: ${message}` }]);
      log(message, "error");
      setProgress(0);
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setAiBusy(false);
      setStreamFiles({});
    }
  };

  const generate = () => {
    if (!fullCode.trim()) return log("Tempel kode proyek terlebih dahulu.", "error");
    let parsed = parseMultiFile(fullCode);
    if (Object.keys(parsed).length === 0) parsed = { "index.html": fullCode };
    const next = ensureGitignore(parsed);
    setFiles(next.files);
    log(`Proyek dibuat dengan ${Object.keys(next.files).length} file.`, "success");
  };

  const loadZip = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);
      const next: FileMap = {};
      for (const entry of Object.values(zip.files).filter((item) => !item.dir)) next[entry.name] = await entry.async("string");
      setFiles(ensureGitignore(next).files);
      setProjectName(file.name.replace(/\.zip$/i, "") || projectName);
      log(`${file.name} dimuat dan siap dilanjutkan.`, "success");
    } catch {
      log("ZIP tidak dapat dibaca.", "error");
    }
  };

  const applyPatch = () => {
    const patches = parseMultiFile(patchCode);
    if (!Object.keys(patches).length) return log("Tidak ada path file yang ditemukan.", "error");
    setFiles((current) => {
      const next = { ...current };
      for (const [name, content] of Object.entries(patches)) {
        const match = Object.keys(next).find((key) => key === name || key.endsWith(`/${name}`) || key.split("/").pop() === name.split("/").pop());
        next[match ?? name] = content;
      }
      return ensureGitignore(next).files;
    });
    log(`Patch diterapkan ke ${Object.keys(patches).length} file.`, "success");
  };

  const download = async () => {
    if (!fileNames.length) return log("Belum ada proyek untuk diunduh.", "error");
    const ready = ensureGitignore(files).files;
    setFiles(ready);
    const zip = new JSZip();
    for (const [name, content] of Object.entries(ready)) zip.file(name, content);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${projectName || "project"}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
    log("ZIP proyek berhasil dibuat.", "success");
  };

  const push = async () => {
    if (!fileNames.length) return log("Belum ada proyek untuk di-push.", "error");
    if (!token.trim()) return log("Masukkan token GitHub terlebih dahulu.", "error");
    const target = (repo.trim() || projectName).trim();
    if (!target) return log("Masukkan nama repository.", "error");
    setPushing(true);
    localStorage.setItem("gh_token", token.trim());
    try {
      const ready = ensureGitignore(files).files;
      setFiles(ready);
      const output = await pushToGithub({ token: token.trim(), repo: target, files: ready, message: commitMsg, onLog: log });
      log(`Berhasil push ke ${output.url} (${output.branch}).`, "success");
    } catch (error) {
      log(error instanceof Error ? error.message : "Push gagal.", "error");
    } finally {
      setPushing(false);
    }
  };

  const updateDimensions = (width: number, height: number) => {
    iframeRef.current?.contentWindow?.postMessage({ source: "ghighais-parent", type: "dimensions", width, height }, "*");
    setSelected((current) => (current ? { ...current, width, height } : current));
  };

  return (
    <main className="min-h-screen bg-background p-3 md:p-6">
      <header className="relative border-b-2 border-primary pb-4 text-center">
        <h1 className="text-glow text-2xl font-bold tracking-[0.2em] text-primary md:text-3xl">GHIGHAIS BRAIN</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">Persistent AI Studio</p>
        <span className="absolute right-0 top-0 rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">v3</span>
      </header>

      <section className="mt-4 border-b border-border pb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary"><Bot /> AI Project Brain</div>
          <span className="text-[10px] text-muted-foreground">{fileNames.length ? "Melanjutkan proyek aktif" : "Proyek baru"}</span>
        </div>
        {history.length > 0 && (
          <div className="scrollbar-thin-dark mb-3 max-h-40 space-y-2 overflow-y-auto border-l-2 border-border pl-3">
            {history.map((line) => (
              <div key={line.id} className="text-xs leading-relaxed">
                <span className={line.role === "user" ? "font-bold text-accent" : "font-bold text-primary"}>{line.role === "user" ? "YOU" : "AI"}</span>
                <span className="ml-2 text-foreground">{line.content}</span>
                {line.files?.length ? <span className="ml-2 text-muted-foreground">[{line.files.join(", ")}]</span> : null}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void runAi(); }}
            placeholder={fileNames.length ? "Instruksi berikutnya untuk proyek ini…" : "Jelaskan aplikasi yang ingin dibuat…"}
            className={`${field} min-h-20 flex-1 resize-y`}
          />
          <Button aria-label="Kirim instruksi AI" title="Kirim instruksi AI" size="icon" className="h-20 w-14 shrink-0" disabled={aiBusy} onClick={() => void runAi()}>
            {aiBusy ? <LoaderCircle className="animate-spin" /> : <Send />}
          </Button>
        </div>
        {(aiBusy || progress > 0) && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-widest">
              <span className="text-muted-foreground">
                {aiBusy ? (streaming ? "Menulis kode & menampilkan ke preview…" : "AI berpikir…") : "Generate selesai"}
              </span>
              <span className="font-bold text-primary">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </section>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.6fr)]">
        <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-2 border-b border-border">
            <Button variant={tab === "build" ? "default" : "ghost"} className="h-12 rounded-none uppercase tracking-widest" onClick={() => setTab("build")}><Hammer /> Build</Button>
            <Button variant={tab === "patch" ? "default" : "ghost"} className="h-12 rounded-none uppercase tracking-widest" onClick={() => setTab("patch")}><Code2 /> Patch</Button>
          </div>
          <div className="flex-1 space-y-3 p-4">
            {tab === "build" ? (
              <>
                <label className="block text-xs uppercase tracking-widest text-muted-foreground">Tempel kode proyek lengkap</label>
                <textarea value={fullCode} onChange={(event) => setFullCode(event.target.value)} spellCheck={false} placeholder={"index.html:\n<!DOCTYPE html> ...\n\nstyle.css:\nbody { }"} className={`${field} h-48 resize-y font-mono`} />
                <Button variant="outline" className="w-full border-primary text-primary" onClick={generate}><Hammer /> Generate Project</Button>
              </>
            ) : (
              <>
                <label className="block text-xs uppercase tracking-widest text-muted-foreground">Upload proyek ZIP</label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border p-3 text-xs text-muted-foreground hover:text-foreground">
                  <Upload /> Pilih ZIP
                  <input type="file" accept=".zip" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadZip(file); }} />
                </label>
                <label className="block pt-2 text-xs uppercase tracking-widest text-muted-foreground">Kode perbaikan</label>
                <textarea value={patchCode} onChange={(event) => setPatchCode(event.target.value)} spellCheck={false} placeholder={"src/app.js:\nconsole.log('fixed')"} className={`${field} h-40 resize-y font-mono`} />
                <Button variant="outline" className="w-full border-primary text-primary" onClick={applyPatch}><Code2 /> Apply Patch</Button>
              </>
            )}
          </div>
          <div className="space-y-2 border-t border-border p-4">
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Nama proyek" className={field} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => void download()}><Download /> ZIP</Button>
              <Button variant="outline" onClick={() => { setFiles({}); setHistory([]); setSelected(null); log("Workspace dibersihkan."); }}><Trash2 /> Reset</Button>
            </div>
          </div>
          <div className="space-y-2 border-t border-border p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"><Github /> Push to GitHub</div>
            <input value={token} onChange={(event) => setToken(event.target.value)} type="password" autoComplete="off" placeholder="GitHub personal access token" className={field} />
            <input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="Nama repository" className={field} />
            <input value={commitMsg} onChange={(event) => setCommitMsg(event.target.value)} placeholder="Pesan commit (opsional)" className={field} />
            <Button className="w-full" disabled={pushing} onClick={() => void push()}>{pushing ? <LoaderCircle className="animate-spin" /> : <Github />} {pushing ? "Pushing…" : "Push"}</Button>
            <a href="https://github.com/settings/tokens/new?scopes=repo&description=GHIGHAIS%20BRAIN" target="_blank" rel="noreferrer" className="block text-center text-[11px] text-accent underline">Buat token GitHub</a>
          </div>
        </section>

        <section className="flex min-h-[560px] flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary"><Eye /> Live Preview <span className="text-muted-foreground">{fileNames.length} files</span></div>
            <div className="flex items-center gap-1">
              {(["100%", "768px", "390px"] as PreviewWidth[]).map((width) => (
                <Button key={width} variant={previewWidth === width ? "secondary" : "ghost"} size="sm" title={`Lebar preview ${width}`} onClick={() => setPreviewWidth(width)}>{width === "100%" ? "Full" : width.replace("px", "")}</Button>
              ))}
              <Button variant={editMode ? "default" : "outline"} size="sm" onClick={() => { setEditMode((value) => !value); setSelected(null); }}>
                {editMode ? <MousePointer2 /> : <BoxSelect />} {editMode ? "Editing" : "Edit"}
              </Button>
            </div>
          </div>
          {editMode && (
            <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs">
              {selected ? (
                <>
                  <span className="max-w-48 truncate text-primary">&lt;{selected.tag}&gt; {selected.label}</span>
                  <label className="flex items-center gap-1 text-muted-foreground">W <input aria-label="Lebar elemen" type="number" min="1" value={selected.width} onChange={(event) => updateDimensions(Number(event.target.value), selected.height)} className="w-20 rounded border border-border bg-background px-2 py-1 text-foreground" /></label>
                  <label className="flex items-center gap-1 text-muted-foreground">H <input aria-label="Tinggi elemen" type="number" min="1" value={selected.height} onChange={(event) => updateDimensions(selected.width, Number(event.target.value))} className="w-20 rounded border border-border bg-background px-2 py-1 text-foreground" /></label>
                  <span className="text-muted-foreground"><Maximize2 className="mr-1 inline" />Seret elemen atau sudut kanan bawah</span>
                </>
              ) : <span className="text-muted-foreground">Klik elemen di preview untuk memilih dan mengubahnya.</span>}
            </div>
          )}
          <div className="flex flex-1 justify-center overflow-auto bg-muted/30 p-2">
            {preview ? (
              <iframe ref={iframeRef} title="Live preview" srcDoc={preview} sandbox="allow-scripts allow-modals allow-forms" style={{ width: previewWidth }} className="h-full min-h-[480px] max-w-full border-0 bg-card shadow-sm transition-[width]" />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">Tulis prompt AI, tempel kode, atau upload ZIP untuk memulai.</div>
            )}
          </div>
          {fileNames.length > 0 && <div className="scrollbar-thin-dark flex max-h-20 flex-wrap gap-x-3 gap-y-1 overflow-y-auto border-t border-border p-3 text-[11px] text-muted-foreground">{fileNames.map((name) => <span key={name}>· {name}</span>)}</div>}
        </section>
      </div>

      <div className="scrollbar-thin-dark mt-5 h-28 overflow-y-auto rounded-lg border border-border bg-background p-3 text-xs">
        {logs.map((item, index) => <p key={`${item.text}-${index}`} className={item.kind === "success" ? "text-primary" : item.kind === "error" ? "text-destructive" : "text-accent"}>{item.text}</p>)}
      </div>
    </main>
  );
}
