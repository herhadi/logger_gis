import MapView from '../../components/map-view';
import AuthGate from '../../components/auth-gate';
import AuthHeader from '../../components/auth-header';

export default function UserPage() {
  return <AuthGate allowedRoles={['admin', 'user']}><main className="page"><AuthHeader /><MapView /></main></AuthGate>;
}
