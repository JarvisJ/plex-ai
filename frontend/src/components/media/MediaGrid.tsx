import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { MediaItem } from "../../api/media";
import { MediaCard } from "./MediaCard";
import styles from "./MediaGrid.module.css";

interface MediaGridProps {
  items: MediaItem[];
  serverName?: string | null;
  clientIdentifier?: string | null;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isFetchingMore?: boolean;
}

const CARD_MIN_WIDTH = 160;
const CARD_GAP = 16;
const CARD_HEIGHT = 490; // Approximate height of a card

export function MediaGrid({
  items,
  serverName,
  clientIdentifier,
  isLoading,
  hasMore,
}: MediaGridProps) {
  const element = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);

  const updateColumns = (width: number) => {
    const cols = Math.max(
      1,
      Math.floor((width + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP))
    );
    setColumns(cols);
  };

  const observer = useMemo(
    () =>
      new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          updateColumns(entry.contentRect.width);
        }
      }),
    []
  );

  const resizeRef = useCallback(
    (node: HTMLDivElement) => {
      if (node !== null) {
        // Initial calculation
        updateColumns(node.clientWidth);

        element.current = node;
        observer.observe(node);
      }
    },
    [observer]
  );

  // Calculate number of columns based on container width
  useEffect(() => {
    return () => observer.disconnect();
  }, []);

  // Calculate rows
  const rowCount = Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount + (hasMore ? 1 : 0), // +1 for load more button
    getScrollElement: () => element.current,
    estimateSize: () => CARD_HEIGHT,
    overscan: 2,
  });

  if (isLoading && items.length === 0) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (items.length === 0) {
    return <div className={styles.empty}>No items found</div>;
  }

  return (
    <div ref={resizeRef} className={styles.virtualContainer}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const isLoadMoreRow = virtualRow.index === rowCount;

          if (isLoadMoreRow) {
            return (
              <div
                key="load-more"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {/* <div className={styles.loadMoreContainer}>
                  <button
                    onClick={onLoadMore}
                    disabled={isFetchingMore}
                    className={styles.loadMoreButton}
                  >
                    {isFetchingMore ? "Loading..." : "Load More"}
                  </button>
                </div> */}
              </div>
            );
          }

          // Get items for this row
          const startIndex = virtualRow.index * columns;
          const rowItems = items.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className={styles.row}>
                {rowItems.map((item) => (
                  <div key={item.rating_key} className={styles.cell}>
                    <MediaCard
                      item={item}
                      serverName={serverName}
                      clientIdentifier={clientIdentifier}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
