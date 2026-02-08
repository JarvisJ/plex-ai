import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useLibraryItems } from '../hooks/useMediaItems';
import { MediaGrid } from '../components/media/MediaGrid';
import styles from './MediaPage.module.css';

export function MoviesPage() {
  const { libraryKey } = useParams<{ libraryKey: string }>();
  const [searchParams] = useSearchParams();
  const serverName = searchParams.get('server');

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
          Movies
          {total > 0 && <span className={styles.count}>({total})</span>}
        </h1>
      </header>

      <main className={styles.main}>
        <MediaGrid
          items={items}
          serverName={serverName}
          isLoading={isLoading}
          hasMore={hasNextPage}
          onLoadMore={() => fetchNextPage()}
          isFetchingMore={isFetchingNextPage}
        />
      </main>
    </div>
  );
}
