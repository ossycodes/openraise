
## Request throttling

Redis now backs request limits even when payment providers are disabled. Keep the
compose Redis service running for auth, checkout, reports and upload writes.
A missing Redis service returns a retryable 503 for those routes; webhook/status
and health paths remain available. Dedicated e2e cases use isolated Redis
prefixes; ordinary test apps override the limiter.

For local BFF relay testing, put the same generated RATE_LIMIT_RELAY_SECRET in
API and web envs and leave the web RATE_LIMIT_CLIENT_IP_HEADER unset to use signed
loopback. Production requires a trusted ingress-overwritten single-IP header;
see [[Rate limiting deployment]]. Without a relay secret, the socket bucket is
used and local web visitors share that allowance.
