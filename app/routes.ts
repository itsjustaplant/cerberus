import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("collections", "routes/collections.tsx"),
  route("collections/:collectionId", "routes/collection.tsx"),
  route("collections/:collectionId/items/:itemId", "routes/item.tsx"),
] satisfies RouteConfig;
