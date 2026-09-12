import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/api/ai/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI belum dikonfigurasi.", { status: 500 });

        let data: z.infer<typeof schema>;
        try {
          data = schema.parse(await request.json());
        } catch {
          return new Response("Permintaan tidak valid.", { status: 400 });
        }

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
            system: AI_SYSTEM_PROMPT,
            messages: [
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

          // Tarik potongan pertama di sini supaya kegagalan gateway (402/429/…)
          // menjadi status HTTP yang jelas, bukan aliran 200 yang kosong.
          const iterator = result.fullStream[Symbol.asyncIterator]();
          let firstText: string | undefined;
          for (;;) {
            const next = await iterator.next();
            if (next.done) break;
            const part = next.value as { type: string; text?: string; error?: unknown };
            if (part.type === "error") throw part.error;
            if (part.type === "text-delta" && part.text) {
              firstText = part.text;
              break;
            }
          }

          const stream = new ReadableStream<string>({
            async start(controller) {
              try {
                if (firstText) controller.enqueue(firstText);
                for (;;) {
                  const next = await iterator.next();
                  if (next.done) break;
                  const part = next.value as { type: string; text?: string; error?: unknown };
                  if (part.type === "error") {
                    console.error(part.error);
                    break;
                  }
                  if (part.type === "text-delta" && part.text) controller.enqueue(part.text);
                }
                controller.close();
              } catch (streamError) {
                console.error(streamError);
                controller.close();
              }
            },
          }).pipeThrough(new TextEncoderStream());

          return new Response(stream, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              "X-Accel-Buffering": "no",
            },
          });
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return new Response("Dibatalkan.", { status: 499 });
          const status =
            typeof error === "object" && error !== null && "statusCode" in error
              ? Number((error as { statusCode?: unknown }).statusCode)
              : undefined;
          const message = error instanceof Error ? error.message : "Permintaan AI gagal.";
          console.error(`AI gateway failed${status ? ` [${status}]` : ""}: ${message}`);
          if (status === 429) return new Response("AI sedang sibuk. Tunggu sebentar lalu coba lagi.", { status: 429 });
          if (status === 402)
            return new Response("Kredit AI workspace habis. Tambahkan kredit untuk melanjutkan generate.", { status: 402 });
          if (status === 403) return new Response(message || "AI dinonaktifkan oleh kebijakan workspace.", { status: 403 });
          if (status === 401) return new Response("Konfigurasi AI tidak valid.", { status: 401 });
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
