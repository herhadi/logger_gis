import MapView from '../../components/map-view';
import AuthGate from '../../components/auth-gate';
import AuthHeader from '../../components/auth-header';
import PipeLegend from '../../components/pipe-legend';

export default function AdminPage() {
  return <AuthGate allowedRoles={['admin']}><main className="page"><AuthHeader /><MapView /><PipeLegend /></main></AuthGate>;
}
