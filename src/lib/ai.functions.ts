import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  prompt: z.string().min(1).max(8000),
  mode: z.enum(["create", "fix"]).default("create"),
  context: z.string().max(60000).optional(),
});

const SYSTEM = `You are a senior web developer that outputs complete, runnable static web projects.

STRICT OUTPUT FORMAT:
- Output ONLY file blocks, nothing else. No explanations, no markdown fences.
- Each file starts on its own line with its path followed by a colon, e.g.
index.html:
- Then the full file content, then a blank line before the next path.
- Always include index.html as the entry file. Inline or link style.css / app.js as separate files when useful.
- Use plain HTML/CSS/JS (no build step) unless the user explicitly asks otherwise.
- Always return the COMPLETE content of every file you touch, never diffs or partial snippets.`;

export const generateProject = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    const userContent =
      data.mode === "fix"
        ? `Fix / improve this project according to the request.\n\nREQUEST:\n${data.prompt}\n\nCURRENT PROJECT FILES:\n${data.context ?? "(empty)"}`
        : `Create this project from scratch:\n${data.prompt}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`AI gateway failed [${res.status}]: ${body}`);
      if (res.status === 429) throw new Error("Rate limit reached, try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`AI request failed [${res.status}]`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("AI returned an empty result");
    return { text };
  });
