import { JaneMediaService } from "../src/media/service.js";

export const config = { maxDuration: 30 };

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (request.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    try {
      const body = await request.json() as { model?: string; requestId?: string };
      if (!body.model || !body.requestId) {
        return Response.json({ error: "MODEL_AND_REQUEST_ID_REQUIRED" }, { status: 400 });
      }

      const media = new JaneMediaService();
      const result = await media.status(body.model, body.requestId);
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
        { error: error instanceof Error ? error.message : "MEDIA_STATUS_FAILED" },
        { status: 502, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } }
      );
    }
  }
};
