import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

/**
 * The web app manifest (10.1), served at /manifest.webmanifest. Standalone
 * display, so the installed app has no browser bar. The start URL is /today,
 * the same address a reader may already have bookmarked: signed out, it goes
 * to sign-in and comes straight back to Today afterwards, and the bookmark
 * and the installed app behave alike. The scope is the whole site, so a page
 * the reader opens from inside the app stays in the app.
 *
 * The icons are the placeholder mark in public/icons (rendered by
 * scripts/make-icons.mjs). They change when the visual identity is chosen.
 * The colours match the viewport theme colour in the root layout.
 *
 * The service worker (public/sw.js) is unchanged: it keeps only the offline
 * Help now page. Installing does not cache the app or any answers.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/today",
    name: brand.name,
    short_name: brand.name,
    description: brand.line,
    lang: "en-GB",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f5f0",
    theme_color: "#1f4e5a",
    categories: ["education", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Today", short_name: "Today", url: "/today", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] }],
  };
}
