import MapView from '../../components/map-view';
import AuthGate from '../../components/auth-gate';
import AuthHeader from '../../components/auth-header';

export default function AdminPage() {
  return <AuthGate allowedRoles={['admin']}><main className="page"><AuthHeader /><MapView /></main></AuthGate>;
}
