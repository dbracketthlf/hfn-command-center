export function loadRuntimeConfig(env=process.env) {
  const production=env.NODE_ENV==='production', demo=env.HFN_DEMO_MODE==='true' || (!production && env.HFN_DEMO_MODE!=='false');
  const config={ production, demo, port:Number(env.PORT ?? 10000), databaseUrl:env.DATABASE_URL, webhookSecret:env.ARIVE_WEBHOOK_SECRET,microsoftClientId:env.MICROSOFT_CLIENT_ID,microsoftClientSecret:env.MICROSOFT_CLIENT_SECRET,microsoftTenantId:env.MICROSOFT_TENANT_ID,microsoftRedirectUri:env.MICROSOFT_REDIRECT_URI,sessionSecret:env.SESSION_SECRET };
  if (production) { const missing=['DATABASE_URL','ARIVE_WEBHOOK_SECRET','MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET','MICROSOFT_TENANT_ID','MICROSOFT_REDIRECT_URI','SESSION_SECRET'].filter(name=>!env[name]); if(missing.length) throw new Error(`Production configuration missing: ${missing.join(', ')}`); if(demo) throw new Error('HFN_DEMO_MODE must not be enabled in production'); }
  return config;
}

/** Render's private PostgreSQL endpoint uses a managed/self-signed CA. This is scoped to pg only; Node TLS remains globally strict. */
export function postgresPoolOptions(config) {
  return { connectionString:config.databaseUrl, ssl:config.production ? { rejectUnauthorized:false } : undefined };
}

/** External Render test databases use Render-managed TLS. Keep this strict and scoped to integration tests. */
export function postgresTestClientOptions(databaseUrl) {
  if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required');
  const url=new URL(databaseUrl),sslmode=String(url.searchParams.get('sslmode')??'').toLowerCase();
  if(sslmode==='disable')throw new Error('TEST_DATABASE_URL must not disable TLS');
  // pg lets URL SSL parameters overwrite the explicit ssl object. The external
  // Render certificate is publicly trusted, so negotiate TLS explicitly and
  // retain normal certificate verification.
  url.searchParams.delete('sslmode');
  return {connectionString:url.toString(),ssl:{rejectUnauthorized:true}};
}

/**
 * Explicit operator DATABASE_URL commands use a verified external connection.
 * Unlike the web-service pool, they must never infer TLS behavior from NODE_ENV
 * or an optional URL sslmode parameter.
 */
export function postgresOperatorPoolOptions(config) {
  if(!config?.databaseUrl)throw new Error('DATABASE_URL is required');
  return postgresTestClientOptions(config.databaseUrl);
}

/**
 * Migrations normally run beside the service against Render's internal URL.
 * An operator may explicitly opt into strict external TLS when running the
 * migration command from outside Render; never infer that from NODE_ENV/URL.
 */
export function postgresMigrationPoolOptions(config,{external=false}={}) {
  return external
    ? postgresOperatorPoolOptions(config)
    : postgresPoolOptions(config);
}
