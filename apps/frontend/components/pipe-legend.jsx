'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { pipeColor } from '../lib/pipe-legend';

export default function PipeLegend() {
  const [diameters, setDiameters] = useState([]);
  const [pinned, setPinned] = useState(false);
  const formatDiameter = value =>
    String(value).toUpperCase().startsWith('DN') ? value : `DN${value}`;

  useEffect(() => {
    apiFetch('/api/pipa/option')
      .then(data => setDiameters(data.diameter || []))
      .catch(error => console.error('Gagal load legend:', error));
  }, []);

  return (
    <aside className={`pipe-legend${pinned ? ' is-pinned' : ''}`}>
      <button
        className={`legend-toggle${pinned ? ' is-pinned' : ''}`}
        type="button"
        aria-label={pinned ? 'Lepas kunci legend pipa' : 'Kunci legend pipa'}
        aria-pressed={pinned}
        title={pinned ? 'Legend terkunci — klik untuk melepas' : 'Kunci agar legend tetap tampil'}
        onClick={() => setPinned(current => !current)}
      >
        ☷
      </button>
      <div className="legend-options">
        <h4>Diameter Pipa</h4>
        {diameters.map((diameter, index) => (
          <div className="legend-item" key={String(diameter)}>
            <button type="button" className="legend-filter" onClick={() => window.dispatchEvent(new CustomEvent("gis:filter-diameter", { detail: { diameter } }))} title="Klik untuk fokus diameter ini; klik lagi untuk reset"><span className="legend-line" style={{ background: pipeColor(index) }} />{formatDiameter(diameter)}</button>
          </div>
        ))}
      </div>
    </aside>
  );
}
