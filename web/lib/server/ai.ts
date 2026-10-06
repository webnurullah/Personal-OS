// Claude (Anthropic API) for the assistant and the job analysis. Server only: the key never reaches the browser.
import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta";
import { HttpError } from "./http.ts";

export const MODEL = "claude-opus-5-5";

// If a safety check declines a request, the API retries it on the model Anthropic recommends.
export const fallback = () => ({ betas: ["server-side-fallback-2026-07-01"] as AnthropicBeta[], fallbacks: "default" as const });

let client: Anthropic | undefined;

export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, "The AI is not set up yet: add ANTHROPIC_API_KEY in Vercel → Project → Settings → Environment Variables, then redeploy.");
  }
  client ??= new Anthropic();
  return client;
}

/** Turns an Anthropic API error into a message for the user. */
export function aiError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error instanceof Anthropic.AuthenticationError) throw new HttpError(503, "The ANTHROPIC_API_KEY in Vercel is not valid.");
  if (error instanceof Anthropic.RateLimitError) throw new HttpError(429, "The AI is busy right now. Try again in a minute.");
  if (error instanceof Anthropic.APIError) throw new HttpError(502, `The AI could not answer (${error.status ?? "network"}). Try again.`);
  throw error;
}
