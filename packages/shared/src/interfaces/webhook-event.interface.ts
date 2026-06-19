export interface IWebhookEvent {
  id: string;
  source: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
  idempotencyKey: string;
  signature?: string;
  attempt?: number;
}