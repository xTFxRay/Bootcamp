import { NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import TestCasesPage from './pages/TestCasesPage.jsx';

export default function App() {
  return (
    <>
      <header className="topbar">
        <span className="brand">Bootcamp App</span>
        <nav>
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/test-cases">Test cases</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/test-cases" element={<TestCasesPage />} />
        <Route path="*" element={<main className="page"><h1>Page not found</h1></main>} />
      </Routes>
    </>
  );
}
