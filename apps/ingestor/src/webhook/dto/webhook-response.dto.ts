export class WebhookResponseDto {
  status: 'accepted' | 'duplicate' | 'error';
  id: string;
}