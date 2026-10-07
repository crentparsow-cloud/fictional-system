"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OPT_OUT_COOKIE } from "@/lib/funnel";

/** Turn counting off or back on for this browser (F-141). A first-party cookie that holds "1" and nothing else. */
export async function setCounting(fd: FormData): Promise<void> {
  const off = fd.get("counting") === "off";
  const jar = await cookies();
  if (off) {
    jar.set(OPT_OUT_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 395 });
  } else {
    jar.delete(OPT_OUT_COOKIE);
  }
  redirect(`/counting?saved=${off ? "off" : "on"}`);
}
