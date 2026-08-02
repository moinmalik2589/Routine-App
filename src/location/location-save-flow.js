export async function saveLocationAndRefresh({ repository, draft, currentDate, refreshHome }) {
  const profile = await repository.saveLocationProfile(draft, { currentDate, warmCache: true });
  await refreshHome();
  const diagnostics = { ...(repository.lastProfileSaveDiagnostics || {}), homeRefreshed: true };
  repository.lastProfileSaveDiagnostics = diagnostics;
  return { profile, diagnostics };
}
