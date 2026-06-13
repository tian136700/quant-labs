"use client";

import { useEffect, useState } from "react";
import { isStoreReviewSubdomainHost } from "@/lib/store-review-host";

export function useStoreReviewSubdomain(): boolean {
  const [onSubdomain, setOnSubdomain] = useState(
    () =>
      typeof window !== "undefined" &&
      isStoreReviewSubdomainHost(window.location.hostname)
  );

  useEffect(() => {
    setOnSubdomain(isStoreReviewSubdomainHost(window.location.hostname));
  }, []);

  return onSubdomain;
}
