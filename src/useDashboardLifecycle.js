import { useEffect } from 'react';

export default function useDashboardLifecycle() {
  useEffect(() => {
    if (window.location.port !== '3000' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
    let socket, retry, disposed = false, suspended = false;
    function connect() {
      if (disposed || suspended || (socket && socket.readyState < WebSocket.CLOSING)) return;
      socket = new WebSocket('ws://127.0.0.1:3010/dashboard');
      socket.onclose = () => {
        if (!disposed && !suspended) retry = setTimeout(connect, 15000);
      };
      socket.onerror = () => {}; // Direct npm start remains usable without the launcher.
    }
    function hide() { suspended = true; clearTimeout(retry); socket?.close(); }
    function show() { suspended = false; connect(); }
    connect();
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      disposed = true; clearTimeout(retry); socket?.close();
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
    };
  }, []);
}
