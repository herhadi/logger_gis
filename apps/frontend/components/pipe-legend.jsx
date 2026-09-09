'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { pipeColor } from '../lib/pipe-legend';

export default function PipeLegend() {
  const [diameters, setDiameters] = useState([]);
  useEffect(() => { apiFetch('/api/pipa/option').then(data => setDiameters(data.diameter || [])).catch(error => console.error('Gagal load legend:', error)); }, []);
  return <aside className="pipe-legend"><h4>Diameter Pipa</h4>{diameters.map((diameter, index) => <div className="legend-item" key={String(diameter)}><span className="legend-line" style={{ background: pipeColor(index) }} />{diameter}</div>)}</aside>;
}
