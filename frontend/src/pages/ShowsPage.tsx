import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useLibraryItems } from '../hooks/useMediaItems';
import { MediaGrid } from '../components/media/MediaGrid';
import { AgentPanel, AgentToggle } from '../components/agent';
import styles from './MediaPage.module.css';

export function ShowsPage() {
  const { libraryKey } = useParams<{ libraryKey: string }>();
  const [searchParams] = useSearchParams();
  const serverName = searchParams.get('server');
  const clientIdentifier = searchParams.get('machine');
  const [isAgentOpen, setIsAgentOpen] = useState(false);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useLibraryItems(serverName, libraryKey || null);

  const items = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) || [];
  }, [data]);

  const total = data?.pages[0]?.total || 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link to="/dashboard" className={styles.backLink}>
          &larr;
        </Link>
        <h1 className={styles.title}>
          TV Shows
          {total > 0 && <span className={styles.count}>({total})</span>}
        </h1>
      </header>

      <main className={styles.main}>
        <MediaGrid
          items={items}
          serverName={serverName}
          clientIdentifier={clientIdentifier}
          isLoading={isLoading}
          hasMore={hasNextPage}
          onLoadMore={() => fetchNextPage()}
          isFetchingMore={isFetchingNextPage}
        />
      </main>

      <AgentToggle onClick={() => setIsAgentOpen(true)} />
      <AgentPanel
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        serverName={serverName}
        clientIdentifier={clientIdentifier}
      />
    </div>
  );
}
