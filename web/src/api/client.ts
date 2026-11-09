import { ApiError } from './types';
import type {
  AgentMessage,
  AgentSession,
  BacktestForm,
  BacktestOptions,
  BacktestResult,
  NewsList,
  Portfolio,
  Review,
  ScreenOptions,
  ScreenResult,
  ScreenCondition,
  ServiceStatus,
  Stock,
  TaskItem,
  TaskList,
  TaskLogs,
  TaskStatus,
} from './types';

/** 前端唯一的数据入口。页面与组件只依赖这个接口，不直接读 mock。 */
export interface ApiClient {
  getServiceStatus(): Promise<ServiceStatus>;

  getReview(date: string): Promise<Review>;
  getStock(code: string): Promise<Stock>;

  getScreenOptions(): Promise<ScreenOptions>;
  runScreen(conditions: ScreenCondition[]): Promise<ScreenResult>;

  getBacktestOptions(): Promise<BacktestOptions>;
  submitBacktest(form: BacktestForm): Promise<TaskItem>;
  getBacktestResult(taskId: string): Promise<BacktestResult>;

  getTasks(query?: { status?: TaskStatus; limit?: number }): Promise<TaskList>;
  getNews(): Promise<NewsList>;
  getAgentSession(): Promise<AgentSession>;
  sendAgentMessage(text: string): Promise<AgentMessage>;

  /** 观察池子视图要的一次批量行情；真实实现是一条批量接口，不是 N 次单票请求 */
  getStocks(codes: string[]): Promise<Stock[]>;
  getTaskLogs(taskId: string): Promise<TaskLogs>;

  getPortfolio(): Promise<Portfolio>;
  addWatchlist(code: string): Promise<Portfolio>;
  removeWatchlist(code: string): Promise<Portfolio>;
  addBasket(code: string): Promise<Portfolio>;
}

/** 真实实现：原生 fetch，无第三方封装。阶段 2 接后端时切换到这里。 */
export function createHttpClient(baseUrl = '/api'): ApiClient {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { accept: 'application/json', 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
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

  const post = <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) });

  return {
    getServiceStatus: () => request<ServiceStatus>('/data-status'),
    getReview: (date) => request<Review>(`/review?date=${encodeURIComponent(date)}`),
    getStock: (code) => request<Stock>(`/stocks/${encodeURIComponent(code)}`),
    getScreenOptions: () => request<ScreenOptions>('/screen/options'),
    runScreen: (conditions) => post<ScreenResult>('/screen', { conditions }),
    getBacktestOptions: () => request<BacktestOptions>('/backtests/options'),
    submitBacktest: (form) => post<TaskItem>('/backtests', form),
    getBacktestResult: (taskId) => request<BacktestResult>(`/backtests/${encodeURIComponent(taskId)}`),
    getTasks: (query) => {
      const params = new URLSearchParams({ limit: String(query?.limit ?? 20) });
      if (query?.status) params.set('status', query.status);
      return request<TaskList>(`/tasks?${params.toString()}`);
    },
    getNews: () => request<NewsList>('/news'),
    getAgentSession: () => request<AgentSession>('/agent/session'),
    sendAgentMessage: (text) => post<AgentMessage>('/agent/messages', { text }),
    getStocks: (codes) => post<Stock[]>('/stocks/batch', { codes }),
    getTaskLogs: (taskId) => request<TaskLogs>(`/tasks/${encodeURIComponent(taskId)}/logs`),
    getPortfolio: () => request<Portfolio>('/portfolio'),
    addWatchlist: (code) => post<Portfolio>('/portfolio/watchlist', { code }),
    removeWatchlist: (code) => request<Portfolio>(`/portfolio/watchlist/${encodeURIComponent(code)}`, { method: 'DELETE' }),
    addBasket: (code) => post<Portfolio>('/portfolio/basket', { code }),
  };
}
