import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWatchlist } from '../../contexts/WatchlistContext';
import styles from './WatchlistModal.module.css';

interface WatchlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  ratingKey: string;
  guid: string;
  title: string;
}

export function WatchlistModal({
  isOpen,
  onClose,
  serverName,
  ratingKey,
  guid,
  title,
}: WatchlistModalProps) {
  const { isOnWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onWatchlist = isOnWatchlist(guid);

  const handleToggleWatchlist = async () => {
    setIsUpdating(true);
    setError(null);

    try {
      if (onWatchlist) {
        await removeFromWatchlist(serverName, ratingKey);
      } else {
        await addToWatchlist(serverName, ratingKey);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update watchlist');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{title}</h2>

        {error && <p className={styles.errorText}>{error}</p>}

        <div>
          <p className={styles.statusText}>
            {onWatchlist
              ? 'This item is currently on your watchlist.'
              : 'This item is not on your watchlist.'}
          </p>

          <div className={styles.actions}>
            <button
              onClick={handleToggleWatchlist}
              disabled={isUpdating}
              className={`${styles.primaryButton} ${onWatchlist ? styles.remove : ''}`}
            >
              {isUpdating
                ? 'Updating...'
                : onWatchlist
                  ? 'Remove from Watchlist'
                  : 'Add to Watchlist'}
            </button>
            <button onClick={onClose} className={styles.closeButton}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
