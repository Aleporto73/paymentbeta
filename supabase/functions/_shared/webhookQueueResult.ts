export const WEBHOOK_QUEUE_DEDUP_CONSTRAINT = "webhook_queue_tx_event_url_uidx";

export type EntitlementQueueStatus =
  | "queued"
  | "deduplicated"
  | "skipped_valid"
  | "failed_retryable";

export interface EntitlementQueueResult {
  status: EntitlementQueueStatus;
  queued: number;
  deduplicated: number;
  reason: string | null;
}

export const shouldRetryEntitlementQueue = (result: EntitlementQueueResult) =>
  result.status === "failed_retryable";

interface PostgresErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

const errorText = (error: PostgresErrorLike | null | undefined) =>
  [error?.message, error?.details, error?.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

/**
 * A generic 23505 is not enough: only the queue idempotency constraint is a
 * legitimate duplicate. Any other unique violation remains retryable because
 * it may represent an unrelated schema or data problem.
 */
export const isExpectedWebhookQueueDuplicate = (
  error: PostgresErrorLike | null | undefined,
) =>
  error?.code === "23505" &&
  errorText(error).includes(WEBHOOK_QUEUE_DEDUP_CONSTRAINT);

export const classifyWebhookQueueInsertError = (
  error: PostgresErrorLike | null | undefined,
): "deduplicated" | "failed_retryable" =>
  isExpectedWebhookQueueDuplicate(error) ? "deduplicated" : "failed_retryable";

export const queuedResult = (
  queued: number,
  deduplicated: number,
): EntitlementQueueResult => ({
  status: queued > 0 ? "queued" : "deduplicated",
  queued,
  deduplicated,
  reason: null,
});

export const skippedQueueResult = (reason: string): EntitlementQueueResult => ({
  status: "skipped_valid",
  queued: 0,
  deduplicated: 0,
  reason,
});

export const failedQueueResult = (
  reason: string,
  queued = 0,
  deduplicated = 0,
): EntitlementQueueResult => ({
  status: "failed_retryable",
  queued,
  deduplicated,
  reason,
});
