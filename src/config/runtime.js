export function loadRuntimeConfig(env=process.env) {
  const production=env.NODE_ENV==='production', demo=env.HFN_DEMO_MODE==='true' || (!production && env.HFN_DEMO_MODE!=='false');
  const config={ production, demo, port:Number(env.PORT ?? 4173), databaseUrl:env.DATABASE_URL, webhookSecret:env.ARIVE_WEBHOOK_SECRET };
  if (production) { const missing=['DATABASE_URL','ARIVE_WEBHOOK_SECRET'].filter(name=>!env[name]); if(missing.length) throw new Error(`Production configuration missing: ${missing.join(', ')}`); if(demo) throw new Error('HFN_DEMO_MODE must not be enabled in production'); }
  return config;
}
