const API = "https://api.github.com";

type Files = Record<string, string>;

async function gh(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : {};
}

export async function pushToGithub(opts: {
  token: string;
  repo: string;
  files: Files;
  message?: string;
  onLog?: (msg: string) => void;
}) {
  const { token, files, onLog } = opts;
  const log = (m: string) => onLog?.(m);

  const me = await gh(token, "/user");
  const owner: string = me.login;
  const repoName = opts.repo.includes("/") ? opts.repo.split("/")[1]! : opts.repo;
  log(`Authenticated as ${owner}`);

  let repo: { default_branch: string };
  try {
    repo = await gh(token, `/repos/${owner}/${repoName}`);
    log(`Using existing repo ${owner}/${repoName}`);
  } catch {
    repo = await gh(token, "/user/repos", {
      method: "POST",
      body: JSON.stringify({ name: repoName, private: true, auto_init: true }),
    });
    log(`Created repo ${owner}/${repoName}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  const branch = repo.default_branch || "main";

  let baseCommitSha: string | undefined;
  let baseTreeSha: string | undefined;
  try {
    const ref = await gh(token, `/repos/${owner}/${repoName}/git/ref/heads/${branch}`);
    baseCommitSha = ref.object.sha;
    const commit = await gh(token, `/repos/${owner}/${repoName}/git/commits/${baseCommitSha}`);
    baseTreeSha = commit.tree.sha;
  } catch {
    log("Empty repository — creating first commit.");
  }

  const tree = [];
  for (const [path, content] of Object.entries(files)) {
    const blob = await gh(token, `/repos/${owner}/${repoName}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }
  log(`Uploaded ${tree.length} file(s)`);

  const newTree = await gh(token, `/repos/${owner}/${repoName}/git/trees`, {
    method: "POST",
    body: JSON.stringify(baseTreeSha ? { base_tree: baseTreeSha, tree } : { tree }),
  });

  const commit = await gh(token, `/repos/${owner}/${repoName}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: opts.message?.trim() || "Update from GHIGHAIS BRAIN",
      tree: newTree.sha,
      ...(baseCommitSha ? { parents: [baseCommitSha] } : {}),
    }),
  });

  await gh(token, `/repos/${owner}/${repoName}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  }).catch(async () => {
    await gh(token, `/repos/${owner}/${repoName}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  });

  return { url: `https://github.com/${owner}/${repoName}`, branch };
}
