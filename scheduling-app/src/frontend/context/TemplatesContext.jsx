import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadTemplates } from '../../data/mockTemplates';
import { templatesApi } from '../utils/api';

const TemplatesContext = createContext(null);

export function TemplatesProvider({ children }) {
  const [templates,  setTemplates]  = useState(loadTemplates);
  const [selectedId, setSelectedId] = useState(null);
  const [triggerNew, setTriggerNew] = useState(0);

  // Load templates from the API on mount; fall back to the local cache if the server is unreachable.
  useEffect(() => {
    templatesApi.getAll()
      .then(data => setTemplates(data))
      .catch(() => { /* backend not running — local cache stays */ });
  }, []);

  const addTemplate = useCallback(async (tpl) => {
    const created = await templatesApi.create(tpl);
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
