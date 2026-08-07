const MARKER_TABLES = Object.freeze({
  acc: 'gis_acc',
  reservoir: 'gis_reservoir',
  tank: 'gis_tank',
  valve: 'gis_valve'
});

function getMarkerTable(type) {
  return MARKER_TABLES[type];
}

function isValidCoordinates(coords) {
  return Array.isArray(coords)
    && coords.length === 2
    && coords.every(value => value !== null
      && value !== ''
      && Number.isFinite(Number(value)));
}

function coordinatesToWkt(coords) {
  return isValidCoordinates(coords) ? `POINT(${coords[1]} ${coords[0]})` : null;
}

module.exports = { MARKER_TABLES, getMarkerTable, isValidCoordinates, coordinatesToWkt };
