export interface IWebhookPayloadDto {
  source: string;
  type: string;
  data: Record<string, unknown>;
  idempotencyKey?: string;
}