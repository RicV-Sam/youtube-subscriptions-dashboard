import React from 'react';
export const GoogleOAuthProvider = ({ children }) => React.createElement(React.Fragment, null, children);
export const useGoogleOAuth = () => ({ scriptLoadedSuccessfully: true });
export const useGoogleLogin = options => request => options.onSuccess({ access_token: 'fixture-only', expires_in: 3600, scope: 'https://www.googleapis.com/auth/youtube.readonly', state: request.state });
