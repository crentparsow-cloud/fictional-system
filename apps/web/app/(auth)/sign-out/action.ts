"use server";

import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";

/** Signs the reader out of this device and returns them to sign-in. */
export async function signOut(): Promise<void> {
  const supabase = await createUserClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in");
}
