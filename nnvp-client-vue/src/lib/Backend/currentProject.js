/**
 * Tracks which cloud project the board currently "is", so a cloud save can be
 * recorded as the CONTINUATION of it (the lineage edge, see the backend's
 * Project.parent). Set on cloud load/save; cleared by File > New, loading a
 * local file, or signing out. Survives reloads via localStorage.
 */

const STORAGE_KEY = 'nnvp_current_project';

export function getCurrentProject(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const raw = storage && storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.id === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export function setCurrentProject(project, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    if (!storage) return;
    if (project && typeof project.id === 'number') {
      storage.setItem(STORAGE_KEY, JSON.stringify({ id: project.id, name: project.name || '' }));
    } else {
      storage.removeItem(STORAGE_KEY);
    }
  } catch { /* storage unavailable */ }
}

export function clearCurrentProject(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  setCurrentProject(null, storage);
}
