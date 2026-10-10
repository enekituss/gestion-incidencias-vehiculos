function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const token = PropertiesService.getScriptProperties().getProperty("WEBHOOK_TOKEN");
    if (!token || !body.token || !sameToken_(String(body.token), token)) return reply_({ok:false,error:"Unauthorized"});

    if (body.action === "sync") return reply_(syncData_(body.snapshot || {}));
    if (body.action === "notify") return reply_(sendNotice_(body));
    return reply_({ok:false,error:"Unknown action"});
  } catch (err) {
    console.error(err);
    return reply_({ok:false,error:String(err && err.message || err)});
  }
}

function syncData_(snapshot) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("La hoja está ocupada por otra sincronización. Inténtalo de nuevo.");
  try {
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (!spreadsheetId) throw new Error("Falta la propiedad del script SPREADSHEET_ID. Usa el ID de la hoja editable original.");
    const book = SpreadsheetApp.openById(spreadsheetId);
    const incidents = Array.isArray(snapshot.incidents) ? snapshot.incidents : [];
    const vehicles = Array.isArray(snapshot.vehicles) ? snapshot.vehicles : [];

    const incidentHeaders = ["ID de parte","Empresa","Nº de vehículo","Fecha detección","Fecha registro","Estado","Prioridad","Categoría","Subcategoría","Componente","Síntoma","Ubicación","Ruta","Base","Matrícula","Tipo","Modelo","Kilometraje","Informante","Descripción","Acción realizada","Taller","Fecha prevista","Historial"];
    const incidentRows = incidents.map(i => [
      val_(i.id), val_(i.company), val_(i.vehicleId), date_(i.detectedAt), date_(i.createdAt),
      val_(i.status || "Abierta"), val_(i.priority), val_(i.category), val_(i.subcategory),
      val_(i.component), val_(i.symptom), val_(i.location), val_(i.route), val_(i.depot),
      val_(i.registration), val_(i.vehicleType), val_(i.vehicleModel), val_(i.km), val_(i.reporter),
      val_(i.description), val_(i.actionTaken), val_(i.workshop), val_(i.dueDate),
      (Array.isArray(i.events) ? i.events : []).map(x => [fmt_(x.at), val_(x.text)].filter(Boolean).join(" · ")).join("\n")
    ]);
    incidentRows.sort((a,b) =>
      String(a[1]).localeCompare(String(b[1]),"es",{sensitivity:"base"}) ||
      String(a[2]).localeCompare(String(b[2]),"es",{numeric:true,sensitivity:"base"}) ||
      dateMs_(a[4])-dateMs_(b[4]) ||
      String(a[0]).localeCompare(String(b[0]),"es",{numeric:true})
    );

    const counts = {};
    incidents.forEach(i => {
      const key = vehicleKey_(i.company,i.vehicleId);
      if (!counts[key]) counts[key] = {active:0,total:0};
      counts[key].total++;
      if (String(i.status || "Abierta").toLowerCase() !== "resuelta") counts[key].active++;
    });
    const vehicleHeaders = ["Empresa","Nº de vehículo","Matrícula","Tipo","Modelo","Base","Ruta","Kilometraje","Incidencias activas","Total de incidencias"];
    const vehicleRows = vehicles.map(v => {
      const n = counts[vehicleKey_(v.company,v.id)] || {active:0,total:0};
      return [val_(v.company),val_(v.id),val_(v.registration),val_(v.type),val_(v.model),val_(v.depot),val_(v.route),val_(v.km),n.active,n.total];
    });
    vehicleRows.sort((a,b) =>
      String(a[0]).localeCompare(String(b[0]),"es",{sensitivity:"base"}) ||
      String(a[1]).localeCompare(String(b[1]),"es",{numeric:true,sensitivity:"base"})
    );

    writeTab_(book,"Incidencias webapp",incidentHeaders,incidentRows);
    writeTab_(book,"Vehículos webapp",vehicleHeaders,vehicleRows);
    return {ok:true,action:"sync",incidents:incidentRows.length,vehicles:vehicleRows.length};
  } finally {
    lock.releaseLock();
  }
}

