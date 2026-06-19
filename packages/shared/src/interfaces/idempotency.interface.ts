export interface IIdempotencyEntry {
  idempotencyKey: string;
  eventId: string;
  ttl: number;
  createdAt: string;
}