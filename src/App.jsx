import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import ImageDiffPage from './pages/ImageDiffPage'
import HomePage from './pages/Home';
import JsonViewerPage from './pages/JsonViewerPage';
import RunConsolePage from './pages/RunConsolePage';
import ManualIOSPage from './pages/ManualIOSPage';

function App() {

  return (
    <>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/console" element={<RunConsolePage />} />
          <Route path="/manual-ios" element={<ManualIOSPage />} />
          <Route path="/imagediff/:directory" element={<ImageDiffPage />} />
          <Route path="/json-viewer/:grayboxType" element={<JsonViewerPage />} />
        </Routes>
    </Router>
    </>
  )
}

export default App
