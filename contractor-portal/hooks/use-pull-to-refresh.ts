import { useCallback, useState } from 'react';

export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refresh]);

  return { isRefreshing, onRefresh };
}
