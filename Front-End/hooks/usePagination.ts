// hooks/usePagination.ts
import { useState, useMemo, useCallback, useEffect } from 'react'

export const DOTS = '...' as const
type PageItem = number | typeof DOTS

export interface UsePaginationOptions<T> {
  data: T[]
  itemsPerPage?: number
  initialPage?: number
  siblingCount?: number
  resetDeps?: unknown[]
}

export interface UsePaginationReturn<T> {
  currentPage: number
  totalPages: number
  totalItems: number
  paginatedData: T[]
  pageRange: PageItem[]
  goToPage: (page: number) => void
  goToNext: () => void
  goToPrev: () => void
  canGoNext: boolean
  canGoPrev: boolean
  isFirstPage: boolean
  isLastPage: boolean
  startIndex: number
  endIndex: number
}

function buildPageRange(
  currentPage: number,
  totalPages: number,
  siblingCount: number
): PageItem[] {
  const totalButtons = siblingCount * 2 + 5 // siblings + current + 2 edges + 2 dots

  if (totalPages <= totalButtons) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const leftSibling = Math.max(currentPage - siblingCount, 1)
  const rightSibling = Math.min(currentPage + siblingCount, totalPages)

  const showLeftDots = leftSibling > 2
  const showRightDots = rightSibling < totalPages - 1

  if (!showLeftDots && showRightDots) {
    const leftRange = Array.from({ length: 3 + 2 * siblingCount }, (_, i) => i + 1)
    return [...leftRange, DOTS, totalPages]
  }

  if (showLeftDots && !showRightDots) {
    const rightCount = 3 + 2 * siblingCount
    const rightRange = Array.from(
      { length: rightCount },
      (_, i) => totalPages - rightCount + i + 1
    )
    return [1, DOTS, ...rightRange]
  }

  const middleRange = Array.from(
    { length: rightSibling - leftSibling + 1 },
    (_, i) => leftSibling + i
  )
  return [1, DOTS, ...middleRange, DOTS, totalPages]
}

export function usePagination<T>({
  data,
  itemsPerPage = 10,
  initialPage = 1,
  siblingCount = 1,
  resetDeps = [],
}: UsePaginationOptions<T>): UsePaginationReturn<T> {
  const [currentPage, setCurrentPage] = useState(initialPage)

  // Reset to page 1 when filters/search/tabs change
  useEffect(() => {
    setCurrentPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps)

  const totalPages = Math.max(1, Math.ceil(data.length / itemsPerPage))

  // Guard against page going out of bounds (e.g. data shrinks)
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return data.slice(start, start + itemsPerPage)
  }, [data, currentPage, itemsPerPage])

  const pageRange = useMemo(
    () => buildPageRange(currentPage, totalPages, siblingCount),
    [currentPage, totalPages, siblingCount]
  )

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.min(Math.max(page, 1), totalPages)
      setCurrentPage(clamped)
    },
    [totalPages]
  )

  const goToNext = useCallback(() => goToPage(currentPage + 1), [goToPage, currentPage])
  const goToPrev = useCallback(() => goToPage(currentPage - 1), [goToPage, currentPage])

  const startIndex = (currentPage - 1) * itemsPerPage + 1
  const endIndex = Math.min(currentPage * itemsPerPage, data.length)

  return {
    currentPage,
    totalPages,
    totalItems: data.length,
    paginatedData,
    pageRange,
    goToPage,
    goToNext,
    goToPrev,
    canGoNext: currentPage < totalPages,
    canGoPrev: currentPage > 1,
    isFirstPage: currentPage === 1,
    isLastPage: currentPage === totalPages,
    startIndex,
    endIndex,
  }
}