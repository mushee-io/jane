import { JaneMediaService, type MediaRequest } from "../src/media/service.js";

export const config = { maxDuration: 60 };

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (request.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    try {
      const body = await request.json() as MediaRequest;
      if (!body?.modality || !body?.operation) {
        return Response.json({ error: "MODALITY_AND_OPERATION_REQUIRED" }, { status: 400 });
      }
      const media = new JaneMediaService();
      const result = await media.generate(body);
      return Response.json(result, {
        headers: {
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST,OPTIONS",
          "access-control-allow-headers": "content-type"
        }
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "MEDIA_GENERATION_FAILED" },
        { status: 502, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } }
      );
    }
  }
};
