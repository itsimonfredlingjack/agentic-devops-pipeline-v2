import { useCallback, useState } from "react";

export function useCollapsible(initial = false) {
  const [isOpen, setIsOpen] = useState(initial);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  return { isOpen, toggle } as const;
}
