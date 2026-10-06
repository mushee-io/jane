import { createApiHandler } from "../src/api/handler.js";

const handle = createApiHandler();

export const config = { maxDuration: 30 };

export default {
  fetch(request: Request): Promise<Response> {
    return handle(request);
  }
};
