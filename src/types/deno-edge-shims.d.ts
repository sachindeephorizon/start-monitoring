// TypeScript editor shims for Supabase Edge Functions (Deno runtime).
// These files live under `supabase/functions/**` which is not part of the RN app build,
// but developers often open them in the editor. TS (Node) doesn't understand URL imports
// or the global `Deno` namespace, so we provide minimal declarations to avoid TS2307.

declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined
  }
}

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: {
      port?: number
      hostname?: string
      onListen?: (params: { hostname: string; port: number }) => void
    }
  ): void
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js"
}

// Used by other Edge Functions in this repo.
// We keep these as `any` to avoid pulling Node deps just for editor typing.
declare module "https://deno.land/x/jose@v4.15.5/index.ts" {
  export const createRemoteJWKSet: any
  export const jwtVerify: any
}

