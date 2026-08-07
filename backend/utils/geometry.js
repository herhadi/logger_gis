function isValidLineCoordinates(coords) {
  return Array.isArray(coords)
    && coords.length >= 2
    && coords.every(point => Array.isArray(point)
      && point.length >= 2
      && point.slice(0, 2).every(value => value !== null
        && value !== ''
        && Number.isFinite(Number(value))));
}

function isValidPolygonCoordinates(coords) {
  return Array.isArray(coords)
    && coords.length >= 3
    && coords.every(point => Array.isArray(point)
      && point.length >= 2
      && point.slice(0, 2).every(value => value !== null
        && value !== ''
        && Number.isFinite(Number(value))));
}

function coordinatesToLineWkt(coords) {
  if (!isValidLineCoordinates(coords)) return null;
  return `LINESTRING(${coords.map(([lat, lng]) => `${lng} ${lat}`).join(', ')})`;
}

function coordinatesToPolygonWkt(coords) {
  if (!isValidPolygonCoordinates(coords)) return null;
  const points = coords.map(([lat, lng]) => `${lng} ${lat}`);
  const first = points[0];
  if (points[points.length - 1] !== first) points.push(first);
  return `POLYGON((${points.join(', ')}))`;
}

module.exports = {
  isValidLineCoordinates,
  isValidPolygonCoordinates,
  coordinatesToLineWkt,
  coordinatesToPolygonWkt
};
