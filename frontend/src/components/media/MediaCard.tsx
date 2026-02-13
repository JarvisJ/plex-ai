import { useState } from "react";
import { getThumbnailUrl } from "../../api/media";
import type { MediaItem } from "../../api/media";
import { useWatchlist } from "../../contexts/WatchlistContext";
import { useCachedThumbnail } from "../../hooks/useCachedThumbnail";
import { useIntersectionObserver } from "../../hooks/useIntersectionObserver";
import { WatchlistModal } from "./WatchlistModal";
import styles from "./MediaCard.module.css";

interface MediaCardProps {
  item: MediaItem;
  serverName?: string | null;
  clientIdentifier?: string | null;
}

const PERCENT_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "percent",
});

export function MediaCard({ item, serverName, clientIdentifier }: MediaCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { isOnWatchlist } = useWatchlist();
  const onWatchlist = isOnWatchlist(item.guid);
  const [cardRef, isVisible] = useIntersectionObserver<HTMLDivElement>({
    rootMargin: '200px',
    triggerOnce: true,
  });

  // Only compute thumbnail URL when visible
  const thumbUrl =
    isVisible && item.thumb && serverName ? getThumbnailUrl(serverName, item.thumb) : null;
  const { src: cachedThumbUrl, isLoading: isThumbLoading } = useCachedThumbnail(thumbUrl);
  const rating = item.rating
    ? PERCENT_FORMATTER.format(item.rating / 10)
    : "0%";

  const handleWatchlistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  const formatDuration = (ms: number | null): string => {
    if (!ms) return "";
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div ref={cardRef} className={styles.card}>
      <div className={styles.imageContainer}>
        {thumbUrl ? (
          isThumbLoading ? (
            <div className={styles.noImage}>Loading...</div>
          ) : cachedThumbUrl ? (
            <img
              src={cachedThumbUrl}
              alt={item.title}
              className={styles.image}
            />
          ) : (
            <div className={styles.noImage}>No Image</div>
          )
        ) : (
          <div className={styles.noImage}>No Image</div>
        )}

        <button
          onClick={handleWatchlistClick}
          className={`${styles.watchlistButton} ${onWatchlist ? styles.onWatchlist : ''}`}
          title={onWatchlist ? "On watchlist" : "Add to watchlist"}
        >
          {onWatchlist ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={styles.watchlistIcon}
            >
              <path
                d="M3 7h8"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={styles.watchlistIcon}
            >
              <path
                d="M7 1v12M1 7h12"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>

        {item.rating != null && <div className={styles.rating}>{rating}</div>}
      </div>

      <div className={styles.content}>
        <h3 className={styles.title}>{item.title}</h3>
        <div className={styles.meta}>
          {item.year && <span>{item.year}</span>}
          {item.content_rating && <span>{item.content_rating}</span>}
          {item.duration_ms && <span>{formatDuration(item.duration_ms)}</span>}
          {item.type === "show" && item.season_count && (
            <span>
              {item.season_count} season{item.season_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {item.genres.length > 0 && (
          <div className={styles.genres}>
            {item.genres.slice(0, 2).map((genre) => (
              <span key={genre} className={styles.genre}>
                {genre}
              </span>
            ))}
          </div>
        )}
        {clientIdentifier && (
          <a
            href={`https://app.plex.tv/desktop#!/server/${clientIdentifier}/details?key=%2Flibrary%2Fmetadata%2F${item.rating_key}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.watchButton}
            onClick={(e) => e.stopPropagation()}
          >
            Watch
          </a>
        )}
      </div>

      {serverName && (
        <WatchlistModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          serverName={serverName}
          ratingKey={item.rating_key}
          guid={item.guid}
          title={item.title}
        />
      )}
    </div>
  );
}
