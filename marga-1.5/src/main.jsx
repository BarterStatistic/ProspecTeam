import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { cargarCatalogoRemoto } from './lib/catalogoRemoto.js';
import './index.css';

// El catálogo en línea se aplica antes del primer render; si falla o tarda más
// de 3 s, la app arranca con los datos de respaldo de motos.js.
cargarCatalogoRemoto().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
