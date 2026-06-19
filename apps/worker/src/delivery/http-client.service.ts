import { Injectable, Logger } from '@nestjs/common';
import * as axios from 'axios';

export class HttpDeliveryError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpDeliveryError';
  }
}

@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);
  private readonly httpClient: any;

  private readonly ALLOWED_SCHEMES = ['http', 'https'];
  private readonly BLOCKED_HOSTS = [
    'localhost',
    '127.0.0.1',
    '169.254.169.254',
    'metadata.google.internal',
  ];

  constructor() {
    const timeout = parseInt(process.env.HTTP_TIMEOUT_MS ?? '5000', 10);

    this.httpClient = axios.create({
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.httpClient.interceptors.request.use((config: any) => {
      this.logger.debug(`HTTP ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });
  }

  async post(url: string, data: unknown): Promise<{ status: number }> {
    this.validateUrl(url);

    try {
      const response: any = await this.httpClient.post(url, data);
      return { status: response.status };
    } catch (error) {
      if (this.isAxiosError(error)) {
        const axiosError = error as any;
        const status = axiosError.response?.status ?? 0;
        const message = axiosError.message;
        throw new HttpDeliveryError(status, message);
      }
      throw error;
    }
  }

  private validateUrl(url: string): void {
    const parsed = new URL(url);

    if (!this.ALLOWED_SCHEMES.includes(parsed.protocol.replace(':', ''))) {
      throw new Error(`Invalid protocol: ${parsed.protocol}`);
    }

    if (this.BLOCKED_HOSTS.includes(parsed.hostname)) {
      throw new Error(`Blocked host: ${parsed.hostname}`);
    }
  }

  private isAxiosError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as any).isAxiosError === true;
  }
}
