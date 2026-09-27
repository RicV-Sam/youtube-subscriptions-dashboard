import React from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import Dashboard from "./Dashboard";
import useDashboardLifecycle from "./useDashboardLifecycle";

const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

function App() {
  useDashboardLifecycle();
  if (!clientId) return <main><h1>Your YouTube Feed</h1><p>Google sign-in is not configured. Set REACT_APP_GOOGLE_CLIENT_ID in your local environment, then restart the app.</p></main>;
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <Dashboard />
    </GoogleOAuthProvider>
  );
}

export default App;
