import { lazy, Suspense } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import AppShell from './components/AppShell';

// Route-level code splitting: the image viewer alone is ~1.4k lines and none
// of these pages are needed to paint the one the user actually opened.
const HomePage = lazy(() => import('./pages/Home'));
const RunConsolePage = lazy(() => import('./pages/RunConsolePage'));
const ManualIOSPage = lazy(() => import('./pages/ManualIOSPage'));
const BcAgentPage = lazy(() => import('./pages/BcAgentPage'));
const RunnersPage = lazy(() => import('./pages/RunnersPage'));
const ReleasesPage = lazy(() => import('./pages/ReleasesPage'));
const ImageDiffPage = lazy(() => import('./pages/ImageDiffPage'));
const PrCheckPage = lazy(() => import('./pages/PrCheckPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));

const PageFallback = () => (
  <div className="p-8 text-sm text-gray-500">Loading…</div>
);

function App() {

  return (
    <>
      <Router>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/console" element={<RunConsolePage />} />
              <Route path="/manual-ios" element={<ManualIOSPage />} />
              <Route path="/bc-agent" element={<BcAgentPage />} />
              <Route path="/runners" element={<RunnersPage />} />
              <Route path="/releases" element={<ReleasesPage />} />
              <Route path="/imagediff/:directory" element={<ImageDiffPage />} />
              <Route path="/pr" element={<PrCheckPage />} />
              <Route path="/pr/:id" element={<PrCheckPage />} />
              <Route path="/help" element={<HelpPage />} />
            </Route>
          </Routes>
        </Suspense>
    </Router>
    </>
  )
}

export default App
