# Single-instance pool-saturation experiment

## Summary headline

The strengthened ramp saturated the ten-connection pool and made the API scrape target unavailable without saturating Node CPU.

## Detailed body

### Configuration

| Field | Value |
| --- | --- |
| Date | 2026-09-30 |
| Architecture | k6 → one Express API → PostgreSQL |
| API instances | 1 (`api-1`) |
| PostgreSQL pool maximum | 10 |
| k6 request timeout | 2 seconds |
| Pool connection timeout | 5 seconds |
| Redis / load balancer / rate limiter | OFF / OFF / OFF |
| Script | `load-tests/ramp.js` |
| Requested traffic | 50 → 100 → 250 → 500 → 1,000 → 2,000 → 50 iterations/s |

### Measured result

| Measurement | Value |
| --- | ---: |
| Completed k6 iterations | 74,162 |
| Average completed iterations/s | 618.10 |
| Successful checks | 1,273 |
| Failed checks | 72,889 |
| HTTP failure rate | 98.28% |
| Dropped iterations | 3,837 |
| Overall p99 | 1,997.06 ms |
| Observed API CPU average / maximum | 3.73% / 8.07% |
| Active requests maximum | 97 |
| Pool connections maximum | 10 |
| Pool idle minimum | 0 |
| Pool waiters maximum | 118 |
| Event-loop lag maximum | approximately 30 ms |
| Successful Prometheus scrapes | approximately 20% of the test window |

The aggregate p95 of zero is not a valid success-latency signal because most connection failures ended before an HTTP response existed. The successful-response subset and the new diagnostic histograms should be used for future comparisons.

### Observations

Prometheus recorded the pool at its configured maximum, no idle clients, and a growing acquisition queue. Node CPU stayed low because requests primarily waited on I/O rather than performing computation. The API process start timestamp did not change, so the process did not restart during the observed window. PostgreSQL container logs contained routine checkpoints and no server crash.

Prometheus could not scrape the API for most of the run because `/metrics` shares the same Node process and network acceptance path as application traffic. Grafana gaps therefore indicate loss of target availability, not zero resource usage. The strengthened diagnostics were added after this run; the next identical run will separate pool waiting, SQL execution, pool timeouts, client aborts, and k6 network/5xx failures directly.
