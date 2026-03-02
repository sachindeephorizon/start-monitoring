// Supabase Edge Function: send_push_notification
// Sends Expo push notifications to a user's registered devices.
//
// Production notes:
// - This function is designed to be called by your dashboard/backend when an agent initiates a call.
// - For service-to-service security, set `INTERNAL_NOTIFICATIONS_SECRET` in Supabase Function env and
//   send the same value in `x-internal-secret` header.
// - As a fallback (useful for testing), if `Authorization: Bearer <user_jwt>` is provided, the caller
//   may only target themselves (targetUserId must equal auth user id).
//
// References:
// - Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type NotificationType =
  | "emergency"
  | "check_in"
  | "chat"
  | "incoming_call"
  | "tracking_checkin"
  | "tracking_alert"
  | "general";

type Priority = "high" | "normal";

type RequestBody = {
  targetUserId: string;
  type: NotificationType;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | "siren.mp3" | "none";
  priority?: Priority;
  // Android: expo push supports channelId which maps to `expo-notifications` channel.
  channelId?: "emergency" | "calls" | "check_ins" | "chat" | "general";
};

type ExpoPushMessage = {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: string;
  priority?: Priority;
  channelId?: string;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isUuidLike(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10;
}

function applyDefaults(input: RequestBody): Required<Pick<RequestBody, "sound" | "priority" | "channelId">> {
  if (input.type === "incoming_call") {
    return {
      sound: input.sound ?? "default",
      priority: input.priority ?? "high",
      channelId: input.channelId ?? "calls",
    };
  }
  if (input.type === "emergency") {
    // Custom sound must exist in app bundle (app.json expo-notifications plugin already includes siren.mp3)
    return {
      sound: input.sound ?? "siren.mp3",
      priority: input.priority ?? "high",
      channelId: input.channelId ?? "emergency",
    };
  }
  if (input.type === "check_in" || input.type === "tracking_checkin") {
    return {
      sound: input.sound ?? "default",
      priority: input.priority ?? "high",
      channelId: input.channelId ?? "check_ins",
    };
  }
  if (input.type === "tracking_alert") {
    // Safety-critical: tracking alerts should be high priority
    return {
      sound: input.sound ?? "default",
      priority: input.priority ?? "high",
      channelId: input.channelId ?? "general",
    };
  }
  if (input.type === "chat") {
    return {
      sound: input.sound ?? "default",
      priority: input.priority ?? "normal",
      channelId: input.channelId ?? "chat",
    };
  }
  return {
    sound: input.sound ?? "default",
    priority: input.priority ?? "normal",
    channelId: input.channelId ?? "general",
  };
}

async function readUserTokens(supabaseAdmin: any, userId: string): Promise<string[]> {
  // Keep in sync with mobile fallback behavior: user_devices -> user_agent_map
  const trySelect = async (table: string) => {
    return await supabaseAdmin
      .from(table)
      .select("token")
      .eq("user_id", userId);
  };

  let res = await trySelect("user_devices");
  if (res.error?.code === "PGRST205") {
    res = await trySelect("user_agent_map");
  }
  if (res.error) {
    throw new Error(res.error.message || "Failed to load device tokens");
  }
  const tokens = (res.data ?? [])
    .map((r: any) => r?.token)
    .filter((t: any) => typeof t === "string" && t.length > 0);
  return Array.from(new Set(tokens));
}

async function deleteDeadToken(supabaseAdmin: any, userId: string, token: string): Promise<void> {
  const tryDelete = async (table: string) => {
    return await supabaseAdmin.from(table).delete().eq("user_id", userId).eq("token", token);
  };
  let res = await tryDelete("user_devices");
  if (res.error?.code === "PGRST205") {
    res = await tryDelete("user_agent_map");
  }
  // Ignore errors here; cleanup is best-effort.
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<any> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave as null
  }
  if (!res.ok) {
    throw new Error(`Expo push send failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return json;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<RequestBody>;

    if (!isUuidLike(body.targetUserId)) {
      return json(400, { success: false, error: "Missing or invalid targetUserId" });
    }
    if (!body.type || typeof body.type !== "string") {
      return json(400, { success: false, error: "Missing notification type" });
    }

    const internalSecret = req.headers.get("x-internal-secret") || "";
    const expectedSecret = Deno.env.get("INTERNAL_NOTIFICATIONS_SECRET") || "";
    const authHeader = req.headers.get("Authorization") || "";

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Authorization:
    // - If internal secret is configured, require it for service-to-service calls.
    // - Otherwise, allow user JWT but only to self.
    if (expectedSecret) {
      if (!internalSecret || internalSecret !== expectedSecret) {
        return json(401, { success: false, error: "Unauthorized" });
      }
    } else if (authHeader) {
      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data, error } = await supabaseUser.auth.getUser();
      if (error || !data?.user) {
        return json(401, { success: false, error: "Unauthorized" });
      }
      if (data.user.id !== body.targetUserId) {
        return json(403, { success: false, error: "Forbidden" });
      }
    } else {
      return json(401, { success: false, error: "Unauthorized" });
    }

    const defaults = applyDefaults(body as RequestBody);
    const data: Record<string, unknown> = {
      ...(typeof body.data === "object" && body.data ? body.data : {}),
      type: body.type,
    };

    const tokens = await readUserTokens(supabaseAdmin, body.targetUserId);
    if (!tokens.length) {
      return json(200, { success: true, delivered: 0, reason: "no_tokens" });
    }

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      title: body.title,
      body: body.body,
      data,
      sound: defaults.sound === "none" ? undefined : defaults.sound,
      priority: defaults.priority,
      channelId: defaults.channelId,
    }));

    const expoResult = await sendExpoPush(messages);

    // Best-effort cleanup: remove tokens that Expo marks as invalid.
    // Expo response format: { data: [{ status: 'ok' | 'error', details?: { error: 'DeviceNotRegistered' } }], errors?: [] }
    const receipts = Array.isArray(expoResult?.data) ? expoResult.data : [];
    for (let i = 0; i < receipts.length; i++) {
      const r = receipts[i];
      const token = tokens[i];
      const err = r?.details?.error;
      if (err === "DeviceNotRegistered" && token) {
        deleteDeadToken(supabaseAdmin, body.targetUserId, token).catch(() => {});
      }
    }

    return json(200, {
      success: true,
      delivered: messages.length,
      expo: expoResult,
    });
  } catch (error: any) {
    console.error("[send_push_notification] error:", error);
    return json(500, { success: false, error: error?.message || "Unexpected error" });
  }
});

