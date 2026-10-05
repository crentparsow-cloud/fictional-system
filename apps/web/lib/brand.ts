/**
 * The brand is a config value, never hard-coded in content or templates.
 * AKANA is pending trade mark clearance (gate O4). If it fails, this file and
 * the environment change; nothing else does.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "Akana",
  line: "The place where books become practical.",
  wellnessNotice: "Akana workbooks are for wellness and learning. They are not treatment, therapy or medical advice.",
} as const;
