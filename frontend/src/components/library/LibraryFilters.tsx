import { useMemo, useState, useRef, useEffect } from "react";
import type { MediaItem } from "../../api/media";
import styles from "./LibraryFilters.module.css";

interface FilterOption {
  value: string;
  label: string;
  count: number;
}

interface LibraryFiltersProps {
  items: MediaItem[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedGenres: Set<string>;
  onGenresChange: (genres: Set<string>) => void;
  selectedYears: Set<number>;
  onYearsChange: (years: Set<number>) => void;
  selectedContentRatings: Set<string>;
  onContentRatingsChange: (ratings: Set<string>) => void;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: Set<string | number>;
  onChange: (selected: Set<string | number>) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (value: string | number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(value)) {
      newSelected.delete(value);
    } else {
      newSelected.add(value);
    }
    onChange(newSelected);
  };

  const clearAll = () => {
    onChange(new Set());
  };

  return (
    <div className={styles.multiSelect} ref={containerRef}>
      <button
        className={`${styles.multiSelectButton} ${
          selected.size > 0 ? styles.hasSelection : ""
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>
          {label}
          {selected.size > 0 && (
            <span className={styles.selectionCount}>({selected.size})</span>
          )}
        </span>
        <span className={styles.chevron}>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          {selected.size > 0 && (
            <button className={styles.clearButton} onClick={clearAll}>
              Clear all
            </button>
          )}
          <div className={styles.optionsList}>
            {options.map((option) => (
              <label key={option.value} className={styles.option}>
                <input
                  type="checkbox"
                  checked={selected.has(option.value)}
                  onChange={() => toggleOption(option.value)}
                />
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionCount}>{option.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LibraryFilters({
  items,
  searchQuery,
  onSearchChange,
  selectedGenres,
  onGenresChange,
  selectedYears,
  onYearsChange,
  selectedContentRatings,
  onContentRatingsChange,
}: LibraryFiltersProps) {
  // Extract unique values and counts from items
  const genreOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const genre of item.genres) {
        counts.set(genre, (counts.get(genre) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const yearOptions = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of items) {
      if (item.year) {
        counts.set(item.year, (counts.get(item.year) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value: String(value),
        label: String(value),
        count,
      }))
      .sort((a, b) => Number(b.value) - Number(a.value));
  }, [items]);

  const contentRatingOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (item.content_rating) {
        counts.set(
          item.content_rating,
          (counts.get(item.content_rating) || 0) + 1
        );
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const hasActiveFilters =
    searchQuery ||
    selectedGenres.size > 0 ||
    selectedYears.size > 0 ||
    selectedContentRatings.size > 0;

  const clearAllFilters = () => {
    onSearchChange("");
    onGenresChange(new Set());
    onYearsChange(new Set());
    onContentRatingsChange(new Set());
  };

  return (
    <div className={styles.filters}>
      <div className={styles.searchContainer}>
        <input
          type="text"
          placeholder="Search title & description..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.searchInput}
        />
        {searchQuery && (
          <button
            className={styles.clearSearch}
            onClick={() => onSearchChange("")}
          >
            ×
          </button>
        )}
      </div>

      <div className={styles.filterGroup}>
        <MultiSelect
          label="Genre"
          options={genreOptions}
          selected={selectedGenres as Set<string | number>}
          onChange={(s) => onGenresChange(s as Set<string>)}
        />

        <MultiSelect
          label="Year"
          options={yearOptions}
          selected={new Set(Array.from(selectedYears).map(String))}
          onChange={(s) => onYearsChange(new Set(Array.from(s).map(Number)))}
        />

        <MultiSelect
          label="Rating"
          options={contentRatingOptions}
          selected={selectedContentRatings as Set<string | number>}
          onChange={(s) => onContentRatingsChange(s as Set<string>)}
        />

        {hasActiveFilters && (
          <button className={styles.clearAllButton} onClick={clearAllFilters}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
