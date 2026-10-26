import { createContext, useState } from "react";

export const FocusContext = createContext({
  focus: { areaId: null, tableId: null },
  setFocus: () => {},
});

/** Ephemeral view state: which area or table is currently highlighted. */
export default function FocusContextProvider({ children }) {
  const [focus, setFocus] = useState({ areaId: null, tableId: null });

  return (
    <FocusContext.Provider value={{ focus, setFocus }}>
      {children}
    </FocusContext.Provider>
  );
}
