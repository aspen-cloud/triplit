import { TriplitError } from '@triplit/entity-db';

// For some reason in cloudflare workers instanceof doesn't work for custom errors
// I think this might be related to the nature of how we bundle and deploy
// Fallback to checking for a property as a backup
export function isTriplitError(e: any): e is TriplitError {
  return e instanceof TriplitError || e?.__isTriplitError === true;
}
