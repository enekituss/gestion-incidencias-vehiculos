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

const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: unknown) =>
  String(value ?? "—").replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Método no permitido." }, 405);
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("EMAIL_FROM");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!resendApiKey || !emailFrom) {
      return json({
        error: "Falta configurar RESEND_API_KEY y EMAIL_FROM en los secretos de la función.",
      }, 500);
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: "La función no tiene configuradas las variables de Supabase." }, 500);
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization?.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Inicia sesión para enviar la confirmación." }, 401);
    }

    const accessToken = authorization.slice(7).trim();
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    const user = userData?.user;
    if (userError || !user?.email) {
      return json({ error: "No se ha podido verificar el usuario o no tiene email." }, 401);
    }

    const body = await request.json();
    const incident = body?.incident;
    if (!incident || typeof incident.id !== "string" ||
        typeof incident.company !== "string" || typeof incident.vehicleId !== "string") {
      return json({ error: "Faltan datos obligatorios del parte." }, 400);
    }

    // El destinatario se obtiene de la sesión autenticada, nunca de un email enviado por el navegador.
    const createdAt = incident.createdAt ? new Date(incident.createdAt) : new Date();
    const dateLabel = Number.isNaN(createdAt.getTime())
      ? "No disponible"
      : createdAt.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });

    const details = [
      ["Número de parte", incident.id],
      ["Empresa", incident.company],
      ["Vehículo", incident.vehicleId],
      ["Categoría", incident.category],
      ["Subcategoría", incident.subcategory],
      ["Prioridad", incident.priority],
      ["Estado", incident.status || "Abierta"],
      ["Fecha de registro", dateLabel],
    ].filter((entry) => entry[1] != null && String(entry[1]).trim() !== "");

    const rows = details.map(([label, value]) =>
      `<tr><td style="padding:10px 12px;border-bottom:1px solid #e6edf3;color:#64748b;width:38%">${escapeHtml(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #e6edf3;color:#142a3e;font-weight:600">${escapeHtml(value)}</td></tr>`
    ).join("");

    const description = String(incident.description || "").trim();
    const descriptionHtml = description
      ? `<h3 style="font-size:14px;color:#142a3e;margin:22px 0 8px">Descripción</h3><p style="white-space:pre-wrap;line-height:1.55;color:#40566b;margin:0">${escapeHtml(description)}</p>`
      : "";

    const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#142a3e;padding:24px">
      <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e2eaf1;border-radius:14px;overflow:hidden">
        <div style="background:#17364f;color:#fff;padding:24px 26px">
          <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#bfddf2">Gestión de flota</div>
          <h1 style="font-size:22px;line-height:1.25;margin:10px 0 0">Parte registrado correctamente</h1>
        </div>
        <div style="padding:24px 26px">
          <p style="line-height:1.55;color:#40566b;margin-top:0">Se ha registrado un nuevo parte de incidencia. Guarda este correo como confirmación del registro.</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table>
          ${descriptionHtml}
          <p style="font-size:11px;line-height:1.5;color:#8291a1;margin:24px 0 0">Este mensaje es una confirmación automática. Los cambios posteriores de estado no generan otro correo.</p>
        </div>
      </div>
    </body></html>`;

    const text = [
      "PARTE REGISTRADO CORRECTAMENTE",
      "",
      ...details.map(([label, value]) => `${label}: ${String(value)}`),
      description ? `\nDescripción:\n${description}` : "",
      "",
      "Confirmación automática del registro del parte.",
    ].filter(Boolean).join("\n");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [user.email],
        subject: `Confirmación de parte ${incident.id} · vehículo ${incident.vehicleId}`,
        html,
        text,
      }),
    });

    const emailResult = await emailResponse.json().catch(() => ({}));
    if (!emailResponse.ok) {
      console.error("Resend error:", emailResponse.status, emailResult);
      return json({ error: "El proveedor de correo no ha aceptado el envío. Revisa el dominio remitente y RESEND_API_KEY." }, 502);
    }

    return json({ ok: true, to: user.email, id: emailResult?.id ?? null });
  } catch (error) {
    console.error("send-incident-confirmation:", error);
    return json({ error: "Error interno al preparar el correo de confirmación." }, 500);
  }
});
