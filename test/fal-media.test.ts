import test from "node:test";
import assert from "node:assert/strict";
import { JaneMediaService } from "../src/media/service.js";

test("FAL_KEY enables native Jane image routes", () => {
  const original = process.env.FAL_KEY;
  process.env.FAL_KEY = "fal-test-key";
  try {
    const media = new JaneMediaService();
    const models = media.list();
    const ids = new Set(models.map((model) => model.id));

    assert.equal(ids.has("fal-flux-schnell"), true);
    assert.equal(ids.has("fal-flux-dev-edit"), true);

    const textRoute = media.choose({
      modality: "image",
      operation: "text-to-image",
      prompt: "A futuristic city"
    });
    assert.equal(textRoute.selected?.model.provider, "fal");
    assert.equal(textRoute.selected?.model.endpoint, "fal-ai/flux/schnell");

    const editRoute = media.choose({
      modality: "image",
      operation: "image-edit",
      prompt: "Make it cinematic",
      inputUrl: "https://example.com/image.jpg"
    });
    assert.equal(editRoute.selected?.model.provider, "fal");
  } finally {
    if (original === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = original;
  }
});
