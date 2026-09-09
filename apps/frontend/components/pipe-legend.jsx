'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

const COLORS = ['#0077ff', '#28a745', '#dc3545', '#ffc107', '#00ffc8', '#ff6600', '#00b7ff', '#8e44ad', '#00aa00', '#fd7e14', '#e83e8c'];

export default function PipeLegend() {
  const [diameters, setDiameters] = useState([]);
  useEffect(() => { apiFetch('/api/pipa/option').then(data => setDiameters(data.diameter || [])).catch(error => console.error('Gagal load legend:', error)); }, []);
  return <aside className="pipe-legend"><h4>Diameter Pipa</h4>{diameters.map((diameter, index) => <div className="legend-item" key={String(diameter)}><span className="legend-line" style={{ background: COLORS[index] || `hsl(${(index * 40) % 360} 70% 50%)` }} />{diameter}</div>)}</aside>;
}
