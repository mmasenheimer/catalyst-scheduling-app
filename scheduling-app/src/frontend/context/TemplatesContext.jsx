import { createContext, useContext, useState } from 'react';
import { loadTemplates } from '../../data/mockTemplates';

const TemplatesContext = createContext(null);

export function TemplatesProvider({ children }) {
  const [templates,   setTemplates]   = useState(loadTemplates);
  const [selectedId,  setSelectedId]  = useState(null);
  const [triggerNew,  setTriggerNew]  = useState(0);

  return (
    <TemplatesContext.Provider value={{ templates, setTemplates, selectedId, setSelectedId, triggerNew, setTriggerNew }}>
      {children}
    </TemplatesContext.Provider>
  );
}

export function useTemplates() {
  return useContext(TemplatesContext);
}
