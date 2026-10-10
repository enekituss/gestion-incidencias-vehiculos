import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const scriptUrl = Deno.env.get("GOOGLE_APPS_SCRIPT_URL");
    const scriptToken = Deno.env.get("GOOGLE_APPS_SCRIPT_TOKEN");

    const authorization = request.headers.get("Authorization");
    if (!authorization?.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Inicia sesión para realizar esta acción." }, 401);
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: "Faltan las variables de autenticación de Supabase." }, 500);
    }

    const accessToken = authorization.slice(7).trim();
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    const user = userData?.user;
    if (userError || !user?.id) return json({ error: "Sesión no válida." }, 401);

    const requestBody = await request.json();
    const action = String(requestBody?.action || "");
    if (action !== "sync" && action !== "notify") {
      return json({ error: "Acción no válida." }, 400);
    }

    if (!scriptUrl || !scriptToken) {
      if (action === "sync") return json({ ok: true, skipped: true, configured: false });
      return json({
        ok: false,
        configured: false,
        error: "El email y la hoja de Google están preparados, pero falta desplegar Apps Script y configurar GOOGLE_APPS_SCRIPT_URL y GOOGLE_APPS_SCRIPT_TOKEN.",
      });
    }

    let scriptBody: Record<string, unknown>;
    if (action === "sync") {
      const snapshot = requestBody?.snapshot;
      if (!snapshot || !Array.isArray(snapshot.vehicles) || !Array.isArray(snapshot.incidents)) {
        return json({ error: "El formato de datos para la hoja no es válido." }, 400);
      }
      scriptBody = { token: scriptToken, action: "sync", snapshot };
    } else {
      const incident = requestBody?.incident;
      if (!incident || typeof incident.id !== "string" ||
          typeof incident.company !== "string" || typeof incident.vehicleId !== "string") {
        return json({ error: "Faltan datos obligatorios del parte." }, 400);
      }
      if (!user.email) return json({ error: "La cuenta no tiene un email verificado." }, 400);
      scriptBody = { token: scriptToken, action: "notify", recipient: user.email, incident };
    }

    const response = await fetch(scriptUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scriptBody),
    });
    const responseText = await response.text();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("Google Apps Script returned non-JSON", response.status, responseText.slice(0, 500));
      return json({ error: "La función de Google no devolvió una respuesta válida. Comprueba que la URL termina en /exec y el despliegue es accesible." }, 502);
    }
    if (!response.ok || result?.ok !== true) {
      console.error("Google Apps Script error", response.status, result);
      return json({ error: String(result?.error || "Google Apps Script no completó la acción.") }, 502);
    }
    return json({ ok: true, action, result });
  } catch (error) {
    console.error("send-incident-confirmation:", error);
    return json({ error: "Error interno al conectar con Google Sheets o enviar el email." }, 500);
  }
});
