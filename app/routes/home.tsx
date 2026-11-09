import type { Route } from "./+types/home";
import { cloudflareContext } from "../lib/cloudflare.server";

export function meta() {
  return [
    { title: "Vault" },
    { name: "description", content: "A personal home for links and images." },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  // Exercise both local bindings without choosing a product data model.
  const { env } = context.get(cloudflareContext);
  const row = await env.DB.prepare("SELECT 1 AS ok").first<{
    ok: number;
  }>();
  await env.IMAGES.list({ limit: 1 });
  if (row?.ok !== 1) throw new Error("D1 connection check failed");
  return { storage: "D1 and R2 connected" };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <p className="eyebrow">Personal collection · Project foundation</p>
      <h1>Vault</h1>
      <p>A home for the links, bookmarks, and images you want to keep.</p>
      <p className="status">{loaderData.storage}</p>
      <p className="note">The foundation is ready. Features come next.</p>
    </main>
  );
}
