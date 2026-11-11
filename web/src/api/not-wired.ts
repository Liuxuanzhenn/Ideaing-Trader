/**
 * 真实模式下「还没接后端」的方法：调用即报错，页面落到 ErrorBlock。
 * 以前这里会静默回落到 mock，用户看到的是假数据，且和真数据无从分辨。
 */
import { ApiError } from './types';
import type { ApiClient } from './client';

const NOT_WIRED: Partial<Record<keyof ApiClient, string>> = {
  getTasks: '任务中心',
  getTaskLogs: '任务日志',
  getNews: '资讯',
  getAgentSession: 'Agent 会话',
  sendAgentMessage: 'Agent 对话',
};

export function notWiredClient(): Pick<
  ApiClient,
  'getTasks' | 'getTaskLogs' | 'getNews' | 'getAgentSession' | 'sendAgentMessage'
> {
  // 必须返回 rejected promise 而不是同步 throw：同步抛会跳过 useAsync 的 .catch，
  // 异常直接冒到 React 渲染，整页白屏（实测 4 个页面因此崩掉）。
  const fail = (name: keyof ApiClient) => () => {
    const label = NOT_WIRED[name] ?? String(name);
    return Promise.reject(
      new ApiError('NOT_IMPLEMENTED', `${label}尚未接入真实接口（当前为真实数据模式）`, 501),
    );
  };
  return {
    getTasks: fail('getTasks') as ApiClient['getTasks'],
    getTaskLogs: fail('getTaskLogs') as ApiClient['getTaskLogs'],
    getNews: fail('getNews') as ApiClient['getNews'],
    getAgentSession: fail('getAgentSession') as ApiClient['getAgentSession'],
    sendAgentMessage: fail('sendAgentMessage') as ApiClient['sendAgentMessage'],
  };
}

/**
 * 编译期护栏：真实模式的 client 必须显式标注为 `ApiClient`。
 * 新增 ApiClient 方法时，如果既没实现到 live、也没登记到 notWiredClient，
 * 那个对象字面量就不满足 ApiClient，`tsc --noEmit` 会直接报缺方法。
 */
