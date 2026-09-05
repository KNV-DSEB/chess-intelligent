import { loadRootEnvironment, readApiEnvironment } from '@chess-intelligent/config';
import { PgDatabase, runMigrations } from '@chess-intelligent/db';

import { buildApp } from './app';
import { DisabledEmailDeliveryProvider, SmtpEmailDeliveryProvider } from './email-delivery';

loadRootEnvironment();
const environment = readApiEnvironment();
const database = new PgDatabase(environment.DATABASE_URL, {
  maxConnections: environment.DB_POOL_MAX,
  connectionTimeoutMillis: environment.DB_CONNECTION_TIMEOUT_MS,
  statementTimeoutMillis: environment.DB_STATEMENT_TIMEOUT_MS,
  applicationName: 'chess-intelligent-api',
  onPoolError: (error) => {
    const code =
      'code' in error && typeof error.code === 'string' ? error.code : 'POSTGRES_POOL_ERROR';
    process.stderr.write(
      `${JSON.stringify({ level: 'error', event: 'postgres_pool_error', code })}\n`,
    );
  },
});
const emailDelivery = environment.SMTP_ENABLED
  ? new SmtpEmailDeliveryProvider({
      host: environment.SMTP_HOST!,
      port: environment.SMTP_PORT,
      secure: environment.SMTP_SECURE,
      requireTls: environment.SMTP_REQUIRE_TLS,
      username: environment.SMTP_USERNAME,
      password: environment.SMTP_PASSWORD,
      from: environment.EMAIL_FROM!,
      publicWebBaseUrl: environment.PUBLIC_WEB_BASE_URL,
    })
  : new DisabledEmailDeliveryProvider();

try {
  if (environment.AUTO_MIGRATE) await runMigrations(database);
  const app = await buildApp({
    database,
    webOrigins: environment.WEB_ORIGINS,
    logger: true,
    manageDatabaseLifecycle: true,
    secureCookies: environment.AUTH_COOKIE_SECURE,
    internalDevRoutes: environment.INTERNAL_DEV_ROUTES,
    trustProxy: environment.TRUST_PROXY,
    emailDelivery,
  });
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
} catch (error) {
  await database.close();
  throw error;
}
