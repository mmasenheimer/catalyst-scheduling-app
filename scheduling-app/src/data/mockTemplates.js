export const TEMPLATE_STORAGE_KEY = 'catalyst_templates';

export function loadTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function persistTemplates(templates) {
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}
