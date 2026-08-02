import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { templatesApi } from '../utils/api';

const TemplatesContext = createContext(null);

/**
 * A name that doesn't collide with an existing template.
 *
 * Free name        → returned unchanged.
 * Taken            → " (n)" appended, using the lowest free n.
 * Already numbered → the suffix is replaced rather than stacked, so copying
 *                    "Fall (1)" yields "Fall (2)", not "Fall (1) (1)".
 * Blank            → left blank; the editor creates unnamed drafts and names
 *                    them on save.
 */
export function uniqueTemplateName(desired, templates) {
  const wanted = String(desired ?? '').trim();
  if (!wanted) return wanted;

  const taken = new Set((templates ?? []).map(t => String(t?.name ?? '').trim().toLowerCase()));
  if (!taken.has(wanted.toLowerCase())) return wanted;

  const base = wanted.replace(/\s*\(\d+\)$/, '').trim() || wanted;
  let n = 1;
  while (taken.has(`${base} (${n})`.toLowerCase())) n += 1;
  return `${base} (${n})`;
}

export function TemplatesProvider({ children }) {
  const [templates,  setTemplates]  = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [triggerNew, setTriggerNew] = useState(0);

  // Templates live in the database. This used to seed from a localStorage cache,
  // but nothing had written that key since templates moved server-side — so the
  // seed could only ever return an empty list, or worse, briefly resurrect stale
  // templates left in a browser from an older build.
  useEffect(() => {
    templatesApi.getAll()
      .then(data => setTemplates(data))
      .catch(() => { /* backend not running — leave the list empty */ });
  }, []);

  // Live copy of the list so addTemplate can read it without depending on
  // `templates` — its identity has to stay stable, since consumers pass it
  // through their own useCallback dependency arrays.
  const templatesRef = useRef(templates);
  useEffect(() => { templatesRef.current = templates; }, [templates]);

  // Creating a template whose name is taken numbers the copy rather than
  // failing — "Fall Schedule" → "Fall Schedule (1)". This lives inside
  // addTemplate so every creation path gets it and none can forget.
  // (Renaming an existing template still rejects duplicates — silently
  // renaming something the user just typed would be surprising.)
  const addTemplate = useCallback(async (tpl) => {
    const created = await templatesApi.create({
      ...tpl,
      name: uniqueTemplateName(tpl?.name, templatesRef.current),
    });
    setTemplates(prev => [...prev, created]);
    return created;
  }, []);

  const updateTemplate = useCallback(async (id, changes) => {
    const updated = await templatesApi.update(id, changes);
    setTemplates(prev => prev.map(t => t.id === id ? updated : t));
    return updated;
  }, []);

  const removeTemplate = useCallback(async (id) => {
    await templatesApi.remove(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  const removeAllTemplates = useCallback(async () => {
    await templatesApi.removeAll();
    setTemplates([]);
  }, []);

  return (
    <TemplatesContext.Provider value={{
      templates, selectedId, setSelectedId, triggerNew, setTriggerNew,
      addTemplate, updateTemplate, removeTemplate, removeAllTemplates,
    }}>
      {children}
    </TemplatesContext.Provider>
  );
}

export function useTemplates() {
  return useContext(TemplatesContext);
}
