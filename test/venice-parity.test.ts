import test from "node:test";
import assert from "node:assert/strict";
import { janeRequestSchema } from "../src/ai/schemas.js";
import { toJaneRequest } from "../src/openai/compat.js";
import { JaneDocumentService } from "../src/documents/service.js";
import { JaneAIService } from "../src/ai/service.js";
import { JaneResearchService } from "../src/research/service.js";
import { JaneMediaService } from "../src/media/service.js";
import { JaneAgenticService } from "../src/agents/orchestrator.js";

test("vision attachments and sampling controls validate", () => {
  const parsed = janeRequestSchema.parse({
    mode: "vision",
    messages: [{ role: "user", content: "What is in this image?" }],
    attachments: [{
      type: "image_base64",
      data: "aGVsbG8=",
      mediaType: "image/png",
      detail: "high"
    }],
    generation: { temperature: 0.2, topP: 0.9, maxOutputTokens: 500 }
  });
  assert.equal(parsed.attachments?.[0]?.type, "image_base64");
  assert.equal(parsed.generation?.topP, 0.9);
});

test("OpenAI-compatible vision request becomes Jane attachment", () => {
  const request = toJaneRequest({
    model: "jane-vision",
    stream: false,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Describe it" },
        { type: "image_url", image_url: { url: "https://example.com/image.png", detail: "low" } }
      ]
    }],
    temperature: 0.4,
    top_p: 0.8
  });
  assert.equal(request.messages[0]?.content, "Describe it");
  assert.equal(request.attachments?.[0]?.url, "https://example.com/image.png");
  assert.equal(request.generation?.temperature, 0.4);
});

test("document service extracts text documents without a provider", async () => {
  const service = new JaneDocumentService();
  const result = await service.extract({
    filename: "notes.md",
    mimeType: "text/markdown",
    dataBase64: Buffer.from("# Jane\nPrivate routing").toString("base64")
  });
  assert.match(result.text, /Private routing/);
  assert.equal(result.format, "md");
});

test("agentic planner chooses research then synthesis for current-info work", () => {
  const agentic = new JaneAgenticService(
    new JaneAIService(),
    new JaneResearchService(),
    new JaneMediaService()
  );
  const steps = agentic.plan({
    mode: "auto",
    messages: [{ role: "user", content: "Research the latest AI routing news on the web" }],
    allowWeb: true
  });
  assert.equal(steps[0]?.tool, "web_search");
  assert.equal(steps.at(-1)?.tool, "chat");
});
