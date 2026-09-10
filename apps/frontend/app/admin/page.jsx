import MapView from '../../components/map-view';
import AuthGate from '../../components/auth-gate';
import AuthHeader from '../../components/auth-header';
import PipeLegend from '../../components/pipe-legend';
import PipeEditorPanel from '../../components/pipe-editor-panel';
import MarkerEditorPanel from '../../components/marker-editor-panel';
import PolygonEditorPanel from '../../components/polygon-editor-panel';

export default function AdminPage() {
  return <AuthGate allowedRoles={['admin']}><main className="page"><header className="admin-header"><strong>Admin Editor Peta Logger</strong><AuthHeader /></header><MapView adminMode /><PipeLegend /><PipeEditorPanel /><MarkerEditorPanel /><PolygonEditorPanel /></main></AuthGate>;
}
