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
    assert.equal(ids.has("fal-wan-27-text-video"), true);
    assert.equal(ids.has("fal-wan-27-image-video"), true);
    assert.equal(ids.has("fal-stable-audio-25"), true);
    assert.equal(ids.has("fal-elevenlabs-sfx"), true);
    assert.equal(ids.has("fal-audio-transcription"), true);
    assert.equal(ids.has("fal-kokoro-british"), true);
    assert.equal(ids.has("fal-speech-to-text"), true);
    assert.equal(ids.has("jane-voice-beta"), true);

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

    const textVideo = media.choose({
      modality: "video",
      operation: "text-to-video",
      prompt: "A cinematic drone shot over London"
    });
    assert.equal(textVideo.selected?.model.endpoint, "fal-ai/wan/v2.7/text-to-video");

    const imageVideo = media.choose({
      modality: "video",
      operation: "image-to-video",
      prompt: "Animate this image with a slow camera push",
      inputUrl: "https://example.com/frame.jpg"
    });
    assert.equal(imageVideo.selected?.model.endpoint, "fal-ai/wan/v2.7/image-to-video");

    const music = media.choose({
      modality: "audio",
      operation: "music",
      prompt: "Ambient electronic score"
    });
    assert.equal(music.selected?.model.endpoint, "fal-ai/stable-audio-25/text-to-audio");

    const sfx = media.choose({
      modality: "audio",
      operation: "sfx",
      prompt: "Rain on glass"
    });
    assert.equal(sfx.selected?.model.endpoint, "fal-ai/elevenlabs/sound-effects/v2");

    const transcription = media.choose({
      modality: "audio",
      operation: "transcription",
      inputUrl: "https://example.com/audio.mp3"
    });
    assert.equal(transcription.selected?.model.endpoint, "fal-ai/speech-to-text");

    const tts = media.choose({
      modality: "speech",
      operation: "tts",
      prompt: "Hello from Jane"
    });
    assert.equal(tts.selected?.model.endpoint, "fal-ai/kokoro/british-english");

    const voice = media.choose({
      modality: "speech",
      operation: "speech-to-speech",
      inputBase64: "data:audio/webm;base64,AAAA"
    });
    assert.equal(voice.selected?.model.id, "jane-voice-beta");
  } finally {
    if (original === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = original;
  }
});
