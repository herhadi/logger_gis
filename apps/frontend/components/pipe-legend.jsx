'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { pipeColor } from '../lib/pipe-legend';

export default function PipeLegend() {
  const [diameters, setDiameters] = useState([]);
  const formatDiameter = value => String(value).toUpperCase().startsWith('DN') ? value : `DN${value}`;
  useEffect(() => { apiFetch('/api/pipa/option').then(data => setDiameters(data.diameter || [])).catch(error => console.error('Gagal load legend:', error)); }, []);
  return <aside className="pipe-legend"><button className="legend-toggle" type="button" aria-label="Tampilkan legend pipa">☷</button><div className="legend-options"><h4>Diameter Pipa</h4>{diameters.map((diameter, index) => <div className="legend-item" key={String(diameter)}><span className="legend-line" style={{ background: pipeColor(index) }} />{formatDiameter(diameter)}</div>)}</div></aside>;
}
