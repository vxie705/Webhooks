const mockPinoLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
};

jest.mock('pino', () => {
  return jest.fn(() => mockPinoLogger);
});

describe('PinoLoggerService', () => {
  let PinoLoggerService: any;

  beforeAll(async () => {
    const module = await import('../src/common/logger/pino-logger.service');
    PinoLoggerService = module.PinoLoggerService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call pino.info on log()', () => {
    const logger = new PinoLoggerService();
    logger.log('test message');
    expect(mockPinoLogger.info).toHaveBeenCalledWith(undefined, 'test message');
  });

  it('should call pino.error on error()', () => {
    const logger = new PinoLoggerService();
    logger.error('error message', 'stack trace');
    expect(mockPinoLogger.error).toHaveBeenCalledWith(
      { trace: 'stack trace' },
      'error message',
    );
  });

  it('should call pino.debug on debug()', () => {
    const logger = new PinoLoggerService();
    logger.debug('debug info');
    expect(mockPinoLogger.debug).toHaveBeenCalled();
  });
});