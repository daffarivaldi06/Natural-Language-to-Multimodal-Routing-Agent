import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { config } from "../config";
import { geocodeTool } from "./tools/geocode.tool";
import { transitRouteTool } from "./tools/transitRoute.tool";
import { transitConnectionsTool } from "./tools/transitConnections.tool";
import { bikeAvailabilityTool } from "./tools/bikeAvailability.tool";
import { SYSTEM_PROMPT } from "./prompts/systemPrompt";

const tools = [geocodeTool, transitConnectionsTool, transitRouteTool, bikeAvailabilityTool];

// Lazily initialized agent
let agent: ReturnType<typeof createReactAgent> | null = null;

/**
 * Rate limiter: enforces max 10 RPM (< 15 free-tier limit for gemini-2.0-flash-lite).
 * Uses a sliding window of 60 seconds.
 */
class RpmLimiter {
  private timestamps: number[] = [];
  private readonly maxRpm: number;

  constructor(maxRpm: number) {
    this.maxRpm = maxRpm;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const windowStart = now - 60_000; // 60-second sliding window

    // Drop timestamps older than the window
    this.timestamps = this.timestamps.filter((t) => t > windowStart);

    if (this.timestamps.length >= this.maxRpm) {
      // Calculate wait time until the oldest request leaves the window
      const oldestInWindow = this.timestamps[0];
      const waitMs = oldestInWindow + 60_000 - now + 100; // +100ms buffer
      console.log(
        `[RpmLimiter] Rate limit reached (${this.maxRpm} RPM). Waiting ${waitMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    this.timestamps.push(Date.now());
  }
}

const rpmLimiter = new RpmLimiter(config.google.maxRpm); // 10 RPM

/**
 * Returns the singleton LangGraph ReAct agent, creating it on first call.
 * Uses gemini-2.0-flash-lite with native tool calling.
 */
function getAgent(): ReturnType<typeof createReactAgent> {
  if (agent) return agent;

  const llm = new ChatGoogleGenerativeAI({
    model: config.google.model,
    temperature: 0,
    apiKey: config.google.apiKey,
    maxRetries: 2,
    verbose: true, // print LLM input/output to console
  });

  agent = createReactAgent({
    llm,
    tools,
    // Inject system prompt as the first message in the state modifier
    stateModifier: new SystemMessage(SYSTEM_PROMPT),
  });

  console.log(
    `[Agent] Initialized with model: ${config.google.model} (max ${config.google.maxRpm} RPM, recursionLimit: ${config.google.maxIterations})`
  );
  return agent;
}

/**
 * Run the routing agent with RPM throttling applied.
 * Returns the final text output and all intermediate tool steps.
 */
export async function runRoutingAgent(query: string): Promise<{
  output: string;
  intermediateSteps: unknown[];
}> {
  // Enforce rate limit BEFORE calling the LLM
  await rpmLimiter.throttle();

  const reactAgent = getAgent();

  // Safeguard: recursionLimit = maxIterations * 2 because LangGraph counts
  // each tool-call round-trip as 2 steps (tool call + tool response).
  // With 4 legs + geocoding, we need at minimum 10+ steps.
  const result = await reactAgent.invoke(
    { messages: [new HumanMessage(query)] },
    { recursionLimit: config.google.maxIterations }
  );

  // Extract the last AI message as the final output
  const messages = result.messages as Array<{
    _getType?: () => string;
    content: unknown;
  }>;

  const aiMessages = messages.filter(
    (m) => m._getType?.() === "ai" || (m as { role?: string }).role === "assistant"
  );
  const lastAiMessage = aiMessages[aiMessages.length - 1];
  const output =
    typeof lastAiMessage?.content === "string"
      ? lastAiMessage.content
      : JSON.stringify(lastAiMessage?.content ?? "No response generated");

  return {
    output,
    intermediateSteps: messages,
  };
}
