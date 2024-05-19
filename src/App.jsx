import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import ImageDiffPage from './pages/ImageDiffPage'
import HomePage from './pages/Home';

function App() {

  return (
    <>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/imagediff/:category" element={<ImageDiffPage />} />
        </Routes>
    </Router>
    </>
  )
}

export default App
