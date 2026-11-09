import { useCallback, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { AgentMessage } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { EmptyBlock, ErrorBlock, PartialBanner, StaleBanner, StatusChip } from '../components/States';

export function AgentPage({ client, onGoTasks }: { client: ApiClient; onGoTasks: () => void }) {
  const load = useCallback(() => client.getAgentSession(), [client]);
  const session = useAsync(load);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [extra, setExtra] = useState<AgentMessage[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  if (session.phase === 'loading') {
    return (
      <div className="skeleton" aria-busy="true">
        <div className="sk sk-line" style={{ width: 180, height: 20 }} />
        <div className="sk sk-card" style={{ height: 120 }} />
      </div>
    );
  }
  if (session.phase === 'error') return <ErrorBlock error={session.error} onRetry={session.retry} />;

  const data = session.data!;
  const messages = [...data.messages, ...extra];

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    const optimistic: AgentMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      text,
      at: new Date().toLocaleTimeString('zh-CN', { hour12: false }).slice(0, 5),
    };
    setInput('');
    try {
      const reply = await client.sendAgentMessage(text);
      setExtra((prev) => [...prev, optimistic, reply]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="view-head">
        <div>
          <h2 className="view-title">
            内置 Agent
            <StatusChip level={data.meta.status.level} />
          </h2>
          <div className="view-sub">通过受控工具查询与提交任务，不直接访问数据库 · 示例会话</div>
        </div>
        <div className="view-actions">
          <button className="btn" onClick={onGoTasks}>任务中心</button>
        </div>
      </div>

      {data.meta.status.level === 'stale' ? <StaleBanner meta={data.meta} /> : null}
      {data.meta.status.level === 'partial' ? <PartialBanner meta={data.meta} /> : null}

      <div className="card section">
        {messages.length === 0 ? (
          <EmptyBlock title="会话为空" description="输入一个问题开始；所有工具调用都会展示工具名、参数与耗时。" />
        ) : (
          <div className="agent-log">
            {messages.map((message) => (
              <div className={`msg ${message.role === 'user' ? 'msg-user' : 'msg-agent'}`} key={message.id}>
                <div className="bubble">{message.text}</div>
                <div className="msg-meta">{message.role === 'user' ? '我' : 'Agent'} · {message.at}</div>
                {message.tool_calls?.map((call) => (
                  <div className="tool-card" key={call.id}>
                    <div className="tool-head">
                      <span className="tool-name">{call.tool}</span>
                      <span>{call.duration_ms}ms</span>
                      {call.task_id ? (
                        <button className="btn btn-small" style={{ marginLeft: 'auto' }} onClick={onGoTasks}>
                          查看任务 {call.task_id}
                        </button>
                      ) : null}
                    </div>
                    <div className="tool-args">{JSON.stringify(call.args)}</div>
                    <div className="tool-args">{call.summary}</div>
                  </div>
                ))}
                {message.requires_trace ? (
                  <div className="trace-note">该回复包含写操作（提交任务），已在任务中心留痕，不做静默提交。</div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {sendError ? <div className="banner banner-bad section" role="alert">{sendError}</div> : null}

        <div className="agent-input">
          <input
            value={input}
            placeholder="例如：用观察池跑一次首板回封回测"
            aria-label="向 Agent 提问"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void send(); }}
          />
          <button className="btn btn-primary" onClick={() => void send()} disabled={sending || !input.trim()}>
            {sending ? '发送中…' : '发送'}
          </button>
        </div>
      </div>
    </>
  );
}
