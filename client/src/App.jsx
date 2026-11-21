import { NavLink, Route, Routes } from 'react-router';
import HomePage from './pages/HomePage.jsx';
import TestCasesPage from './pages/TestCasesPage.jsx';
import TestSuitesPage from './pages/TestSuitesPage.jsx';
import TestSuiteDetailPage from './pages/TestSuiteDetailPage.jsx';
import BugsPage from './pages/BugsPage.jsx';
import BugDetailPage from './pages/BugDetailPage.jsx';
import TestRunsPage from './pages/TestRunsPage.jsx';
import TestRunDetailPage from './pages/TestRunDetailPage.jsx';

export default function App() {
  return (
    <>
      <header className="topbar">
        <span className="brand">Bootcamp App</span>
        <nav>
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/test-cases">Test cases</NavLink>
          <NavLink to="/test-suites">Test suites</NavLink>
          <NavLink to="/test-runs">Test runs</NavLink>
          <NavLink to="/bugs">Bugs</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/test-cases" element={<TestCasesPage />} />
        <Route path="/test-suites" element={<TestSuitesPage />} />
        <Route path="/test-suites/:id" element={<TestSuiteDetailPage />} />
        <Route path="/test-runs" element={<TestRunsPage />} />
        <Route path="/test-runs/:id" element={<TestRunDetailPage />} />
        <Route path="/bugs" element={<BugsPage />} />
        <Route path="/bugs/:id" element={<BugDetailPage />} />
        <Route path="*" element={<main className="page"><h1>Page not found</h1></main>} />
      </Routes>
    </>
  );
}
