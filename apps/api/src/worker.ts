import {
  createD1ApiApp,
  type D1ApiBindings,
} from "./composition/d1";

const worker = {
  fetch(
    request: Request,
    bindings: D1ApiBindings,
    _executionContext?: unknown,
  ): Promise<Response> {
    return Promise.resolve(createD1ApiApp(bindings).fetch(request, bindings));
  },
};

export default worker;
