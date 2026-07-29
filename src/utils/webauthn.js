function base64urlToUint8Array(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function uint8ArrayToBase64url(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value || []);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeCredentialDescriptors(items = []) {
  return items.map((item) => ({ ...item, id: base64urlToUint8Array(item.id) }));
}

export async function startPasskeyRegistration(optionsJSON) {
  const publicKey = {
    ...optionsJSON,
    challenge: base64urlToUint8Array(optionsJSON.challenge),
    user: {
      ...optionsJSON.user,
      id: base64urlToUint8Array(optionsJSON.user.id),
    },
    excludeCredentials: normalizeCredentialDescriptors(optionsJSON.excludeCredentials || []),
  };
  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) throw new Error("Устройство не вернуло ключ доступа.");
  return {
    id: credential.id,
    rawId: uint8ArrayToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: uint8ArrayToBase64url(credential.response.clientDataJSON),
      attestationObject: uint8ArrayToBase64url(credential.response.attestationObject),
      transports: typeof credential.response.getTransports === "function"
        ? credential.response.getTransports()
        : [],
      publicKeyAlgorithm: typeof credential.response.getPublicKeyAlgorithm === "function"
        ? credential.response.getPublicKeyAlgorithm()
        : undefined,
      publicKey: typeof credential.response.getPublicKey === "function" && credential.response.getPublicKey()
        ? uint8ArrayToBase64url(credential.response.getPublicKey())
        : undefined,
      authenticatorData: typeof credential.response.getAuthenticatorData === "function"
        ? uint8ArrayToBase64url(credential.response.getAuthenticatorData())
        : undefined,
    },
  };
}

export async function startPasskeyAuthentication(optionsJSON) {
  const publicKey = {
    ...optionsJSON,
    challenge: base64urlToUint8Array(optionsJSON.challenge),
    allowCredentials: normalizeCredentialDescriptors(optionsJSON.allowCredentials || []),
  };
  const credential = await navigator.credentials.get({ publicKey });
  if (!credential) throw new Error("Устройство не подтвердило вход.");
  return {
    id: credential.id,
    rawId: uint8ArrayToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: uint8ArrayToBase64url(credential.response.clientDataJSON),
      authenticatorData: uint8ArrayToBase64url(credential.response.authenticatorData),
      signature: uint8ArrayToBase64url(credential.response.signature),
      userHandle: credential.response.userHandle
        ? uint8ArrayToBase64url(credential.response.userHandle)
        : undefined,
    },
  };
}
