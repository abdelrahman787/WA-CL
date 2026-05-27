# API quickstart

All examples assume `TS=<your-tailscale-ip>` and `KEY=<your-api-key>`.

## Authenticate

The API uses a static API key. Send it as `X-API-Key`.

```bash
curl -H "X-API-Key: $KEY" http://$TS:2785/api/auth/validate
# → {"valid":true,"role":"admin"}
```

## Send a message

```bash
curl -X POST http://$TS:2785/api/messages/send \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"default","to":"15551234567","text":"hi from OpenWA"}'
```

## Subscribe to events (webhook)

```bash
curl -X POST http://$TS:2785/api/webhooks \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://your-server.example.com/openwa",
    "events":["message.received","message.ack"]
  }'
```

Outbound requests are signed with HMAC-SHA256 of the body, using
`WEBHOOK_SECRET`, in the `X-OpenWA-Signature` header.

## Import a WhatsApp chat export

```bash
# 1. Upload (returns jobId; processing starts immediately)
JOB=$(curl -s -X POST http://$TS:2785/api/import/upload \
  -H "X-API-Key: $KEY" \
  -F "sessionId=default" \
  -F "file=@./WhatsApp Chat - Family Group.zip" | jq -r .jobId)

# 2. Poll status (or subscribe to ws room `import:$JOB`)
curl -H "X-API-Key: $KEY" http://$TS:2785/api/import/jobs/$JOB

# 3. Preview parsed messages
curl -H "X-API-Key: $KEY" "http://$TS:2785/api/import/jobs/$JOB/preview?page=1"

# 4. Map participants to existing users (or create new)
curl -X POST http://$TS:2785/api/import/jobs/$JOB/map-users \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"mappings":[{"senderName":"Ahmed","action":"create_new","newUserData":{"displayName":"Ahmed Mohamed"}}]}'

# 5. Confirm — writes to the chat
curl -X POST http://$TS:2785/api/import/jobs/$JOB/confirm \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"chatTitle":"Family Group","preserveTimestamps":true,"sessionId":"default"}'
```

## JavaScript SDK

```js
import { OpenWA } from '@openwa/sdk';
const wa = new OpenWA({ baseUrl: `http://${TS}:2785`, apiKey: KEY });
await wa.messages.send({ sessionId: 'default', to: '15551234567', text: 'hello' });
```

Full reference: `http://<ts-ip>:2785/api/docs` (Swagger UI).
