import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useLibraryItems } from "../hooks/useMediaItems";
import { MediaGrid } from "../components/media/MediaGrid";
import { LibraryFilters } from "../components/library";
import { AgentPanel, AgentToggle } from "../components/agent";
import styles from "./MediaPage.module.css";

interface LibraryPageProps {
  title: string;
}

const SEARCH_PROPERTIES: Array<"summary" | "title"> = ["summary", "title"];

export function LibraryPage({ title }: LibraryPageProps) {
  const { libraryKey } = useParams<{ libraryKey: string }>();
  const [searchParams] = useSearchParams();
  const serverName = searchParams.get("server");
  const clientIdentifier = searchParams.get("machine");
  const [isAgentOpen, setIsAgentOpen] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [selectedContentRatings, setSelectedContentRatings] = useState<
    Set<string>
  >(new Set());

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLibraryItems(serverName, libraryKey || null);

  const allItems = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) || [];
  }, [data]);

  // Apply filters
  const filteredItems = useMemo(() => {
    let result = allItems;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) =>
        SEARCH_PROPERTIES.some((search_property) =>
          item[search_property]?.toLowerCase().includes(query)
        )
      );
    }

    // Genre filter
    if (selectedGenres.size > 0) {
      result = result.filter((item) =>
        item.genres.some((genre) => selectedGenres.has(genre))
      );
    }

    // Year filter
    if (selectedYears.size > 0) {
      result = result.filter(
        (item) => item.year !== null && selectedYears.has(item.year)
      );
    }

    // Content rating filter
    if (selectedContentRatings.size > 0) {
      result = result.filter(
        (item) =>
          item.content_rating !== null &&
          selectedContentRatings.has(item.content_rating)
      );
    }

    return result;
  }, [
    allItems,
    searchQuery,
    selectedGenres,
    selectedYears,
    selectedContentRatings,
  ]);

  const total = data?.pages[0]?.total || 0;
  const hasActiveFilters =
    searchQuery ||
    selectedGenres.size > 0 ||
    selectedYears.size > 0 ||
    selectedContentRatings.size > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link to="/dashboard" className={styles.backLink}>
          &larr;
        </Link>
        <h1 className={styles.title}>
          {title}
          {total > 0 && (
            <span className={styles.count}>
              ({hasActiveFilters ? `${filteredItems.length} / ${total}` : total}
              )
            </span>
          )}
        </h1>
      </header>

      <LibraryFilters
        items={allItems}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedGenres={selectedGenres}
        onGenresChange={setSelectedGenres}
        selectedYears={selectedYears}
        onYearsChange={setSelectedYears}
        selectedContentRatings={selectedContentRatings}
        onContentRatingsChange={setSelectedContentRatings}
      />

      <main className={styles.main}>
        <MediaGrid
          items={filteredItems}
          serverName={serverName}
          clientIdentifier={clientIdentifier}
          isLoading={isLoading}
          hasMore={hasNextPage && !hasActiveFilters}
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

export function MoviesPage() {
  return <LibraryPage title="Movies" />;
}

export function ShowsPage() {
  return <LibraryPage title="TV Shows" />;
}
