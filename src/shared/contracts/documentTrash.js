export function documentTrashActions(document, capabilities = {}, trashView = false) {
  return {
    trash: !trashView && capabilities.delete === true && document?.canDelete === true,
    restore: trashView && capabilities.restore === true && document?.canRestore === true,
  };
}
