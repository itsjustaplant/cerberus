import type { Route } from "./+types/collections";
import { loader as loadLibrary } from "./home";

export { default, meta } from "./home";

export async function loader(args: Route.LoaderArgs) {
  return { ...(await loadLibrary(args)), view: "collections" };
}
