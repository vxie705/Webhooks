import { Test, TestingModule } from '@nestjs/testing';
import { HttpClientService, HttpDeliveryError } from '../src/delivery/http-client.service';

describe('HttpClientService', () => {
  let service: HttpClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HttpClientService],
    }).compile();

    service = module.get<HttpClientService>(HttpClientService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance without errors', () => {
      expect(service).toBeDefined();
    });
  });

  describe('validateUrl()', () => {
    it('should accept valid HTTP URLs', () => {
      expect(() => {
        (service as any).validateUrl('http://example.com');
      }).not.toThrow();
    });

    it('should accept valid HTTPS URLs', () => {
      expect(() => {
        (service as any).validateUrl('https://example.com');
      }).not.toThrow();
    });

    it('should reject invalid protocol', () => {
      expect(() => {
        (service as any).validateUrl('ftp://example.com');
      }).toThrow();
    });

    it('should reject localhost', () => {
      expect(() => {
        (service as any).validateUrl('http://localhost:3000');
      }).toThrow();
    });

    it('should reject 127.0.0.1', () => {
      expect(() => {
        (service as any).validateUrl('http://127.0.0.1:3000');
      }).toThrow();
    });

    it('should reject AWS metadata endpoint', () => {
      expect(() => {
        (service as any).validateUrl('http://169.254.169.254/latest/meta-data/');
      }).toThrow();
    });

    it('should reject invalid URL', () => {
      expect(() => {
        (service as any).validateUrl('not-a-url');
      }).toThrow();
    });
  });

  describe('HttpDeliveryError', () => {
    it('should create error with statusCode and message', () => {
      const error = new HttpDeliveryError(404, 'Not Found');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Not Found');
      expect(error.name).toBe('HttpDeliveryError');
    });
  });
});