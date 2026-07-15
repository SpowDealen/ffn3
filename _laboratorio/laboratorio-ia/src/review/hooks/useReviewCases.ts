import {useEffect, useState} from "react";
import type {ReviewCase} from "../types";
import {getReviewCases, subscribeToReviewCases} from "../store/reviewStore";

export function useReviewCases(): ReviewCase[] {
  const [reviewCases, setReviewCases] = useState<ReviewCase[]>(() =>
    typeof window === "undefined" ? [] : getReviewCases(),
  );

  useEffect(() => {
    const update = (): void => setReviewCases(getReviewCases());
    update();
    return subscribeToReviewCases(update);
  }, []);

  return reviewCases;
}
