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
import { Toaster } from "sonner";
import { PageTransitions } from "./components/page-transitions";
import "sonner/dist/styles.css";
import "./app.css";
import "./agents-theme.css";
import "./strawhat-theme.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <meta name="theme-color" content="#1a1a1a" />
        <meta name="color-scheme" content="dark" />
        <meta name="application-name" content="Cerberus" />
        <meta name="apple-mobile-web-app-title" content="Cerberus" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32.png"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="root">{children}</div>
        <Toaster
          theme="dark"
          position="bottom-right"
          closeButton
          mobileOffset={{
            bottom: "calc(88px + env(safe-area-inset-bottom))",
            left: 16,
            right: 16,
          }}
          toastOptions={{
            classNames: { toast: "cerberus-toast" },
            actionButtonStyle: {
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 400,
              borderRadius: 0,
              minHeight: 38,
              height: "auto",
              padding: "8px 14px",
              border: "1px solid #efeef7",
              background: "#efeef7",
              color: "#171717",
            },
            style: {
              fontFamily: "Inter, sans-serif",
              background: "#212121",
              color: "#ececec",
              border: "1px solid #424242",
              borderRadius: 0,
            },
          }}
        />
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
  return (
    <>
      <PageTransitions />
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="error-page">
      <p className="eyebrow">Cerberus</p>
      <h1>{notFound ? "Page not found" : "Something went wrong"}</h1>
      <p>{notFound ? "This page does not exist." : "Please try again."}</p>
      <a href="/">Return home</a>
    </main>
  );
}
