/* Vehicle catalog editing and deletion. This file is injected into the main app IIFE by the service worker. */
function vehicleKey(company,id){return normKey(company)+'|'+normKey(id);}
function requestEditVehicle(company,id){
  const v=findVehicleRecord(company,id);
  if(!v){toast('No se encuentra el vehículo seleccionado.');return;}
  const body=`<form id="vehicleEditForm" class="field-grid">
    <div class="field full"><label for="evCompany">Empresa operadora <span class="required">*</span></label><input id="evCompany" required maxlength="100" value="${esc(v.company||'')}" autocomplete="organization"></div>
    <div class="field"><label for="evId">Número de vehículo <span class="required">*</span></label><input id="evId" required value="${esc(v.id||'')}"></div>
    <div class="field"><label for="evReg">Matrícula</label><input id="evReg" maxlength="12" value="${esc(v.registration||'')}"></div>
    <div class="field"><label for="evType">Tipo de vehículo</label><select id="evType"><option value="">Selecciona</option><option>Autocar</option><option>Interurbano</option><option>Urbano</option><option>Microbús</option><option>Vehículo de apoyo</option><option>Otro</option></select></div>
    <div class="field"><label for="evModel">Marca / modelo</label><input id="evModel" value="${esc(v.model||'')}"></div>
    <div class="field"><label for="evDepot">Base / centro</label><input id="evDepot" value="${esc(v.depot||'')}"></div>
    <div class="field"><label for="evRoute">Ruta / servicio</label><input id="evRoute" value="${esc(v.route||'')}"></div>
    <div class="field"><label for="evKm">Kilometraje</label><input id="evKm" type="number" min="0" value="${v.km!==''&&v.km!=null?esc(v.km):''}"></div>
  </form><div class="hint">Los datos básicos del vehículo se actualizarán también en los partes asociados para mantenerlos vinculados correctamente.</div>`;
  modalOpen('Editar vehículo','Modificar los datos del vehículo',body,'<button class="btn" data-modal-close>Cancelar</button><button class="btn btn-primary" id="saveVehicleEdit">Guardar cambios</button>');
  $('#evType').value=v.type||'';
  $('#saveVehicleEdit')?.addEventListener('click',()=>saveVehicleEdits(company,id));
}
function saveVehicleEdits(originalCompany,originalId){
  const v=findVehicleRecord(originalCompany,originalId),form=$('#vehicleEditForm');
  if(!v||!form)return;
  const company=$('#evCompany').value.trim(),id=$('#evId').value.trim().toUpperCase();
  if(!form.reportValidity()||!company||!id)return;
  if(state.vehicles.some(x=>x!==v&&sameVehicle(x.company,x.id,company,id))){toast('Ya existe ese número de vehículo para esa empresa.');return;}
  const oldCompany=v.company,oldId=v.id,registration=$('#evReg').value.trim().toUpperCase(),type=$('#evType').value,model=$('#evModel').value.trim(),depot=$('#evDepot').value.trim(),route=$('#evRoute').value.trim(),km=$('#evKm').value!==''?Number($('#evKm').value):'';
  Object.assign(v,{company,id,registration,type,model,depot,route,km});
  let linked=0;
  state.incidents.forEach(i=>{if(sameVehicle(i.company,i.vehicleId,oldCompany,oldId)){Object.assign(i,{company,vehicleId:id,registration,vehicleType:type,vehicleModel:model,depot,route,km,updatedAt:isoNow()});linked++;}});
  addActivity('Vehículo '+oldId+' actualizado'+(oldId!==id?' → '+id:'')+' · '+company+(linked?' · '+linked+' parte(s) actualizado(s)':''));
  save();modalClose();renderAll();toast('Vehículo '+id+' actualizado correctamente.');
}
function requestDeleteVehicle(company,id){
  const v=findVehicleRecord(company,id);
  if(!v){toast('No se encuentra el vehículo seleccionado.');return;}
  const parts=state.incidents.filter(i=>sameVehicle(i.company,i.vehicleId,v.company,v.id));
  const active=parts.filter(i=>i.status!=='Resuelta').length;
  const warning=parts.length?`<p>Este vehículo tiene <strong>${parts.length}</strong> parte(s) asociado(s)${active?' y '+active+' activo(s)':''}.</p><p>Al eliminarlo, <strong>los partes no se borrarán</strong>; se conservarán en el historial. Solo se quitará el vehículo del catálogo.</p>`:'<p>Este vehículo no tiene partes asociados.</p>';
  modalOpen('Eliminar vehículo','Esta acción quitará el vehículo del catálogo',`<p>Vas a eliminar:</p><div class="detail-box"><small>Vehículo seleccionado</small><strong>${esc(v.company||'Empresa sin indicar')} · ${esc(v.id)}</strong></div>${warning}<p class="hint">Si vuelves a registrar un parte para este vehículo, se podrá crear de nuevo en el catálogo.</p>`,'<button class="btn" data-modal-close>Cancelar</button><button class="btn btn-danger" id="confirmDeleteVehicle">Eliminar vehículo</button>');
  $('#confirmDeleteVehicle')?.addEventListener('click',()=>deleteVehicle(company,id));
}
function deleteVehicle(company,id){
  const v=findVehicleRecord(company,id);
  if(!v){modalClose();toast('El vehículo ya no está disponible.');return;}
  const parts=state.incidents.filter(i=>sameVehicle(i.company,i.vehicleId,v.company,v.id)).length;
  state.vehicles=state.vehicles.filter(x=>x!==v);
  addActivity('Vehículo '+v.id+' de '+(v.company||'empresa sin indicar')+' eliminado del catálogo'+(parts?' · '+parts+' parte(s) conservado(s)':''));
  save();modalClose();renderAll();toast('Vehículo '+v.id+' eliminado del catálogo.');
}
function addVehicleManagementActions(){
  $$('#vehicleCards .vehicle-card').forEach(card=>{
    const detail=card.querySelector('[data-vehicle-detail]');
    const actions=card.querySelector('.inline-actions');
    if(!detail||!actions||actions.querySelector('[data-vehicle-edit]'))return;
    const id=detail.dataset.vehicleDetail||'',company=detail.dataset.vehicleCompany||'';
    const edit=document.createElement('button');edit.className='btn btn-small';edit.type='button';edit.dataset.vehicleEdit=id;edit.dataset.vehicleCompany=company;edit.textContent='Editar';
    const del=document.createElement('button');del.className='btn btn-small btn-danger';del.type='button';del.dataset.vehicleDelete=id;del.dataset.vehicleCompany=company;del.textContent='Eliminar';
    actions.append(edit,del);
  });
}
const originalRenderFleet=renderFleet;
renderFleet=function(){originalRenderFleet();addVehicleManagementActions();};
const originalShowVehicleParts=showVehicleParts;
showVehicleParts=function(id,company=''){
  originalShowVehicleParts(id,company);
  const footer=$('#modalFooter');
  if(!footer||footer.querySelector('[data-modal-vehicle-edit]'))return;
  const edit=document.createElement('button');edit.className='btn';edit.type='button';edit.dataset.modalVehicleEdit=id;edit.dataset.modalVehicleCompany=company;edit.textContent='Editar vehículo';
  const del=document.createElement('button');del.className='btn btn-danger';del.type='button';del.dataset.modalVehicleDelete=id;del.dataset.modalVehicleCompany=company;del.textContent='Eliminar vehículo';
  footer.insertBefore(edit,footer.lastElementChild);footer.insertBefore(del,footer.lastElementChild);
};
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.vehicleEdit){requestEditVehicle(b.dataset.vehicleCompany||'',b.dataset.vehicleEdit);return;}
  if(b.dataset.vehicleDelete){requestDeleteVehicle(b.dataset.vehicleCompany||'',b.dataset.vehicleDelete);return;}
  if(b.dataset.modalVehicleEdit){modalClose();requestEditVehicle(b.dataset.modalVehicleCompany||'',b.dataset.modalVehicleEdit);return;}
  if(b.dataset.modalVehicleDelete){modalClose();requestDeleteVehicle(b.dataset.modalVehicleCompany||'',b.dataset.modalVehicleDelete);return;}
});
