# Configurar los correos de confirmación

La aplicación está preparada para intentar enviar un correo al email de la cuenta que haya iniciado sesión **cuando se registra un parte nuevo**. Editar un parte o cambiar su estado no envía otro correo.

## 1. Crear una clave de correo en Resend

1. Crea una cuenta en https://resend.com/
2. Crea una API key para enviar emails y guárdala como secreto.
3. En Resend, verifica un dominio remitente que controles (Domains).
4. Usa un remitente de ese dominio, por ejemplo: `Gestión de flota <incidencias@tudominio.com>`.

Para pruebas, Resend puede limitar los destinatarios si el dominio no está verificado; consulta sus condiciones actuales antes de probar con otro correo.

## 2. Crear la Edge Function en Supabase

1. Abre el proyecto en https://supabase.com/dashboard
2. Ve a **Edge Functions** y elige **Deploy a new function → Via Editor**.
3. Pon exactamente el nombre `send-incident-confirmation`.
4. Sustituye el código de ejemplo por el contenido de [supabase/functions/send-incident-confirmation/index.ts](https://github.com/enekituss/gestion-incidencias-vehiculos/blob/main/supabase/functions/send-incident-confirmation/index.ts).
5. Despliega la función. Mantén activa la verificación de JWT/autenticación para que no sea una función pública.

## 3. Añadir los secretos de la función

En la configuración de secretos de Edge Functions, configura:

- `RESEND_API_KEY`: la clave secreta de API de Resend.
- `EMAIL_FROM`: un remitente permitido y verificado, por ejemplo `Gestión de flota <incidencias@tudominio.com>`.

**No introduzcas estas claves en `index.html`, en GitHub ni en el chat.** Supabase proporciona `SUPABASE_URL` y `SUPABASE_ANON_KEY` a las funciones. La función obtiene el destinatario de la sesión autenticada, no de un campo manipulable del navegador.

## 4. Probarlo

1. Abre https://enekituss.github.io/gestion-incidencias-vehiculos/
2. Inicia sesión con una cuenta cuyo email puedas consultar.
3. Registra un parte nuevo.
4. Comprueba la bandeja de entrada y la carpeta de spam.

La aplicación guarda el parte en Supabase antes de solicitar el email. Si el correo falla, el parte permanece registrado: no lo vuelvas a crear, revisa el error y la configuración de Resend.
