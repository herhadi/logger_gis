'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useToast } from './toast-provider';

const initial = { dc_id: '', dia: '', jenis: '', panjang: '', keterangan: '', lokasi: '', status: '', diameter: '', roughness: '', zona: '' };
const clean = value => value === null || value === undefined ? '' : String(value);

export default function PipeEditorPanel() {
  const [feature, setFeature] = useState(null);
  const [popupPosition, setPopupPosition] = useState({ left: 80, top: 64 });
  const panelRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initial);
  const [options, setOptions] = useState({ diameter: [], jenis: [] });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const onDraw = event => { if (event.detail?.geometry?.type === 'LineString') { setFeature(event.detail); setPopupPosition(event.detail.properties?.__popupPosition || { left: 80, top: 64 }); setEditingId(null); setForm(initial); } };
    const onSelect = async event => {
      const selected = event.detail;
      setFeature(selected); setPopupPosition(selected.properties.__popupPosition || { left: 80, top: 64 }); setEditingId(String(selected.properties.id));
      try { const detail = await apiFetch(`/api/pipa/${selected.properties.id}`); setForm(Object.fromEntries(Object.keys(initial).map(key => [key, clean(detail[key])] ))); }
      catch (error) { showToast(error.message || 'Gagal memuat detail pipa', 'error'); setFeature(null); }
    };
    window.addEventListener('gis:draw-created', onDraw);
    window.addEventListener('gis:pipa-selected', onSelect);
    const onGeometry = event => { if (event.detail?.geometry?.type === 'LineString' && (!event.detail.properties?.__editorType || event.detail.properties.__editorType === 'pipa')) setFeature(current => current ? { ...current, geometry: event.detail.geometry } : current); };
    window.addEventListener('gis:geometry-updated', onGeometry);
    apiFetch('/api/pipa/option').then(setOptions).catch(error => console.error('Gagal memuat opsi pipa:', error));
    return () => { window.removeEventListener('gis:draw-created', onDraw); window.removeEventListener('gis:pipa-selected', onSelect); window.removeEventListener('gis:geometry-updated', onGeometry); };
  }, [showToast]);

  useEffect(() => {
    if (!feature || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const margin = 12;
    const minTop = 60;
    setPopupPosition(current => {
      const left = Math.max(margin, Math.min(current.left, window.innerWidth - rect.width - margin));
      const top = Math.max(minTop, Math.min(current.top, window.innerHeight - rect.height - margin));
      return current.left === left && current.top === top ? current : { left, top };
    });
  }, [feature, popupPosition.left, popupPosition.top]);

  if (!feature) return null;
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const save = async event => {
    event.preventDefault(); setSaving(true);
    try {
      const coords = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const path = editingId ? `/api/pipa/update/${editingId}` : '/api/pipa/create';
      const result = await apiFetch(path, { method: editingId ? 'PUT' : 'POST', body: JSON.stringify({ ...form, coords }) });
      showToast(result.message || 'Pipa berhasil disimpan', 'success'); setFeature(null);
      window.dispatchEvent(new CustomEvent('gis:crud-saved', { detail: { type: 'pipa', result } }));
    } catch (error) { showToast(error.message || 'Gagal menyimpan pipa', 'error'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!editingId || !window.confirm('Hapus pipa ini?')) return;
    try { const result = await apiFetch(`/api/pipa/delete/${editingId}`, { method: 'DELETE' }); showToast(result.message || 'Pipa berhasil dihapus', 'success'); setFeature(null); window.dispatchEvent(new CustomEvent('gis:crud-saved', { detail: { type: 'pipa', result } })); }
    catch (error) { showToast(error.message || 'Gagal menghapus pipa', 'error'); }
  };
  return <form ref={panelRef} className="editor-panel" style={{ left: popupPosition.left, top: popupPosition.top, right: "auto" }} onSubmit={save}>
    <div className="editor-panel-title"><strong>{editingId ? `Edit Pipa #${editingId}` : 'Pipa Baru'}</strong><button type="button" onClick={() => setFeature(null)}>×</button></div>
    <label>DC ID<input name="dc_id" value={form.dc_id} onChange={update} /></label>
    <label>Diameter<select name="diameter" value={form.diameter} onChange={update}><option value="">Pilih</option>{options.diameter.map(value => <option key={String(value)} value={value}>{value}</option>)}</select></label>
    <label>Jenis<select name="jenis" value={form.jenis} onChange={update}><option value="">Pilih</option>{options.jenis.map(value => <option key={String(value)} value={value}>{value}</option>)}</select></label>
    <label>Panjang<input name="panjang" value={form.panjang} onChange={update} /></label>
    <label>Lokasi<input name="lokasi" value={form.lokasi} onChange={update} /></label>
    <label>Keterangan<textarea name="keterangan" value={form.keterangan} onChange={update} /></label>
    <button className="editor-save" disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Pipa'}</button>
    {editingId && <button type="button" className="editor-delete" onClick={remove}>Hapus Pipa</button>}
  </form>;
}
