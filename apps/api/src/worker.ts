import {
  createD1ApiApp,
  type D1ApiBindings,
} from "./composition/d1";

const worker = {
  async fetch(
    request: Request,
    bindings: D1ApiBindings,
    _executionContext?: unknown,
  ): Promise<Response> {
    const app = await createD1ApiApp(bindings);
    return app.fetch(request, bindings);
  },
};

export default worker;
