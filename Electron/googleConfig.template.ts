// Template — copy to googleConfig.ts and fill in real values.
// Get credentials from: console.cloud.google.com → APIs & Services → Credentials
// Create an OAuth 2.0 credential of type "Desktop App".
// Add http://localhost:42813/oauth/callback as a redirect URI.

export const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com'
export const GOOGLE_CLIENT_SECRET = 'YOUR_CLIENT_SECRET'
export const GOOGLE_REDIRECT_URI = 'http://localhost:42813/oauth/callback'

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar',
  'openid',
  'email',
  'profile',
].join(' ')
