# Google Sheets y correos de confirmación (gratis)

La integración está preparada para que Google Apps Script haga dos tareas:
- mantener una copia de los vehículos e incidencias en Google Sheets;
- enviar un correo desde tu cuenta de Google cada vez que se registra un parte nuevo.

No necesitas Resend ni un dominio de correo propio. Las cuentas personales de Gmail tienen una cuota de Apps Script de 100 destinatarios de correo al día; las cuotas pueden cambiar: https://developers.google.com/apps-script/guides/services/quotas

## Importante sobre el enlace publicado

El enlace `/pubhtml` es una vista publicada de solo lectura. Para escribir en esa misma hoja necesitas acceso de edición a la hoja original. Si solo tienes permiso de lectura, pide acceso de edición o utiliza una hoja que controles. Los enlaces publicados no permiten editar las celdas: https://support.google.com/docs/answer/183965?hl=es

## 1. Añadir Apps Script a la hoja original

1. Abre la hoja original editable (no la dirección que termina en `/pubhtml`). Si solo tienes el enlace publicado, necesitas encontrar la hoja original o pedir acceso de edición.
2. Copia su ID desde la URL de edición.
3. En Google Sheets, entra en **Extensiones → Apps Script**.
3. Pega el contenido de `apps-script/Code.gs` de este repositorio y guarda.
4. Cuando se soliciten, acepta los permisos de Google Sheets y correo.

El script creará dos pestañas reservadas:
- `Incidencias webapp`: una fila por parte, ordenada por empresa, número de vehículo, fecha e ID.
- `Vehículos webapp`: una fila por vehículo, con el número como dato principal y los recuentos de incidencias.

Esas pestañas se reconstruyen en cada sincronización; no las uses para escribir a mano. Las demás pestañas no se modifican.

## 2. Crear un token secreto

En **Configuración del proyecto → Propiedades del script**, crea estas dos propiedades:
- `WEBHOOK_TOKEN`: un token aleatorio largo (32 caracteres o más), guardado en un gestor de contraseñas.
- `SPREADSHEET_ID`: el ID de la hoja editable original. Está en la URL `https://docs.google.com/spreadsheets/d/ID_DE_LA_HOJA/edit`; copia solo el texto entre `/d/` y `/edit`. No uses el ID `2PACX...` del enlace publicado `/pubhtml`.

No introduzcas el token en el HTML, en GitHub ni en este chat.

## 3. Desplegar el script como aplicación web

1. En Apps Script, pulsa **Implementar → Nueva implementación → Aplicación web**.
2. Ejecutar como: **Yo**.
3. Acceso: **Cualquier persona**.
4. Despliega, autoriza los permisos y copia la URL terminada en `/exec`.
5. En Apps Script, si ejecutas una sincronización de prueba desde el editor, no ejecutes `doPost` directamente: la función necesita una petición web con token.

La URL será pública, pero el script rechazará llamadas que no incluyan el token secreto correcto.

## 4. Configurar Supabase

1. Abre Supabase → **Edge Functions**.
2. Crea o actualiza la función `send-incident-confirmation` con el archivo `supabase/functions/send-incident-confirmation/index.ts` del repositorio. Mantén la verificación de JWT/autenticación.
3. En los secretos de la función, añade:
   - `GOOGLE_APPS_SCRIPT_URL`: la URL desplegada que termina en `/exec`.
   - `GOOGLE_APPS_SCRIPT_TOKEN`: el mismo valor que guardaste como `WEBHOOK_TOKEN`.
4. Despliega la función.

La función valida el usuario en Supabase. Para el correo, obtiene el destinatario de la cuenta autenticada, no de un campo enviado por el navegador.

## 5. Publicar las pestañas

En la hoja original, ve a **Archivo → Compartir → Publicar en la web** y comprueba que se publica el documento completo, no solo una pestaña. Puede tardar unos minutos en actualizarse la vista pública.

## 6. Probarlo

1. Abre https://enekituss.github.io/gestion-incidencias-vehiculos/ y entra con tu cuenta.
2. Registra un parte nuevo.
3. Comprueba las pestañas `Incidencias webapp` y `Vehículos webapp`.
4. Revisa el email de confirmación de la cuenta con la que has iniciado sesión, también en spam.

El parte se guarda primero en Supabase. Si Google Sheets o el correo fallan, el registro no se borra. Consulta **Edge Functions → Logs** y **Apps Script → Executions** para encontrar errores.
