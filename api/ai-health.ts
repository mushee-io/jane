import { JaneAIService } from "../src/ai/service.js";

export const config = { maxDuration: 30 };

export default {
  fetch(): Response {
    try {
      const jane = new JaneAIService();
      return Response.json(jane.health(), {
        headers: { "cache-control": "no-store", "access-control-allow-origin": "*" }
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "HEALTH_STARTUP_FAILED" },
        { status: 500, headers: { "cache-control": "no-store" } }
      );
    }
  }
};
