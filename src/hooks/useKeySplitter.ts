import { useState, useEffect, useCallback, useRef } from 'react';
import { keySplitter, type KeySplitResult } from '@/lib/keySplitter';

export function useKeySplitter() {
  const [hotKeyStats, setHotKeyStats] = useState(() => keySplitter.getHotKeyStats());
  const [recentHotKeys, setRecentHotKeys] = useState(() => keySplitter.getRecentHotKeys(20));
  
  // Refresh stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setHotKeyStats(keySplitter.getHotKeyStats());
      setRecentHotKeys(keySplitter.getRecentHotKeys(20));
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  
  const classify = useCallback((product: any, detections?: any[], intents?: any[]): KeySplitResult => {
    const result = keySplitter.classify(product, detections, intents);
    // Refresh stats after classification
    setHotKeyStats(keySplitter.getHotKeyStats());
    setRecentHotKeys(keySplitter.getRecentHotKeys(20));
    return result;
  }, []);
  
  return { classify, hotKeyStats, recentHotKeys };
}
