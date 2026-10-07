# ScaleLab roadmap

This file records the order of major milestones. A deferred item stays here even when it is intentionally absent from the current application.

## Completed locally

- Flash-sale React, Express and PostgreSQL application
- Request IDs, instance identity and structured error logging
- Prometheus, Grafana and k6 baselines
- Single-instance capacity investigation
- Three API instances behind Nginx
- Redis cache-aside product reads
- Distributed rate limiting
- Kubernetes Deployment, Service, Ingress and CPU HPA
- PostgreSQL write observability and repeatable write tests
- Conditional atomic stock update with concurrent no-overselling coverage
- Two physical PostgreSQL shards with product-based application routing

## Next milestone: external deployment

Move the verified local Kubernetes architecture to an external environment before spending more time on local-only tuning.

The deployment milestone should cover:

1. Select a cloud provider and a cost limit.
2. Publish immutable API and web images to a container registry.
3. Create the Kubernetes cluster and namespaces.
4. Choose managed or self-hosted PostgreSQL and Redis for the first deployment.
5. Store credentials in deployment secrets rather than committed manifests.
6. Configure public ingress, DNS and TLS.
7. Deploy the API, web application, HPA and observability components.
8. Run database migrations safely as a deployment step.
9. Verify health, persistence, autoscaling and rollback behavior.
10. Run representative read and write tests from outside the cluster and record the first non-local baseline.

Provider-specific infrastructure is intentionally not added until the provider, budget, region and domain requirements are chosen.

## Deferred until after deployment

### Hot-product inventory buckets

Split one product's stock across several PostgreSQL rows so independent stock buckets can be updated concurrently. Test 1, 5, 10 and 20 buckets using the same hot-product workload. This is the preferred future experiment for demonstrating database write partitioning while retaining synchronous PostgreSQL transactions.

This is different from the implemented product-level database sharding: database sharding spreads different products across servers, while inventory buckets parallelize writes for one product.

Revisit when the deployed hot-product baseline shows that strict single-row inventory throughput is an important system requirement.

### Redis atomic inventory reservation

Use an atomic Redis script to reserve stock before PostgreSQL persistence. This changes Redis from disposable cache infrastructure into critical inventory infrastructure and therefore requires persistence, high availability, idempotent reservation IDs, compensation and reconciliation.

Revisit only after external deployment and after deciding whether the project should demonstrate eventual consistency.

### Queue-based order processing

Return a pending order response after placing a durable command on a queue, then let controlled workers persist orders at the database's sustainable rate. This provides buffering and backpressure but introduces pending states, retries, duplicate delivery, idempotency, dead-letter handling and queue-lag monitoring.

Revisit after deployment, preferably together with the Redis reservation experiment. A queue protects the database from spikes but does not by itself increase single-row PostgreSQL write throughput.

### Likely combined flash-sale experiment

```text
Client
  -> API
  -> atomic Redis reservation
  -> durable queue
  -> idempotent order worker
  -> PostgreSQL
```

This is a later educational architecture, not the next implementation step.

## Deferred operational refinements

- Separate dependency health from overloaded application pools so readiness does not amplify a traffic spike.
- Tune database resources and pools using measurements from the deployed environment.
- Evaluate database backups, point-in-time recovery and failover.
- Evaluate custom-metric HPA, node autoscaling and pod disruption policies.
- Decide whether Prometheus and Grafana should remain in-cluster or use managed services.

These are not forgotten; external measurements should determine their priority.
