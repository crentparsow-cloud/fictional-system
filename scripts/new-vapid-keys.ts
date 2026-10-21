/**
 * Makes a VAPID key pair for Web Push (13.19) and prints the three lines for
 * the environment. Run it once: pnpm tsx scripts/new-vapid-keys.ts
 *
 * The public key goes anywhere the app runs. The private key is a secret:
 * set it in Vercel as a sensitive variable and nowhere else.
 */
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pub = publicKey.export({ format: "jwk" }) as { x: string; y: string };
const priv = privateKey.export({ format: "jwk" }) as { d: string };
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);

console.log(`VAPID_PUBLIC_KEY=${raw.toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${priv.d}`);
console.log("VAPID_SUBJECT=mailto:hello@your-akana-domain");
