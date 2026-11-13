import { useEffect, useState } from 'react';

const motionKey = 'pokesim-evolution:reduce-motion';

function getMotionPreference() {
  try {
    return localStorage.getItem(motionKey) === 'true';
  } catch {
    return false;
  }
}

export function useMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState(getMotionPreference);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-reduced-motion', reduceMotion);
    try {
      localStorage.setItem(motionKey, String(reduceMotion));
    } catch {
      // The preference still applies for this visit when storage is unavailable.
    }
  }, [reduceMotion]);

  return [reduceMotion, setReduceMotion] as const;
}