function writeTab_(book,name,headers,rows) {
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  const filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.clearContents();
  const values = [headers].concat(rows);
  sheet.getRange(1,1,values.length,headers.length).setValues(values);
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,1,headers.length).setFontWeight("bold").setBackground("#17364f").setFontColor("#ffffff");
  sheet.getDataRange().setVerticalAlignment("top");
  if (rows.length) sheet.getRange(1,1,values.length,headers.length).createFilter();
  sheet.autoResizeColumns(1,headers.length);
  if (name === "Incidencias webapp") {
    sheet.setColumnWidth(20,320); sheet.setColumnWidth(24,360);
    if (rows.length) { sheet.getRange(2,20,rows.length,1).setWrap(true); sheet.getRange(2,24,rows.length,1).setWrap(true); }
  }
}

function sendNotice_(body) {
  const recipient = String(body.recipient || "").trim();
  const i = body.incident || {};
  if (!recipient || recipient.indexOf("@") < 1 || !i.id || !i.company || !i.vehicleId) throw new Error("Faltan datos del email o del parte.");
  const created = i.createdAt ? new Date(i.createdAt) : new Date();
  const dateText = isNaN(created.getTime()) ? "No disponible" : Utilities.formatDate(created, "Europe/Madrid", "dd/MM/yyyy HH:mm");
  const fields = [
    ["Número de parte",i.id],["Empresa",i.company],["Vehículo",i.vehicleId],
    ["Categoría",i.category],["Subcategoría",i.subcategory],["Prioridad",i.priority],
    ["Estado",i.status || "Abierta"],["Fecha de registro",dateText]
  ].filter(x => x[1] !== undefined && x[1] !== null && String(x[1]).trim() !== "");
  const table = fields.map(x => "<tr><td style='padding:10px;border-bottom:1px solid #e6edf3;color:#64748b'>" +
    esc_(x[0]) + "</td><td style='padding:10px;border-bottom:1px solid #e6edf3;font-weight:600'>" + esc_(x[1]) + "</td></tr>").join("");
  const description = String(i.description || "");
  const html = "<div style='font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#142a3e'>" +
    "<div style='background:#17364f;color:#fff;padding:22px'><h2 style='margin:0'>Parte registrado correctamente</h2></div>" +
    "<div style='padding:22px'><p>Se ha registrado un nuevo parte de incidencia.</p><table style='width:100%;border-collapse:collapse'>" + table + "</table>" +
    (description ? "<h3>Descripción</h3><p style='white-space:pre-wrap'>" + esc_(description) + "</p>" : "") +
    "<p style='font-size:11px;color:#8291a1'>Confirmación automática del registro.</p></div></div>";
  const text = "PARTE REGISTRADO CORRECTAMENTE\n\n" + fields.map(x => x[0] + ": " + x[1]).join("\n") + (description ? "\n\nDescripción:\n" + description : "");
  MailApp.sendEmail({to:recipient,subject:"Confirmación de parte "+i.id+" · vehículo "+i.vehicleId,body:text,htmlBody:html,name:"Gestión de flota"});
  return {ok:true,action:"notify",incidentId:i.id};
}

function vehicleKey_(company,id) { return String(company||"").trim().toLowerCase()+"|"+String(id||"").trim().toLowerCase(); }
function val_(v) { return v === null || v === undefined ? "" : v; }
function date_(v) { if (!v) return ""; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d; }
function dateMs_(v) { return v instanceof Date ? v.getTime() : new Date(v||0).getTime() || 0; }
function fmt_(v) { if (!v) return ""; const d=new Date(v); return isNaN(d.getTime())?String(v):Utilities.formatDate(d,"Europe/Madrid","dd/MM/yyyy HH:mm"); }
function esc_(v) { return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function sameToken_(a,b) { if (a.length!==b.length) return false; let n=0; for(let i=0;i<a.length;i++) n|=a.charCodeAt(i)^b.charCodeAt(i); return n===0; }
function reply_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
