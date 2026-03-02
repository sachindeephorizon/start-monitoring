/**
 * Type shims for editing Supabase Edge Functions in TypeScript tooling (tsserver/tsc).
 * Runtime is Deno (Supabase Edge Functions), but the app's TS config excludes this folder.
 *
 * These shims are intentionally minimal and only cover what we use.
 */

declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined
  }
}

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: unknown
  ): void
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js"
}

declare module "https://deno.land/x/jose@v4.15.5/index.ts" {
  export function createRemoteJWKSet(url: URL): unknown
  export function createLocalJWKSet(jwks: unknown): unknown
  export function importPKCS8(pem: string, alg: string): Promise<unknown>
  export class SignJWT {
    constructor(payload: unknown)
    setProtectedHeader(header: unknown): this
    setIssuer(iss: string): this
    setAudience(aud: string): this
    setIssuedAt(iat?: number): this
    setExpirationTime(exp: number | string): this
    sign(key: unknown): Promise<string>
  }
  export function jwtVerify(
    jwt: string,
    key: unknown,
    options?: unknown
  ): Promise<{ payload: unknown }>
}

