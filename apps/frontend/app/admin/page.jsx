import MapView from '../../components/map-view';
import AuthGate from '../../components/auth-gate';
import AuthHeader from '../../components/auth-header';
import PipeLegend from '../../components/pipe-legend';

export default function AdminPage() {
  return <AuthGate allowedRoles={['admin']}><main className="page"><AuthHeader /><nav className="admin-nav"><strong>CRUD</strong><button type="button">Pipa</button><button type="button">Marker</button><button type="button">Polygon</button></nav><MapView adminMode /><PipeLegend /></main></AuthGate>;
}
