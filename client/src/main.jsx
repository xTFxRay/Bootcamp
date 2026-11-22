import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// React Router v7: everything comes from "react-router"; only the DOM-specific RouterProvider
// comes from "react-router/dom" (react-router-dom is a v6 leftover that v8 removes).
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import App from './App.jsx';
import { SettingsProvider } from './settings.jsx';
import './index.css';

// A "data router", so pages can use useBlocker to warn before leaving with unsaved text.
// App still declares its pages with <Routes>, under this one catch-all route.
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SettingsProvider>
      <RouterProvider router={router} />
    </SettingsProvider>
  </StrictMode>
);
