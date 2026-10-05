/**
 * Print one new answer sealing key for ANSWERS_KEYS. Run it on your own machine
 * and paste the output into Vercel as a sensitive production variable.
 * Never paste a key into a chat.
 *
 *   pnpm tsx scripts/new-seal-key.ts
 */
import { newKeySpec } from "@akana/seal";

console.log(newKeySpec());
