export async function loadStandaloneDocumentOptions(api) {
  const [generator, archive] = await Promise.all([
    api.getStandaloneDocumentOptions(), api.getArchiveDocumentOptions(),
  ]);
  return {
    ...generator,
    archiveLegalEntities: archive.legalEntities || [],
    capabilities: {
      ...generator.capabilities,
      archiveImport: archive.enabled !== false && archive.capabilities?.archiveImport === true,
      delete: archive.enabled !== false && archive.capabilities?.delete === true,
      restore: archive.enabled !== false && archive.capabilities?.restore === true,
      attachDocuments: archive.enabled !== false && archive.capabilities?.attachDocuments === true,
      purge: archive.enabled !== false && archive.capabilities?.purge === true,
    },
  };
}
