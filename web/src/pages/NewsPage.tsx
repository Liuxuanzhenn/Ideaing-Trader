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
  full: '全文',
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
          <div className="view-sub">
            {rows.length} 条 · 数据 {data.meta.as_of.slice(0, 10)}
          </div>
        </div>
        <div className="view-actions">
          <div className="seg" role="tablist" aria-label="资讯来源筛选">
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
        </div>
      </div>

      {data.meta.status.level === 'stale' ? <StaleBanner meta={data.meta} /> : null}
      {data.meta.status.level === 'partial' ? <PartialBanner meta={data.meta} /> : null}

      <div className="card">
        {data.items.length === 0 ? (
          <EmptyBlock title="暂无资讯" description="当前没有抓取到条目。" />
        ) : rows.length === 0 ? (
          <EmptyBlock title="该来源下暂无资讯" description="换一个来源筛选。" />
        ) : (
          <div className="news-list2">
            {rows.map((item) => (
              <article className="news-row2" key={item.id}>
                <div className="ntime">{item.published}</div>
                <div className="nmain">
                  <div className="ntitle">{item.title}</div>
                  <div className="nmeta">
                    <span>{item.source}</span>
                    <span className="ndot" aria-hidden="true">·</span>
                    <span>{SOURCE_LABEL[item.reason_source]}</span>
                    <span className={`tag ${item.status === 'failed' ? 'tag-bad' : ''}`}>
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                </div>
                <div className="ncodes">
                  {item.codes.map((code) => (
                    <button className="link-chip" key={code} onClick={() => onOpenStock(code)}>
                      {code}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
