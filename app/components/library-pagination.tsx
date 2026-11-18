import { useEffect, useState } from "react";
import { useNavigate, useNavigation } from "react-router";
import { Pagination } from "@cloudflare/kumo/components/pagination";
import { Loader } from "@cloudflare/kumo/components/loader";

export function LibraryPagination({
  page,
  hasMore,
  toPage,
}: {
  page: number;
  hasMore: boolean;
  toPage: (page: number) => string;
}) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const requestedPage =
    Number(new URLSearchParams(navigation.location?.search).get("page")) || 1;
  const pending =
    navigation.state === "loading" &&
    requestedPage !== page &&
    navigation.location.pathname + navigation.location.search ===
      toPage(requestedPage);
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    if (!pending) {
      setShowLoading(false);
      return;
    }
    const timer = setTimeout(() => setShowLoading(true), 150);
    return () => clearTimeout(timer);
  }, [pending, requestedPage]);

  return (
    <Pagination
      className="library-pagination"
      page={page}
      hasNextPage={hasMore}
      labels={{ navigation: "Library pages" }}
      setPage={(nextPage) => {
        if (pending || nextPage === page || nextPage < 1) return;
        if (nextPage > page && !hasMore) return;
        void navigate(toPage(nextPage));
      }}
    >
      <Pagination.Info className="library-pagination-info">
        {() => (
          <span role="status" aria-live="polite" aria-atomic="true">
            {pending && showLoading ? (
              <>
                <span aria-hidden="true">
                  <Loader size="sm" />
                </span>
                Loading page {requestedPage}…
              </>
            ) : (
              <>Page {page}</>
            )}
          </span>
        )}
      </Pagination.Info>
      <fieldset className="library-pagination-controls" disabled={pending}>
        <legend className="sr-only">Change library page</legend>
        <Pagination.Controls controls="simple" />
      </fieldset>
    </Pagination>
  );
}
