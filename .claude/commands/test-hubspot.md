# Test HubSpot Integration

Verify HubSpot API connectivity and OAuth status.

## Instructions

### 1. Check OAuth Token Status
- Verify tokens are stored
- Check if refresh is needed
- Test token validity

### 2. Test API Connectivity
```bash
# Test contacts endpoint
curl -X GET "https://api.hubapi.com/crm/v3/objects/contacts?limit=1" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"

# Test deals endpoint
curl -X GET "https://api.hubapi.com/crm/v3/objects/deals?limit=1" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

### 3. Verify Webhook Configuration
- Check webhook subscription status
- Verify webhook URL is accessible
- Test signature validation

### 4. Check Rate Limit Status
- Current usage against limits
- Time until reset

## Usage

Run before implementing HubSpot-dependent features to ensure connectivity is working.
