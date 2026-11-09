import { ApiError } from './types';
import type { Review, ServiceStatus, TaskList, TaskStatus } from './types';

/** 前端唯一的数据入口。页面与组件只依赖这个接口，不直接读 mock。 */
export interface ApiClient {
  getReview(date: string): Promise<Review>;
  getTasks(query?: { status?: TaskStatus; limit?: number }): Promise<TaskList>;
  getServiceStatus(): Promise<ServiceStatus>;
}

/** 真实实现：原生 fetch，无第三方封装。阶段 2 接后端时切换到这里。 */
export function createHttpClient(baseUrl = '/api'): ApiClient {
  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      let code = `HTTP_${res.status}`;
      let message = res.statusText || '请求失败';
      try {
        const body = (await res.json()) as { code?: string; message?: string };
        code = body.code ?? code;
        message = body.message ?? message;
      } catch {
        /* 非 JSON 错误体，保留 HTTP 状态作为错误码 */
      }
      throw new ApiError(code, message, res.status);
    }
    return (await res.json()) as T;
  }

  return {
    getReview: (date) => get<Review>(`/review?date=${encodeURIComponent(date)}`),
    getTasks: (query) => {
      const params = new URLSearchParams({ limit: String(query?.limit ?? 20) });
      if (query?.status) params.set('status', query.status);
      return get<TaskList>(`/tasks?${params.toString()}`);
    },
    getServiceStatus: () => get<ServiceStatus>('/data-status'),
  };
}
