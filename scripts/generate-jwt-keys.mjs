/**
 * Generate RS256 keys for @convex-dev/auth — same format its CLI uses:
 * JWT_PRIVATE_KEY = single-line PKCS8 PEM, JWKS = public key as JWK set.
 * Prints JSON to stdout; never writes files.
 */
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "jwk" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const jwk = { use: "sig", ...publicKey };
const jwks = JSON.stringify({ keys: [jwk] });
const jwtPrivateKey = privateKey.toString().trimEnd().replace(/\n/g, " ");

console.log(JSON.stringify({ JWT_PRIVATE_KEY: jwtPrivateKey, JWKS: jwks }, null, 2));
