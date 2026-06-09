import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Zod schema for all required environment variables.
 * Validates at import-time so the server fails fast on misconfiguration.
 */
const envSchema = z.object({
  // ─── Server ───
  PORT: z
    .string()
    .default('3001')
    .transform(Number)
    .pipe(z.number().int().positive()),
  WS_PORT: z
    .string()
    .default('3002')
    .transform(Number)
    .pipe(z.number().int().positive()),

  // ─── Database ───
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid connection string' }),

  // ─── Blockchain ───
  RPC_URL: z.string().url({ message: 'RPC_URL must be a valid URL' }),

  // ─── Contract Addresses ───
  FACTORY_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'FACTORY_ADDRESS must be a valid Ethereum address'),
  DISTRIBUTION_AMM_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'DISTRIBUTION_AMM_ADDRESS must be a valid Ethereum address'),
  ROUTER_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'ROUTER_ADDRESS must be a valid Ethereum address'),
  USDC_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'USDC_ADDRESS must be a valid Ethereum address'),

  // ─── Goldsky (optional for local dev) ───
  GOLDSKY_GRAPHQL_ENDPOINT: z.string().optional().default(''),
  GOLDSKY_WEBHOOK_SECRET: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

/**
 * Typed, validated configuration object.
 * Import this instead of reading `process.env` directly.
 */
export const config = parsed.data;
