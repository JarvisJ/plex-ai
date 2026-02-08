import type { MediaItem } from '../../api/media';
import { MediaCard } from './MediaCard';
import styles from './MediaGrid.module.css';

interface MediaGridProps {
  items: MediaItem[];
  serverName?: string | null;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isFetchingMore?: boolean;
}

export function MediaGrid({
  items,
  serverName,
  isLoading,
  hasMore,
  onLoadMore,
  isFetchingMore,
}: MediaGridProps) {
  if (isLoading && items.length === 0) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (items.length === 0) {
    return <div className={styles.empty}>No items found</div>;
  }

  return (
    <div>
      <div className={styles.grid}>
        {items.map((item) => (
          <MediaCard key={item.rating_key} item={item} serverName={serverName} />
        ))}
      </div>

      {hasMore && (
        <div className={styles.loadMoreContainer}>
          <button
            onClick={onLoadMore}
            disabled={isFetchingMore}
            className={styles.loadMoreButton}
          >
            {isFetchingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
