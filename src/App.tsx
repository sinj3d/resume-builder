import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ExperiencesPage from './pages/ExperiencesPage';
import ArchetypesPage from './pages/ArchetypesPage';
import GeneratePage from './pages/GeneratePage';
import TemplatesPage from './pages/TemplatesPage';
import LatexPage from './pages/LatexPage';
import SettingsPage from './pages/SettingsPage';
import OnboardingPage from './pages/OnboardingPage';
import BioPage from './pages/BioPage';
import ApplicationsPage from './pages/ApplicationsPage';
import OnboardingWizard from './onboarding-wizard/OnboardingWizard';
import { getAppSetting } from './lib/tauri';
import { autoCheckEnabled, checkAndPromptForUpdate } from './lib/updater';
import './App.css';

function App() {
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    getAppSetting('onboarding_complete')
      .then(v => setOnboardingComplete(v === '1'))
      .catch(() => setOnboardingComplete(true)); // fail open — never trap the user on a broken gate
  }, []);

  useEffect(() => {
    // Swallow errors: offline, or no updater-enabled release exists yet
    // (pre-v0.2.0 installs), and neither should ever surface to the user.
    if (autoCheckEnabled()) {
      checkAndPromptForUpdate().catch(() => {});
    }
  }, []);

  if (onboardingComplete === null) {
    return <div className="h-screen bg-paper dark:bg-charcoal" />;
  }

  if (onboardingComplete === false) {
    return <OnboardingWizard onDone={() => setOnboardingComplete(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ExperiencesPage />} />
          <Route path="archetypes" element={<ArchetypesPage />} />
          <Route path="generate" element={<GeneratePage />} />
          <Route path="applications" element={<ApplicationsPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="latex" element={<LatexPage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="bio" element={<BioPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
