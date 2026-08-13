function stripTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function hostWithoutPort(value) {
  const raw = String(value || "").trim();
  if (!raw) return "localhost";
  if (raw.startsWith("[")) return raw.slice(1, raw.indexOf("]"));
  return raw.split(":")[0];
}

export function passkeyConfiguration(req) {
  const configuredOrigin = stripTrailingSlash(process.env.PASSKEY_ORIGIN || process.env.APP_PUBLIC_URL);
  const requestOrigin = stripTrailingSlash(`${req.protocol}://${req.get("host")}`);
  const origin = configuredOrigin || requestOrigin;
  const originUrl = new URL(origin);
  const defaultRpId = hostWithoutPort(originUrl.hostname || req.hostname);
  const rpID = String(process.env.PASSKEY_RP_ID || defaultRpId).trim() || defaultRpId;
  const rpName = String(process.env.PASSKEY_RP_NAME || "Clover").trim() || "Clover";
  return { origin, rpID, rpName };
}

export async function registrationOptions({ req, user, credentials }) {
  const { generateRegistrationOptions } = await import("@simplewebauthn/server");
  const { isoUint8Array } = await import("@simplewebauthn/server/helpers");
  const { rpID, rpName } = passkeyConfiguration(req);
  return generateRegistrationOptions({
    rpName,
    rpID,
    userID: isoUint8Array.fromUTF8String(String(user.id)),
    userName: user.email,
    userDisplayName: user.email,
    attestationType: "none",
    excludeCredentials: (credentials || []).map((credential) => ({
      id: credential.id,
      transports: credential.transports || [],
    })),
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
    supportedAlgorithmIDs: [-7, -257],
  });
}

export async function verifyPasskeyRegistration({ req, response, challenge }) {
  const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
  const { origin, rpID } = passkeyConfiguration(req);
  return verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
}

export async function authenticationOptions({ req, credentials }) {
  const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
  const { rpID } = passkeyConfiguration(req);
  const allowCredentials = (credentials || []).map((credential) => ({
    id: credential.id,
    transports: credential.transports || [],
  }));
  return generateAuthenticationOptions({
    rpID,
    // Пустой список = discoverable credentials (вход без email / Face ID выбирает аккаунт).
    ...(allowCredentials.length ? { allowCredentials } : {}),
    userVerification: "required",
  });
}

export async function verifyPasskeyAuthentication({ req, response, challenge, credential }) {
  const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
  const { origin, rpID } = passkeyConfiguration(req);
  return verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports || [],
    },
    requireUserVerification: true,
  });
}
