import * as Joi from 'joi';

export const ConfigSchema = Joi.object({
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  INGESTOR_PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error')
    .default('info'),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
});