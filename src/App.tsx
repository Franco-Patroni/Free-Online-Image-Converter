import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Hub from './pages/Hub';
import ConvertResize from './pages/ConvertResize';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Hub />} />
          <Route path="tools/convert-resize" element={<ConvertResize />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
