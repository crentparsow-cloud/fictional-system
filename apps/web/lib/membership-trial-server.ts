import "server-only";
import { TRIAL_CONFIG_KEYS, trialConfigFrom, type TrialConfig } from "@/lib/membership-trial";
import { createUserClient } from "@/lib/supabase/server";

/**
 * The trial lengths (13.5) from public.app_config, which every visitor may
 * read (0001). A failed read gives the defaults, 14 days monthly and 21
 * annual, so a database hiccup cannot hide the offer or change its terms
 * silently: the same function feeds the offer and the checkout, so both say
 * the same thing.
 */
export async function loadTrialConfig(): Promise<TrialConfig> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("app_config").select("key, value").in("key", Object.values(TRIAL_CONFIG_KEYS));
    if (error) return trialConfigFrom(null);
    return trialConfigFrom((data ?? []) as { key: string; value: unknown }[]);
  } catch {
    return trialConfigFrom(null);
  }
}
