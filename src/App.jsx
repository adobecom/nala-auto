import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import ImageDiffPage from './pages/ImageDiffPage'
import HomePage from './pages/Home';
import JsonViewerPage from './pages/JsonViewerPage';

function App() {

  return (
    <>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/imagediff/:directory" element={<ImageDiffPage />} />
          <Route path="/json-viewer/:grayboxType" element={<JsonViewerPage />} />
        </Routes>
    </Router>
    </>
  )
}

export default App
