/**
 * JSON serializable Triplit error object.
 */
export interface ITriplitError extends Error {
  status: number;
  baseMessage: string;
  contextMessage?: string;
}
