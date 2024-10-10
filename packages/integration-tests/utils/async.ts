/**
 *
 * @param ms [ms=100] - The number of milliseconds to pause
 */
export const pause = async (ms: number = 100) =>
  new Promise((resolve) => setTimeout(resolve, ms));
