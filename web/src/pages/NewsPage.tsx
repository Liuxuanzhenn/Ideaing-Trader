import { useCallback, useState } from 'react';
import type { ApiClient } from '../api/client';
import { useAsync } from '../lib/useAsync';
import { EmptyBlock, ErrorBlock, PartialBanner, StaleBanner, StatusChip } from '../components/States';

type Kind = 'all' | 'exchange' | 'news' | 'inferred';

const FILTERS: { id: Kind; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'exchange', label: '交易所公告' },
  { id: 'news', label: '媒体资讯' },
  { id: 'inferred', label: '规则推断' },
];

const SOURCE_LABEL: Record<string, string> = {
  exchange: '交易所公告',
  news: '媒体资讯',
  inferred: '规则推断',
};

const STATUS_LABEL: Record<string, string> = {
  full: '已抓取全文',
  title: '仅标题',
  failed: '源不可用',
};

export function NewsPage({ client, onOpenStock }: { client: ApiClient; onOpenStock: (code: string) => void }) {
  const load = useCallback(() => client.getNews(), [client]);
  const news = useAsync(load);
  const [filter, setFilter] = useState<Kind>('all');

  if (news.phase === 'loading') {
    return (
      <div className="skeleton" aria-busy="true">
        <div className="sk sk-line" style={{ width: 160, height: 20 }} />
        <div className="sk sk-row" /><div className="sk sk-row" /><div className="sk sk-row" />
      </div>
    );
  }
  if (news.phase === 'error') return <ErrorBlock error={news.error} onRetry={news.retry} />;

  const data = news.data!;
  const rows = data.items.filter((item) => filter === 'all' || item.reason_source === filter);

  return (
    <>
      <div className="view-head">
        <div>
          <h2 className="view-title">
            资讯 / 事件
            <StatusChip level={data.meta.status.level} />
          </h2>
          <div className="view-sub">消息面工作区 · 数据 as_of {data.meta.as_of.slice(0, 10)}</div>
        </div>
      </div>

      {data.meta.status.level === 'stale' ? <StaleBanner meta={data.meta} /> : null}
      {data.meta.status.level === 'partial' ? <PartialBanner meta={data.meta} /> : null}

      <div className="seg" role="tablist" aria-label="资讯来源筛选" style={{ marginBottom: 12 }}>
        {FILTERS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={filter === item.id}
            className={`seg-item ${filter === item.id ? 'active' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="card">
        {data.items.length === 0 ? (
          <EmptyBlock title="暂无资讯" description="接口返回 items 为空数组，不是请求失败。" />
        ) : rows.length === 0 ? (
          <EmptyBlock title="该来源下暂无资讯" description="切换上方来源筛选查看其他条目。" />
        ) : (
          rows.map((item) => (
            <div className="news-row" key={item.id}>
              <span className={`tag ${item.status === 'full' ? 'tag-ok' : item.status === 'title' ? 'tag-warn' : 'tag-bad'}`}>
                {STATUS_LABEL[item.status]}
              </span>
              <div className="news-main">
                <div>{item.title}</div>
                <div className="news-meta">
                  <span>{item.source}</span>
                  <span className="num">{item.published}</span>
                  <span>{SOURCE_LABEL[item.reason_source]}</span>
                </div>
                <div className="news-links">
                  {item.codes.map((code) => (
                    <button className="link-chip" key={code} onClick={() => onOpenStock(code)}>{code}</button>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
        <div className="card-note">来源与发布时间均为 mock；status 为 failed 表示抓取失败，需与「已抓到但无正文」区分。</div>
      </div>
    </>
  );
}
