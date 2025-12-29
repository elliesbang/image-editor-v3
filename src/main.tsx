import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './auth/AuthContext';
import { AppRouter, NavigationProvider } from './router';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <NavigationProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </NavigationProvider>
  </React.StrictMode>,
);
