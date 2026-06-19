import { IsString, IsObject, IsOptional } from 'class-validator';

export class WebhookRequestDto {
  @IsString()
  source: string;

  @IsString()
  type: string;

  @IsObject()
  data: Record<string, unknown>;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}