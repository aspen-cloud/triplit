import type { SubscriptionSignalPayload, SubscriptionOptions } from './types';
import type { Models, SchemaQuery } from '@triplit/db';

export type EnabledSubscriptionOptions = SubscriptionOptions & {
  enabled?: boolean;
};

/**
 * Returns the disabled state for a subscription when enabled = false
 */
export function getDisabledSubscriptionState<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
>(): SubscriptionSignalPayload<M, Q> {
  return {
    results: undefined,
    fetching: false,
    fetchingLocal: false,
    fetchingRemote: false,
    error: undefined,
  };
}

/**
 * Returns the initial loading state for a subscription when enabled = true
 */
export function getInitialSubscriptionState<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
>(): SubscriptionSignalPayload<M, Q> {
  return {
    results: undefined,
    fetching: true,
    fetchingLocal: true,
    fetchingRemote: false,
    error: undefined,
  };
}

/**
 * Checks if a subscription should be enabled based on options
 */
export function isSubscriptionEnabled(
  options?: Partial<EnabledSubscriptionOptions>
): boolean {
  return options?.enabled !== false;
}

/**
 * Returns the appropriate initial state based on whether the subscription is enabled
 */
export function getInitialState<M extends Models<M>, Q extends SchemaQuery<M>>(
  options?: Partial<EnabledSubscriptionOptions>
): SubscriptionSignalPayload<M, Q> {
  return isSubscriptionEnabled(options)
    ? getInitialSubscriptionState<M, Q>()
    : getDisabledSubscriptionState<M, Q>();
}
