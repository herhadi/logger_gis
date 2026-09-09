import './globals.css';
import ToastProvider from '../components/toast-provider';

export const metadata = {
  title: 'GIS Watermeter',
  description: 'Peta GIS Watermeter'
};

export default function RootLayout({ children }) {
  return <html lang="id"><body><ToastProvider>{children}</ToastProvider></body></html>;
}
