import { useState } from 'react';
import { Route, Routes } from 'react-router';
import KeyboardShortcuts from './components/KeyboardShortcuts.jsx';
import TopNav from './components/TopNav.jsx';
import HomePage from './pages/HomePage.jsx';
import TestCasesPage from './pages/TestCasesPage.jsx';
import TestCaseImportPage from './pages/TestCaseImportPage.jsx';
import TestSuitesPage from './pages/TestSuitesPage.jsx';
import TestSuiteDetailPage from './pages/TestSuiteDetailPage.jsx';
import BugsPage from './pages/BugsPage.jsx';
import BugDetailPage from './pages/BugDetailPage.jsx';
import TestRunsPage from './pages/TestRunsPage.jsx';
import TestRunDetailPage from './pages/TestRunDetailPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import ReportDetailPage from './pages/ReportDetailPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import FlakyTestsPage from './pages/FlakyTestsPage.jsx';

export default function App() {
  const [dialog, setDialog] = useState(null); // 'search' | 'help' | null
  return (
    <>
      <TopNav onSearch={() => setDialog('search')} onHelp={() => setDialog('help')} />
      <div id="content" className="app-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/test-cases" element={<TestCasesPage />} />
          <Route path="/test-cases/import" element={<TestCaseImportPage />} />
          <Route path="/test-suites" element={<TestSuitesPage />} />
          <Route path="/test-suites/:id" element={<TestSuiteDetailPage />} />
          <Route path="/test-runs" element={<TestRunsPage />} />
          <Route path="/test-runs/:id" element={<TestRunDetailPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:id" element={<ReportDetailPage />} />
          <Route path="/bugs" element={<BugsPage />} />
          <Route path="/bugs/:id" element={<BugDetailPage />} />
          <Route path="/flaky" element={<FlakyTestsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<main className="page"><h1>Page not found</h1></main>} />
        </Routes>
      </div>
      <KeyboardShortcuts dialog={dialog} setDialog={setDialog} />
    </>
  );
}
