import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import ImageDiffPage from './pages/ImageDiffPage'
import HomePage from './pages/Home';
import RunConsolePage from './pages/RunConsolePage';
import ManualIOSPage from './pages/ManualIOSPage';
import BcAgentPage from './pages/BcAgentPage';
import AppShell from './components/AppShell';

function App() {

  return (
    <>
      <Router>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/console" element={<RunConsolePage />} />
            <Route path="/manual-ios" element={<ManualIOSPage />} />
            <Route path="/bc-agent" element={<BcAgentPage />} />
            <Route path="/imagediff/:directory" element={<ImageDiffPage />} />
          </Route>
        </Routes>
    </Router>
    </>
  )
}

export default App
