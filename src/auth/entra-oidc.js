import { createHash, randomBytes } from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const redactMicrosoftDiagnostic=(value,sensitive=[])=>{let diagnostic=String(value??'');for(const secret of sensitive.filter(Boolean))diagnostic=diagnostic.replaceAll(secret,'[redacted]');return diagnostic.replace(/\b((?:client[_\s-]?secret|authorization[_\s-]?code|code|access[_\s-]?token|id[_\s-]?token|refresh[_\s-]?token))\s*(?:[=:]|\bis\b)\s*['"]?[^\s,;&'"]+/gi,'$1=[redacted]').replace(/\bBearer\s+[^\s]+/gi,'Bearer [redacted]').replace(/\beyJ[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+){1,2}\b/g,'[redacted-token]').slice(0,1000);};
const tokenExchangeError=async(response,sensitive)=>{
  let detail={};
  try { detail=await response.json(); } catch { /* Microsoft may return a non-JSON error body. Do not log it. */ }
  const error=new Error('Microsoft token exchange failed');
  error.name='EntraTokenExchangeError';
  error.safeAuthDiagnostic={provider:'microsoft',httpStatus:response.status,error:redactMicrosoftDiagnostic(detail?.error,sensitive),errorDescription:redactMicrosoftDiagnostic(detail?.error_description,sensitive)};
  return error;
};
export const normalizeEmail=value=>String(value??'').trim().toLowerCase();
export const parseCookies=header=>Object.fromEntries(String(header??'').split(';').map(part=>part.trim().split('=').map(decodeURIComponent)).filter(([key])=>key));
export const secureCookie=(name,value,{production,maxAge=0}={})=>`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${production?'; Secure':''}${maxAge?`; Max-Age=${maxAge}`:''}`;
export class EntraOidcAuth {
  constructor({repository,config,fetchImpl=fetch}){this.repository=repository;this.config=config;this.fetch=fetchImpl;this.base=`https://login.microsoftonline.com/${config.microsoftTenantId}/oauth2/v2.0`;this.sessionHash=value=>digest(`${config.sessionSecret}:${value}`);}
  async loginUrl(){const state=random(),nonce=random(),verifier=random(),challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');await this.repository.createOidcLoginState({stateHash:digest(state),codeVerifier:verifier,nonce,expiresAt:new Date(Date.now()+600000).toISOString()});const p=new URLSearchParams({client_id:this.config.microsoftClientId,response_type:'code',redirect_uri:this.config.microsoftRedirectUri,response_mode:'query',scope:'openid profile email',state,nonce,code_challenge:challenge,code_challenge_method:'S256'});return `${this.base}/authorize?${p}`;}
  async complete({state,code}){const saved=await this.repository.consumeOidcLoginState(digest(state));if(!saved||new Date(saved.expires_at)<new Date())throw new Error('Invalid or expired sign-in state');const body=new URLSearchParams({client_id:this.config.microsoftClientId,client_secret:this.config.microsoftClientSecret,grant_type:'authorization_code',code,redirect_uri:this.config.microsoftRedirectUri,code_verifier:saved.code_verifier}).toString();const token=await this.fetch(`${this.base}/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});if(!token.ok)throw await tokenExchangeError(token,[this.config.microsoftClientSecret,code,saved.code_verifier]);const tokens=await token.json(),profile=await this.fetch('https://graph.microsoft.com/oidc/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`}});if(!profile.ok)throw new Error('Microsoft user profile lookup failed');const identity=await profile.json(),email=normalizeEmail(identity.email??identity.preferred_username);const employee=email&&await this.repository.findActiveEmployeeByEmail(email);if(!employee)throw new Error('Your Microsoft account is not authorized for HFN Command Center');const sessionToken=random();await this.repository.createSession({sessionHash:this.sessionHash(sessionToken),employeeId:employee.id,expiresAt:new Date(Date.now()+8*3600000).toISOString()});return {sessionToken,employee};}
  async session(cookies){return cookies?.hfn_session?this.repository.findSessionByHash(this.sessionHash(cookies.hfn_session)):null;}
  async logout(cookies){if(cookies?.hfn_session)await this.repository.deleteSession(this.sessionHash(cookies.hfn_session));}
}
