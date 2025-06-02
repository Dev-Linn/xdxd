// merchant.js
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import cors from 'cors'; // Optional: if your frontend is on a different origin during development

const router = express.Router();

// Initialize OAuth client (needed for token refresh and API calls)
// Ensure your environment variables are loaded (e.g., using dotenv in server.js)
const oauth2Client = new OAuth2Client(
  process.env.OAUTH_CLIENT_ID,
  process.env.OAUTH_CLIENT_SECRET,
  process.env.OAUTH_REDIRECT_URI
);

// Middleware for CORS if needed (adjust origin as necessary)
router.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Adjust as needed
    credentials: true
}));

// Middleware to log session details specific to this router
router.use((req, res, next) => {
    console.log('=== MERCHANT ROUTER SESSION ===');
    console.log('Tokens present:', !!req.session.tokens);
    console.log('Selected Merchant ID:', req.session.selectedMerchantId || 'Not set');
    next();
});

/**
 * Middleware to check authentication and selected Merchant ID.
 * It also handles token refresh if necessary.
 */
async function ensureAuthenticated(req, res, next) {
    if (!req.session.tokens) {
        console.log('[Merchant Auth] No tokens in session. Redirecting to login.');
        // In a real app, you might redirect to an error page or a login initiation route
        // if this router is hit directly without a session.
        return res.status(401).json({ error: 'Not authenticated. Please login.', redirectTo: '/auth/google' });
    }

    oauth2Client.setCredentials(req.session.tokens);

    if (oauth2Client.isTokenExpiring()) {
        console.log('[Merchant Auth] Token is expiring, attempting to refresh...');
        try {
            const { tokens: refreshedTokens } = await oauth2Client.refreshAccessToken();
            req.session.tokens = refreshedTokens; // Update session with new tokens
            oauth2Client.setCredentials(refreshedTokens); // Update client with new tokens
            console.log('[Merchant Auth] Token refreshed successfully.');
            // Save the session if your session store requires explicit save after modification
            req.session.save(err => {
                if (err) {
                    console.error('[Merchant Auth] Error saving session after token refresh:', err);
                    return res.status(500).json({ error: 'Session save error after token refresh.' });
                }
                next();
            });
        } catch (refreshError) {
            console.error('[Merchant Auth] Error refreshing token:', refreshError.response ? refreshError.response.data : refreshError.message);
            // If refresh fails, the user needs to re-authenticate
            req.session.destroy(err => {
                if (err) console.error('[Merchant Auth] Error destroying session after failed token refresh:', err);
            });
            return res.status(401).json({ error: 'Session expired. Please login again.', redirectTo: '/auth/google' });
        }
    } else {
        next();
    }
}

/**
 * Serves the Merchant Center dashboard HTML page.
 * Assumes 'public/merchant_dashboard.html' exists.
 */
router.get('/merchant-dashboard', ensureAuthenticated, (req, res) => {
    if (!req.session.selectedMerchantId) {
        console.log('[Merchant Dashboard] Merchant ID not selected. Cannot display dashboard.');
        // Redirect to a page where they can select a merchant account,
        // or display a message on the dashboard page itself.
        // For now, sending an error or a specific HTML page indicating this state.
        return res.status(400).send(`
            <h1>Merchant Account Not Selected</h1>
            <p>A Merchant Center account ID must be selected to view this dashboard.</p>
            <p>Please try logging in again or selecting an account if multiple are available.</p>
            <a href="/auth/google">Re-authenticate</a>
        `);
    }
    // Assuming your server.js has app.use(express.static('public'));
    res.sendFile('merchant_dashboard.html', { root: './public' });
});

/**
 * API Endpoint: Get available Merchant Center accounts for the authenticated user.
 * This is useful if a user has access to multiple MC accounts and needs to select one.
 */
