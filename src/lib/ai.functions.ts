import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { AI_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";

const schema = z.object({
  prompt: z.string().min(1).max(8000),
  mode: z.enum(["create", "fix"]).default("create"),
  context: z.string().max(60000).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(20)
    .default([]),
});

const SYSTEM = AI_SYSTEM_PROMPT;

export const generateProject = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    const userContent =
      data.mode === "fix"
        ? `Continue editing the same project. Preserve every existing feature unless the user explicitly asks to remove it.\n\nLATEST REQUEST:\n${data.prompt}\n\nCURRENT PROJECT FILES (authoritative):\n${data.context ?? "(empty)"}`
        : `Create this project from scratch:\n${data.prompt}`;

    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: {
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });

    try {
      const result = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        messages: [
          { role: "system", content: SYSTEM },
          ...data.history,
          { role: "user", content: userContent },
        ],
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "medium",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      const text = await result.text;
      if (!text.trim()) throw new Error("AI returned an empty result");
      return { text };
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number(error.statusCode)
          : undefined;
      const message = error instanceof Error ? error.message : "AI request failed";
      console.error(`AI gateway failed${status ? ` [${status}]` : ""}: ${message}`);
      if (status === 429) throw new Error("AI sedang sibuk. Tunggu sebentar lalu coba lagi.");
      if (status === 402) throw new Error(message || "Kredit AI habis. Tambahkan kredit untuk melanjutkan.");
      if (status === 403) throw new Error(message || "AI dinonaktifkan oleh kebijakan workspace.");
      if (status === 401) throw new Error("Konfigurasi AI tidak valid.");
      throw new Error(message);
    }
  });
