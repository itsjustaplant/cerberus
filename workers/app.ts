import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/lib/cloudflare.server";

import { api } from "./api";
import { withR2Budget } from "../app/lib/r2-budget.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    env = withR2Budget(env);
    if (new URL(request.url).pathname.startsWith("/api/"))
      return api(request, env, ctx);
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
  },
} satisfies ExportedHandler<Env>;