router.get('/api/merchant-center/accounts', ensureAuthenticated, async (req, res) => {
    try {
        // The 'accounts/authinfo' endpoint tells you which accounts the token can access.
        // The 'accounts' endpoint lists accounts manageable by the user.
        // Using 'accounts/authinfo' first is often for checking linked accounts.
        // Using 'accounts' with no merchantId gives a list of accounts the user can manage.
        const response = await fetch('https://content.googleapis.com/content/v2.1/accounts/authinfo', {
        // Alternatively, to list accounts the user owns/manages:
        // const response = await fetch('https://content.googleapis.com/content/v2.1/accounts', {
            headers: {
                'Authorization': `Bearer ${req.session.tokens.access_token}`
            }
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error('Error fetching Merchant Center accounts/authinfo:', response.status, errorBody);
            throw new Error(`API Error ${response.status}: ${errorBody.error?.message || 'Failed to fetch accounts'}`);
        }

        const authInfo = await response.json();
        // The structure of authInfo.accountIdentifiers might vary.
        // It usually contains merchantId and sometimes aggregatorId for MCAs.
        const accounts = authInfo.accountIdentifiers || [];

        // Fetch details for each account to get names (optional, can be slow for many accounts)
        const detailedAccounts = await Promise.all(accounts.map(async (accId) => {
            if (!accId.merchantId && !accId.aggregatorId) return null; // Skip if no ID
            const idToFetch = accId.aggregatorId || accId.merchantId; // Prioritize MCA ID
             try {
                const accDetailsRes = await fetch(`https://content.googleapis.com/content/v2.1/accounts/${idToFetch}`, {
                     headers: { 'Authorization': `Bearer ${req.session.tokens.access_token}` }
                });
                if (accDetailsRes.ok) {
                    const detail = await accDetailsRes.json();
                    return {
                        id: detail.id, // This is the actual merchantId
                        name: detail.name || `Account ${detail.id}`,
                        isMCA: !!accId.aggregatorId || (detail.subaccounts && detail.subaccounts.length > 0) // Basic MCA check
                    };
                }
             } catch (e) { console.error(`Failed to fetch details for ${idToFetch}`, e.message); }
            return { id: idToFetch, name: `Account ${idToFetch} (details unavailable)`, isMCA: !!accId.aggregatorId }; // Fallback
        }));

        res.json({
            accounts: detailedAccounts.filter(Boolean), // Remove nulls
            selectedMerchantId: req.session.selectedMerchantId
        });

    } catch (error) {
        console.error('Error in /api/merchant-center/accounts:', error.message);
        res.status(500).json({ error: 'Failed to retrieve Merchant Center accounts', message: error.message });
    }
});

/**
 * API Endpoint: Select a Merchant Center account and save it to the session.
 */
router.post('/api/merchant-center/select-account', ensureAuthenticated, (req, res) => {
    const { merchantId } = req.body;
    if (!merchantId) {
        return res.status(400).json({ error: 'merchantId is required in the request body.' });
    }

    // You might want to validate here if the user actually has access to this merchantId
    // by checking against the list from '/api/merchant-center/accounts' if fetched previously.

    req.session.selectedMerchantId = String(merchantId); // Ensure it's a string
    req.session.save(err => {
        if (err) {
            console.error('Error saving selectedMerchantId to session:', err);
            return res.status(500).json({ error: 'Failed to save account selection.' });
        }
        console.log(`Merchant ID ${merchantId} selected and saved to session.`);
        res.json({ success: true, selectedMerchantId: req.session.selectedMerchantId });
    });
});


/**
 * API Endpoint: Get product data for the currently selected Merchant ID.
 */
router.get('/api/merchant-center/products', ensureAuthenticated, async (req, res) => {
    if (!req.session.selectedMerchantId) {
        return res.status(400).json({ error: 'No Merchant ID selected. Please select a Merchant Account first.' });
    }

    const merchantId = req.session.selectedMerchantId;
    let allProducts = [];
    let pageToken = null; // For pagination
    const maxResultsPerPage = 250; // Max allowed by API

    try {
        // Fetch details of the selected Merchant Account for display name
        let accountName = `Account ${merchantId}`; // Default
        try {
            const accDetailsRes = await fetch(`https://content.googleapis.com/content/v2.1/accounts/${merchantId}`, {
                 headers: { 'Authorization': `Bearer ${req.session.tokens.access_token}` }
            });
            if (accDetailsRes.ok) {
                const accountData = await accDetailsRes.json();
                accountName = accountData.name || accountName;
            } else {
                console.warn(`Could not fetch name for merchant account ${merchantId}. Status: ${accDetailsRes.status}`);
            }
        } catch (e) {
            console.warn(`Error fetching name for merchant account ${merchantId}: ${e.message}`);
        }


        do {
            const queryParams = new URLSearchParams({
                maxResults: maxResultsPerPage.toString()
            });
            if (pageToken) {
                queryParams.append('pageToken', pageToken);
            }

            const apiUrl = `https://content.googleapis.com/content/v2.1/products?merchantId=${merchantId}&${queryParams.toString()}`;
            console.log(`Workspaceing products: ${apiUrl}`); // Log the API URL for debugging

            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${req.session.tokens.access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error from Merchant Center Products API:', response.status, errorData);
                throw new Error(`API Error ${response.status}: ${errorData.error?.message || 'Failed to fetch products'}`);
            }

            const data = await response.json();
            if (data.resources) {
                allProducts = allProducts.concat(data.resources);
            }
            pageToken = data.nextPageToken;
        } while (pageToken); // Continue if there's a next page

        console.log(`Workspaceed ${allProducts.length} products for Merchant ID ${merchantId}.`);
        res.json({
            merchantId: merchantId,
            accountName: accountName,
            products: allProducts,
            totalProducts: allProducts.length
        });

    } catch (error) {
        console.error('Error in /api/merchant-center/products:', error.message);
        res.status(500).json({ error: 'Failed to retrieve products from Merchant Center', message: error.message });
    }
});

export default router;