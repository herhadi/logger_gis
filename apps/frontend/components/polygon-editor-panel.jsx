'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useToast } from './toast-provider';

const initial = { nosamw: '', nosambckup: '' };

export default function PolygonEditorPanel() {
  const [feature, setFeature] = useState(null); const [editingId, setEditingId] = useState(null); const [form, setForm] = useState(initial); const [saving, setSaving] = useState(false); const { showToast } = useToast();
  useEffect(() => {
    const onDraw = event => { if (event.detail?.geometry?.type === 'Polygon') { setFeature(event.detail); setEditingId(null); setForm(initial); } };
    const onSelect = async event => { const selected = event.detail; setFeature(selected); setEditingId(String(selected.properties.id)); try { setForm({ ...initial, ...(await apiFetch(`/api/polygon/${selected.properties.id}`)) }); } catch (error) { showToast(error.message || 'Gagal memuat detail polygon', 'error'); setFeature(null); } };
    window.addEventListener('gis:draw-created', onDraw); window.addEventListener('gis:polygon-selected', onSelect);
    return () => { window.removeEventListener('gis:draw-created', onDraw); window.removeEventListener('gis:polygon-selected', onSelect); };
  }, [showToast]);
  if (!feature) return null;
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const save = async event => { event.preventDefault(); setSaving(true); try { const coords = feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]); const path = editingId ? `/api/polygon/update/${editingId}` : '/api/polygon/create'; const result = await apiFetch(path, { method: editingId ? 'PUT' : 'POST', body: JSON.stringify({ ...form, coords }) }); showToast(result.message || 'Polygon berhasil disimpan', 'success'); setFeature(null); window.dispatchEvent(new CustomEvent('gis:crud-saved', { detail: { type: 'polygon', result } })); } catch (error) { showToast(error.message || 'Gagal menyimpan polygon', 'error'); } finally { setSaving(false); } };
  const remove = async () => { if (!editingId || !window.confirm('Hapus polygon ini?')) return; try { const result = await apiFetch(`/api/polygon/delete/${editingId}`, { method: 'DELETE' }); showToast(result.message || 'Polygon berhasil dihapus', 'success'); setFeature(null); window.dispatchEvent(new CustomEvent('gis:crud-saved', { detail: { type: 'polygon', result } })); } catch (error) { showToast(error.message || 'Gagal menghapus polygon', 'error'); } };
  return <form className="editor-panel" onSubmit={save}><div className="editor-panel-title"><strong>{editingId ? `Edit Polygon #${editingId}` : 'Polygon Baru'}</strong><button type="button" onClick={() => setFeature(null)}>×</button></div><label>No SAMW<input name="nosamw" value={form.nosamw || ''} onChange={update} /></label><label>No SAM Backup<input name="nosambckup" value={form.nosambckup || ''} onChange={update} /></label><button className="editor-save" disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Polygon'}</button>{editingId && <button type="button" className="editor-delete" onClick={remove}>Hapus Polygon</button>}</form>;
}
