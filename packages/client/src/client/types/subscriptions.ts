export type SubscribeBackgroundOptions = { onError?: ErrorCallback };

export type ErrorCallback = (error: Error) => void | Promise<void>;
