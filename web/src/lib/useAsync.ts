import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/types';

export interface AsyncState<T> {
  phase: 'loading' | 'ok' | 'error';
  data?: T;
  error?: ApiError;
}

/** 统一 loading / ok / error 三态，供两个页面共用。 */
export function useAsync<T>(load: () => Promise<T>): AsyncState<T> & { retry: () => void } {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<AsyncState<T>>({ phase: 'loading' });
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let alive = true;
    // 刷新时保留上一份数据，避免轮询把页面打回骨架
    setState((prev) => (prev.data ? prev : { phase: 'loading' }));
    loadRef
      .current()
      .then((data) => {
        if (alive) setState({ phase: 'ok', data });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setState({
          phase: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError('UNKNOWN', error instanceof Error ? error.message : '未知错误'),
        });
      });
    return () => {
      alive = false;
    };
  }, [nonce, load]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return { ...state, retry };
}
