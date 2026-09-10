'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useToast } from './toast-provider';

const initial = { tipe: 'acc', dc_id: '', keterangan: '', zona: '', lokasi: '', elevation: '' };
const clean = value => value === null || value === undefined ? '' : String(value);

export default function MarkerEditorPanel() {
  const [feature, setFeature] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  useEffect(() => {
    const onDraw = event => { if (event.detail?.geometry?.type === 'Point') { setFeature(event.detail); setEditingId(null); setForm(initial); } };
    const onSelect = async event => {
      const selected = event.detail; setFeature(selected); setEditingId(String(selected.properties.id));
      try { const detail = await apiFetch(`/api/marker/${selected.properties.tipe}/${selected.properties.id}`); setForm(Object.fromEntries(Object.keys(initial).map(key => [key, clean(key === 'tipe' ? selected.properties.tipe : detail[key])] ))); }
      catch (error) { showToast(error.message || 'Gagal memuat detail marker', 'error'); setFeature(null); }
    };
    window.addEventListener('gis:draw-created', onDraw); window.addEventListener('gis:marker-selected', onSelect);
    const onGeometry = event => { if (event.detail?.geometry?.type === 'Point' && (!event.detail.properties?.__editorType || event.detail.properties.__editorType === 'marker')) setFeature(current => current ? { ...current, geometry: event.detail.geometry } : current); };
    window.addEventListener('gis:geometry-updated', onGeometry);
    return () => { window.removeEventListener('gis:draw-created', onDraw); window.removeEventListener('gis:marker-selected', onSelect); window.removeEventListener('gis:geometry-updated', onGeometry); };
  }, [showToast]);
  if (!feature) return null;
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const save = async event => {
    event.preventDefault(); setSaving(true);
    try {
      const [lng, lat] = feature.geometry.coordinates; const payload = { ...form, coords: [lat, lng] };
      const path = editingId ? `/api/marker/update/${form.tipe}/${editingId}` : '/api/marker/create';
      const result = await apiFetch(path, { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      showToast(result.message || 'Marker berhasil disimpan', 'success'); setFeature(null); window.dispatchEvent(new CustomEvent('gis:crud-saved', { detail: { type: 'marker', result } }));
    } catch (error) { showToast(error.message || 'Gagal menyimpan marker', 'error'); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!editingId || !window.confirm('Hapus marker ini?')) return;
    try { const result = await apiFetch(`/api/marker/delete/${form.tipe}/${editingId}`, { method: 'DELETE' }); showToast(result.message || 'Marker berhasil dihapus', 'success'); setFeature(null); window.dispatchEvent(new CustomEvent('gis:crud-saved', { detail: { type: 'marker', result } })); }
    catch (error) { showToast(error.message || 'Gagal menghapus marker', 'error'); }
  };
  return <form className="editor-panel" onSubmit={save}>
    <div className="editor-panel-title"><strong>{editingId ? `Edit Marker #${editingId}` : 'Marker Baru'}</strong><button type="button" onClick={() => setFeature(null)}>×</button></div>
    <label>Tipe<select name="tipe" value={form.tipe} disabled={Boolean(editingId)} onChange={update}><option value="acc">ACC</option><option value="reservoir">Reservoir</option><option value="tank">Tank</option><option value="valve">Valve</option></select></label>
    <label>DC ID<input name="dc_id" value={form.dc_id || ''} onChange={update} /></label>
    <label>Zona<input name="zona" value={form.zona || ''} onChange={update} /></label>
    <label>Lokasi<input name="lokasi" value={form.lokasi || ''} onChange={update} /></label>
    <label>Elevation<input name="elevation" value={form.elevation || ''} onChange={update} /></label>
    <label>Keterangan<textarea name="keterangan" value={form.keterangan || ''} onChange={update} /></label>
    <button className="editor-save" disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Marker'}</button>
    {editingId && <button type="button" className="editor-delete" onClick={remove}>Hapus Marker</button>}
  </form>;
}
