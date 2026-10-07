import { readFileSync } from "node:fs";
import path from "node:path";
import { createDocumentsRepository } from "./repository.js";
import { createDocumentStorage } from "./storage.js";
import { createDocumentConverter } from "./engine.js";
import { createDocumentService } from "./service.js";
import { createDocumentsRouter } from "./router.js";
import { createAIProvider } from "./providers.js";
import { assertDocumentsSchemaReady } from "./schema.js";
import { createFNSRegistryAdapter } from './fnsRegistry.js';

// Disabled by default. Missing schema/config never causes an automatic migration.
export function createDocumentRuntime({ db, env = process.env, authRequired, findUser, clientLink, audit, publicRoots = [] }) {
  const enabled = env.CLOVER_DOCUMENTS_ENABLED === "true";
  let runtime = { enabled, runtimeError: null };
  if (enabled) {
    try {
      assertDocumentsSchemaReady(db);
      if (!env.CLOVER_DOCUMENTS_STORAGE_DIR || !path.isAbsolute(env.CLOVER_DOCUMENTS_STORAGE_DIR)) throw Object.assign(new Error(), { code: "DOCUMENTS_STORAGE_REQUIRED" });
      const config = env.CLOVER_DOCUMENTS_CONFIG_FILE ? JSON.parse(readFileSync(env.CLOVER_DOCUMENTS_CONFIG_FILE, "utf8")) : {};
      config.fileValidatorPython=env.CLOVER_DOCUMENTS_FILE_VALIDATOR_PYTHON;
      // Automatic external recognition requires the same explicit server consent as manual AI.
      // Provider readiness is separate: missing credentials still permit a truthful local fallback.
      config.aiAutoRecognition = env.CLOVER_DOCUMENTS_AI_AUTO_RECOGNITION === "true" &&
        env.CLOVER_DOCUMENTS_AI_ENABLED === "true" && env.CLOVER_DOCUMENTS_AI_EXTERNAL_CONSENT === "true";
      config.aiOnlyWhenNeeded = env.CLOVER_DOCUMENTS_AI_ONLY_WHEN_NEEDED === "true";
      const repository = createDocumentsRepository(db);
      const storage = createDocumentStorage(env.CLOVER_DOCUMENTS_STORAGE_DIR, publicRoots);
      const converter = createDocumentConverter({ executable: env.CLOVER_DOCUMENTS_CONVERTER, tempRoot: path.join(env.CLOVER_DOCUMENTS_STORAGE_DIR, "temp") });
      config.fnsVerificationRequired = env.CLOVER_DOCUMENTS_FNS_REQUIRED !== 'false';
      const verificationAdapters = env.CLOVER_DOCUMENTS_FNS_ENABLED === 'true' ? { fns: createFNSRegistryAdapter() } : {};
      const service = createDocumentService({ repository, storage, converter, verificationAdapters, fnsVerificationRequired:config.fnsVerificationRequired });
      const aiProvider = createAIProvider({
        enabled: env.CLOVER_DOCUMENTS_AI_ENABLED === "true" && env.CLOVER_DOCUMENTS_AI_EXTERNAL_CONSENT === "true",
        apiKey: env.CLOVER_DOCUMENTS_AI_API_KEY,
        model: env.CLOVER_DOCUMENTS_AI_MODEL,
      });

      runtime = { ...runtime, repository, storage, service, config, aiProvider, verificationAdapters };
    } catch (error) { runtime.runtimeError = error.code || "DOCUMENTS_CONFIG_INVALID"; }
  }
  return createDocumentsRouter({ ...runtime, authRequired, findUser, clientLink, audit });
}
