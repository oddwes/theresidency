import React, { useState, useEffect } from 'react';
import RankingCard from './rankingcard';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const LOCATIONS = ['arcadia', 'arrayah', 'bangalore', 'homebrew', 'londinium', 'sf2', 'sf parc', 'v2'];

const Dashboard = () => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isGapiLoaded, setIsGapiLoaded] = useState(false);

  // Step 1: Load GAPI Script
  useEffect(() => {
    const loadGapiScript = () => {
      if (!window.gapi) {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          console.log('GAPI script loaded');
          initializeGapi();
        };
        script.onerror = (error) => {
          console.error('Error loading GAPI script:', error);
          setError('Failed to load Google API script');
        };
        document.head.appendChild(script);
      } else {
        initializeGapi();
      }
    };

    loadGapiScript();
  }, []);

  // Step 2: Initialize GAPI Client
  const initializeGapi = async () => {
    try {
      await new Promise<void>((resolve) => {
        window.gapi.load('client', resolve);
      });

      await window.gapi.client.init({
        apiKey: import.meta.env.VITE_GAPI_KEY,
        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
      });

      console.log('GAPI client initialized');
      setIsGapiLoaded(true);
    } catch (err) {
      console.error('Error initializing GAPI:', err);
      setError('Failed to initialize Google API client');
    }
  };

  // Step 3: Load Google Identity Services after GAPI is loaded
  useEffect(() => {
    if (!isGapiLoaded) return;

    const loadIdentityServices = () => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        console.log('Identity Services script loaded');
        checkStoredToken();
      };
      script.onerror = (error) => {
        console.error('Error loading Identity Services script:', error);
        setError('Failed to load Google Identity Services');
      };
      document.head.appendChild(script);
    };

    loadIdentityServices();
  }, [isGapiLoaded]);

  // Step 4: Check for stored token
  const checkStoredToken = () => {
    const savedToken = sessionStorage.getItem('gapi_token');
    if (savedToken) {
      const tokenData = JSON.parse(savedToken);
      if (tokenData.expiry_date && tokenData.expiry_date > Date.now()) {
        window.gapi.client.setToken(tokenData);
        setIsSignedIn(true);
        fetchSheetData();
      } else {
        sessionStorage.removeItem('gapi_token');
      }
    }
    setIsLoading(false);
  };

  // Handle sign in
  const handleSignIn = () => {
    if (!window.google || !isGapiLoaded) {
      console.error('Google API not loaded');
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GAPI_CLIENT_ID,
      scope: SCOPES,
      callback: async (tokenResponse: any) => {
        if (tokenResponse.error !== undefined) {
          setError(`Authorization error: ${tokenResponse.error}`);
          return;
        }

        tokenResponse.expiry_date = Date.now() + 3600000;
        sessionStorage.setItem('gapi_token', JSON.stringify(tokenResponse));
        window.gapi.client.setToken(tokenResponse);
        setIsSignedIn(true);
        await fetchSheetData();
      },
    });

    tokenClient.requestAccessToken();
  };

  // Handle sign out
  const handleSignOut = () => {
    const token = window.gapi.client.getToken();
    if (token !== null) {
      window.google?.accounts.oauth2.revoke(token.access_token, () => {
        window.gapi.client.setToken(null);
        sessionStorage.removeItem('gapi_token');
        setIsSignedIn(false);
        setData(null);
      });
    }
  };

  // Fetch sheet data
  const fetchSheetData = async () => {
    try {
      setIsLoading(true);
      setError('');

      console.log('Fetching data from sheet:', import.meta.env.VITE_SHEET_NAME);
      const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: import.meta.env.VITE_SHEET_ID,
        range: import.meta.env.VITE_SHEET_NAME,
      });

      const values = response.result.values;
      if (!values) {
        throw new Error('No data found in spreadsheet');
      }

      const headers = values[0];
      const jsonData = values.slice(1).map(row => {
        const rowData: Record<string, any> = {};
        headers.forEach((header: string, index: number) => {
          rowData[header] = row[index];
        });
        return rowData;
      });

      setData(jsonData);
    } catch (err: any) {
      console.error('Error fetching sheet data:', err);
      setError(err.message || 'Error fetching spreadsheet data');
    } finally {
      setIsLoading(false);
    }
  };

  const processLocationData = (
    data: any[] | null,
    column: string,
    aggregationType: 'latest' | 'sum' = 'latest'
  ) => {
    // Initialize results with all locations defaulted to 0
    const locationCounts: Record<string, number> = Object.fromEntries(
      LOCATIONS.map(location => [location.toLowerCase(), 0])
    );

    if (data) {
      // Aggregate by location based on the specified method
      if (aggregationType === 'latest') {
        // First, get the latest count for each email
        const latestCountByEmail: Record<string, { location: string; count: number }> = {};

        data.forEach(row => {
          const email = row['your email (use the same one every time)'];
          const location = (row['which house are you in right now?'] || 'Unknown').toLowerCase();
          // Remove commas and parse as number
          const count = parseFloat(row[column].replace(/,/g, ''));

          // Only update if we have a valid email and the count is a number
          if (email && !isNaN(count)) {
            latestCountByEmail[email] = {
              location,
              count
            };
          }
        });

        // Aggregate by location
        Object.values(latestCountByEmail).forEach(({ location, count }) => {
          if (LOCATIONS.map(l => l.toLowerCase()).includes(location)) {
            locationCounts[location] += count;
          }
        });
      } else if (aggregationType === 'sum') {
        // Aggregate by summing all entries per location
        data.forEach(row => {
          const location = (row['which house are you in right now?'] || 'Unknown').toLowerCase();
          // Remove commas and parse as number
          const amount = parseFloat(row[column].replace(/,/g, ''));

          if (!isNaN(amount) && LOCATIONS.map(l => l.toLowerCase()).includes(location)) {
            locationCounts[location] += amount;
          }
        });
      }
    }

    // Convert to array, sort by count, and maintain original location casing
    return LOCATIONS.map(originalLocation => {
      const location = originalLocation.toLowerCase();
      return {
        location: originalLocation,
        count: locationCounts[location]
      };
    }).sort((a, b) => b.count - a.count);
  };

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">The Residency</h1>
            {isSignedIn && (
              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                Sign Out
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : !isSignedIn ? (
            <div>
              <button
                onClick={handleSignIn}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                disabled={!isGapiLoaded}
              >
                Sign in with Google
              </button>
              {error && (
                <div className="mt-4 bg-red-50 text-red-700 p-4 rounded-md">
                  {error}
                </div>
              )}
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-700 p-4 rounded-md">
              {error}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              <RankingCard
                title="Users"
                data={processLocationData(data, 'how many total users do you have?')}
              />
              <RankingCard
                title="MRR"
                data={processLocationData(data, 'what is your mrr right now? ($)')}
              />
              <RankingCard
                title="Valuation"
                data={processLocationData(data, 'what is your current valuation? ($)')}
              />
              <RankingCard
                title="Raised Amount"
                data={processLocationData(data, 'how much money have you raised? (investment $)', 'sum')}
              />

              {/* Raw Data Card */}
              <div className="bg-gray-50 rounded-lg p-6 col-span-2">
                <h2 className="text-xl font-semibold mb-4">Raw Data</h2>
                <pre className="overflow-auto">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;