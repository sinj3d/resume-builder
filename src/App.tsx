import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ExperiencesPage from './pages/ExperiencesPage';
import ArchetypesPage from './pages/ArchetypesPage';
import GeneratePage from './pages/GeneratePage';
import LatexPage from './pages/LatexPage';
import SettingsPage from './pages/SettingsPage';
import OnboardingPage from './pages/OnboardingPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ExperiencesPage />} />
          <Route path="archetypes" element={<ArchetypesPage />} />
          <Route path="generate" element={<GeneratePage />} />
          <Route path="latex" element={<LatexPage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
