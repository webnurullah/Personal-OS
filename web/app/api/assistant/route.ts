import type Anthropic from "@anthropic-ai/sdk";
import { handle } from "@/lib/server/api";
import { MODEL, aiError, anthropic, fallback } from "@/lib/server/ai";
import { API_GUIDE } from "@/lib/server/assistant/catalog";
import { callApi } from "@/lib/server/assistant/router";
import { HttpError } from "@/lib/server/http";
import { parse, z } from "@/lib/server/validate";

// A few API calls plus the AI's thinking can take a while.
export const maxDuration = 120;

const MAX_STEPS = 15;

const Chat = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(20000) }).strict()).min(1).max(40),
}).strict();

const SYSTEM = `You are the assistant inside "POS", the user's personal life management app (tasks, calendar, goals, habits, learning, finance, health, notes, reminders, and Applications → Job Apply). You manage it for the user by calling the app's API with the call_api tool, acting as the signed-in user.

How to work:
- Do what the user asks with as few calls as needed. To change or delete something you need its id: find it first (GET the list, or GET /search?q=…). Never guess an id.
- Several independent calls (e.g. adding three tasks) can go in one turn.
- Dates are YYYY-MM-DD, times HH:MM (24h). Work out "tomorrow", "next Monday" etc. from today's date below.
- Before deleting more than one item, or anything the user did not clearly name, ask first.
- If a request is unclear, ask one short question instead of guessing.
- If a call fails, read the error, fix the input and try again once; if it still fails, tell the user why.
- For job posts: POST /jobs/analyze with the link (or pasted text), then POST /jobs with the fields it returns. To show what to learn, compare the jobs' skills with the user's skills from GET /profile.
- Reply in the user's language (English or Bangla), short and friendly. Confirm what you did with the key details (title, date, amount). Use simple Markdown lists when listing several things. Never show ids or raw JSON.

API (paths are relative to /api; ":id" etc. are placeholders; query strings go in the path):
${API_GUIDE}`;

const TOOL: Anthropic.Tool = {
  name: "call_api",
  description: "Call one endpoint of the app's API as the signed-in user. Returns the HTTP status and the JSON answer.",
  input_schema: {
    type: "object",
    properties: {
      method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
      path: { type: "string", description: "Path after /api, with the query string if any, e.g. /tasks or /events?from=2026-10-01&to=2026-10-31" },
      body: { type: "object", description: "JSON body for POST/PUT/PATCH (omit for GET/DELETE)" },
    },
    required: ["method", "path"],
  },
};

const ToolInput = z.object({ method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]), path: z.string().startsWith("/").max(500), body: z.record(z.string(), z.unknown()).optional() });

// Is the AI set up? (The Quick Add bar works either way; without a key it understands typed commands only.)
export const GET = handle(async () => ({ ai: Boolean(process.env.ANTHROPIC_API_KEY) }));

// Chat with the assistant. The browser keeps the conversation and sends it each time.
export const POST = handle(async ({ req, body, profile }) => {
  const { messages } = parse(Chat, await body());
  if (messages[messages.length - 1].role !== "user") throw new HttpError(400, "The last message must be yours.");
  const token = req.headers.get("authorization")!.slice(7).trim();
  const me = await profile();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: me.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: me.timezone, weekday: "long" }).format(new Date());

  const history: Anthropic.Beta.BetaMessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
  let changed = false;

  try {
    const client = anthropic();
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        ...fallback(),
        output_config: { effort: "low" },
        // The long, unchanging part is cached; today's date comes after it.
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: `Today is ${weekday}, ${today} (time zone ${me.timezone}). The user's name: ${me.full_name || "unknown"}. Currency: ${me.currency}.` },
        ],
        tools: [TOOL],
        messages: history,
      });

      if (response.stop_reason === "refusal") return { reply: "Sorry, I can't help with that one.", changed };
      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || !calls.length) {
        const reply = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
        return { reply: reply || (response.stop_reason === "max_tokens" ? "That answer got too long. Please ask for less at once." : "Done."), changed };
      }

      history.push({ role: "assistant", content: response.content });
      // Run the calls in order (they may depend on each other), then send all results back together.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        const input = ToolInput.safeParse(call.input);
        if (!input.success) {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Invalid call: ${input.error.message}` });
          continue;
        }
        const result = await callApi(input.data, token, req.nextUrl.origin);
        if (input.data.method !== "GET" && result.status < 400) changed = true;
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: result.status >= 400, content: JSON.stringify(result).slice(0, 30000) });
      }
      history.push({ role: "user", content: results });
    }
    return { reply: "That took too many steps. Please split it into smaller requests.", changed };
  } catch (error) {
    aiError(error);
  }
});
