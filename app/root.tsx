import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <meta name="theme-color" content="#080808" />
        <meta name="color-scheme" content="dark" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="root">{children}</div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  useEffect(() => {
    const root = document.documentElement;
    function setModality(value: "keyboard" | "pointer") {
      if (root.dataset.inputModality !== value)
        root.dataset.inputModality = value;
    }
    const pointer = () => setModality("pointer");
    const keyboard = () => setModality("keyboard");
    setModality("keyboard");
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
    };
  }, []);
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="error-page">
      <p className="eyebrow">Vault</p>
      <h1>{notFound ? "Page not found" : "Something went wrong"}</h1>
      <p>{notFound ? "This page does not exist." : "Please try again."}</p>
      <a href="/">Return home</a>
    </main>
  );
}
