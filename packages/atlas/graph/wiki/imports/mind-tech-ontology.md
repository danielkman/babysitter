---
id: page:mind-tech-ontology-import
nodeKind: Page
title: "MIND Tech Ontology Alignment"
slug: "imports/mind-tech-ontology"
articlePath: "wiki/imports/mind-tech-ontology.md"
documents:
  - source-ref:mind-tech-ontology
  - source-ref:mind-tech-ontology-readme
  - domain:backend
  - domain:frontend
  - domain:fullstack
  - domain:ml-ai
  - domain:qa-testing
  - domain:blockchain
  - domain:iot
  - domain:mobile
  - domain:systems-programming
  - domain:data-engineering
  - domain:data-science
  - domain:devops
  - domain:ml-ops
  - domain:networking
  - domain:cybersecurity
  - domain:embedded-systems
  - domain:gaming
  - specialization:game-development
  - specialization:web-development
  - skill-area:service-mocking
  - skill-area:acceptance-testing
  - skill-area:regression-testing
  - skill-area:smoke-testing
  - skill-area:frontend-routing
  - skill-area:form-management
  - skill-area:authentication-authorization
  - skill-area:configuration-management
  - skill-area:data-validation-sanitization
  - skill-area:serialization-deserialization
  - skill-area:caching-strategies
  - skill-area:messaging-queuing
  - skill-area:search-indexing
  - skill-area:background-job-processing
  - skill-area:streaming-realtime-processing
  - skill-area:email-notification-delivery
  - skill-area:data-fetching-caching
  - skill-area:application-state-management
  - skill-area:animation-transitions
  - skill-area:data-visualization
  - skill-area:ui-styling
  - skill-area:component-testing
  - skill-area:cross-browser-testing
  - skill-area:frontend-performance-testing
  - skill-area:natural-language-processing
  - skill-area:data-quality-testing
  - skill-area:model-serving-operations
  - skill-area:model-monitoring-drift-detection
  - skill-area:agent-planning-reasoning
  - skill-area:multi-agent-coordination
  - topic:clean-architecture
  - topic:onion-architecture
  - topic:microservices-architecture
  - topic:serverless-architecture
  - topic:backend-for-frontend
  - topic:retry-pattern
  - topic:timeout-pattern
  - topic:single-page-application
  - topic:progressive-web-application
  - topic:static-site-generation
  - topic:rest
  - topic:message-driven-architecture
  - topic:layered-architecture
  - topic:service-oriented-architecture
  - topic:publish-subscribe
  - topic:request-reply
  - topic:sidecar-pattern
  - topic:sharding
  - topic:bulkhead-pattern
  - topic:client-side-rendering
  - topic:incremental-static-regeneration
  - topic:code-splitting
  - topic:finite-state-machine
  - topic:micro-frontend-architecture
  - topic:jamstack-architecture
  - topic:offline-first
---
# MIND Tech Ontology Alignment

Atlas now references the public MIND Tech Skills and Concepts Ontology through
[`source-ref:mind-tech-ontology`](/n/source-ref:mind-tech-ontology) and its
README companion [`source-ref:mind-tech-ontology-readme`](/n/source-ref:mind-tech-ontology-readme).

## Alignment policy

1. Reuse existing Atlas nodes when the external concept already has a graph-native home.
2. Add a new Atlas node only when the concept is broad, clearly distinct, and
   connects cleanly to existing Atlas domains or specializations.
3. Do not mirror MIND's leaf technologies blindly. Frameworks, tools, services,
   providers, and databases should resolve to existing Atlas nodes or wait for
   manual curation.

## Manual top-level mappings

- MIND `Backend` -> [`domain:backend`](/n/domain:backend)
- MIND `Frontend` -> [`domain:frontend`](/n/domain:frontend)
- MIND `Fullstack` -> [`domain:fullstack`](/n/domain:fullstack)
- MIND `Mobile` -> [`domain:mobile`](/n/domain:mobile)
- MIND `Embedded Systems` -> [`domain:embedded-systems`](/n/domain:embedded-systems)
- MIND `Systems Programming` -> [`domain:systems-programming`](/n/domain:systems-programming)
- MIND `DevOps` -> [`domain:devops`](/n/domain:devops)
- MIND `MLOps` -> [`domain:ml-ops`](/n/domain:ml-ops)
- MIND `Data Engineering` -> [`domain:data-engineering`](/n/domain:data-engineering)
- MIND `Data Science` -> [`domain:data-science`](/n/domain:data-science)
- MIND `ML/AI` -> [`domain:ml-ai`](/n/domain:ml-ai)
- MIND `Networking` -> [`domain:networking`](/n/domain:networking)
- MIND `Cybersecurity` -> [`domain:cybersecurity`](/n/domain:cybersecurity)
- MIND `QA/Testing` -> [`domain:qa-testing`](/n/domain:qa-testing)
- MIND `Blockchain` -> [`domain:blockchain`](/n/domain:blockchain)
- MIND `IoT` -> [`domain:iot`](/n/domain:iot)
- MIND `Game Development` -> [`specialization:game-development`](/n/specialization:game-development) within [`domain:gaming`](/n/domain:gaming)

## Curated second-pass additions

The second pass keeps the manual policy but fills gaps where MIND exposed broad
practice areas that Atlas did not yet model cleanly.

### Added skill areas

- Testing: [`skill-area:service-mocking`](/n/skill-area:service-mocking), [`skill-area:acceptance-testing`](/n/skill-area:acceptance-testing), [`skill-area:regression-testing`](/n/skill-area:regression-testing), [`skill-area:smoke-testing`](/n/skill-area:smoke-testing)
- Frontend/web: [`skill-area:frontend-routing`](/n/skill-area:frontend-routing), [`skill-area:form-management`](/n/skill-area:form-management)
- Platform/application: [`skill-area:authentication-authorization`](/n/skill-area:authentication-authorization), [`skill-area:configuration-management`](/n/skill-area:configuration-management), [`skill-area:data-validation-sanitization`](/n/skill-area:data-validation-sanitization), [`skill-area:serialization-deserialization`](/n/skill-area:serialization-deserialization), [`skill-area:caching-strategies`](/n/skill-area:caching-strategies), [`skill-area:messaging-queuing`](/n/skill-area:messaging-queuing), [`skill-area:search-indexing`](/n/skill-area:search-indexing), [`skill-area:background-job-processing`](/n/skill-area:background-job-processing), [`skill-area:streaming-realtime-processing`](/n/skill-area:streaming-realtime-processing), [`skill-area:email-notification-delivery`](/n/skill-area:email-notification-delivery)
- UI/data quality: [`skill-area:data-fetching-caching`](/n/skill-area:data-fetching-caching), [`skill-area:application-state-management`](/n/skill-area:application-state-management), [`skill-area:animation-transitions`](/n/skill-area:animation-transitions), [`skill-area:data-visualization`](/n/skill-area:data-visualization), [`skill-area:ui-styling`](/n/skill-area:ui-styling), [`skill-area:component-testing`](/n/skill-area:component-testing), [`skill-area:cross-browser-testing`](/n/skill-area:cross-browser-testing), [`skill-area:frontend-performance-testing`](/n/skill-area:frontend-performance-testing), [`skill-area:data-quality-testing`](/n/skill-area:data-quality-testing)
- AI/ML: [`skill-area:model-monitoring-drift-detection`](/n/skill-area:model-monitoring-drift-detection), [`skill-area:agent-planning-reasoning`](/n/skill-area:agent-planning-reasoning), [`skill-area:multi-agent-coordination`](/n/skill-area:multi-agent-coordination)
- AI/ML additional: [`skill-area:natural-language-processing`](/n/skill-area:natural-language-processing), [`skill-area:model-serving-operations`](/n/skill-area:model-serving-operations)

### Added topics

- Architecture: [`topic:clean-architecture`](/n/topic:clean-architecture), [`topic:onion-architecture`](/n/topic:onion-architecture), [`topic:microservices-architecture`](/n/topic:microservices-architecture), [`topic:serverless-architecture`](/n/topic:serverless-architecture), [`topic:backend-for-frontend`](/n/topic:backend-for-frontend)
- Reliability: [`topic:retry-pattern`](/n/topic:retry-pattern), [`topic:timeout-pattern`](/n/topic:timeout-pattern)
- Web app shape: [`topic:single-page-application`](/n/topic:single-page-application), [`topic:progressive-web-application`](/n/topic:progressive-web-application), [`topic:static-site-generation`](/n/topic:static-site-generation)
- Service and integration: [`topic:rest`](/n/topic:rest), [`topic:message-driven-architecture`](/n/topic:message-driven-architecture), [`topic:service-oriented-architecture`](/n/topic:service-oriented-architecture), [`topic:publish-subscribe`](/n/topic:publish-subscribe), [`topic:request-reply`](/n/topic:request-reply), [`topic:sidecar-pattern`](/n/topic:sidecar-pattern)
- Additional architecture/frontend: [`topic:layered-architecture`](/n/topic:layered-architecture), [`topic:sharding`](/n/topic:sharding), [`topic:bulkhead-pattern`](/n/topic:bulkhead-pattern), [`topic:client-side-rendering`](/n/topic:client-side-rendering), [`topic:incremental-static-regeneration`](/n/topic:incremental-static-regeneration), [`topic:code-splitting`](/n/topic:code-splitting), [`topic:finite-state-machine`](/n/topic:finite-state-machine), [`topic:micro-frontend-architecture`](/n/topic:micro-frontend-architecture), [`topic:jamstack-architecture`](/n/topic:jamstack-architecture), [`topic:offline-first`](/n/topic:offline-first)

### Reused Atlas nodes instead of adding duplicates

- MIND `Retrieval-Augmented Generation (RAG) Setup` reuses [`skill-area:retrieval-augmented-generation`](/n/skill-area:retrieval-augmented-generation)
- MIND `State Management` reuses [`skill-area:react-state-management`](/n/skill-area:react-state-management) for the existing frontend-react branch
- MIND `GraphQL` reuses the existing language and schema-design nodes rather than a broad duplicate topic: [`language:graphql`](/n/language:graphql), [`topic:graphql-schema-design`](/n/topic:graphql-schema-design), [`skill-area:graphql-schema-design`](/n/skill-area:graphql-schema-design)
- MIND `API Gateway` and `Service Mesh` map to existing stack parts instead of new topics: [`stack-part:api-gateway`](/n/stack-part:api-gateway), [`stack-part:service-mesh`](/n/stack-part:service-mesh)
- MIND `Containerization & Orchestration`, `Secret & Secure Config Management`, `Model Serving & Deployment`, and `Canary`-style deploy concepts reuse existing Atlas nodes: [`skill-area:containerization`](/n/skill-area:containerization), [`skill-area:secrets-rotation`](/n/skill-area:secrets-rotation), [`stack-part:model-serving`](/n/stack-part:model-serving), [`specialization:ml-inference-serving`](/n/specialization:ml-inference-serving), [`skill-area:canary-rollouts`](/n/skill-area:canary-rollouts)
- MIND queue, scheduling, notification, and event-stream concepts are anchored to existing stack parts instead of duplicating vendor-specific abstractions: [`stack-part:event-bus`](/n/stack-part:event-bus), [`stack-part:scheduler`](/n/stack-part:scheduler), [`stack-part:workflow-engine`](/n/stack-part:workflow-engine), [`stack-part:notification-service`](/n/stack-part:notification-service), [`stack-part:email-delivery`](/n/stack-part:email-delivery), [`stack-part:cache`](/n/stack-part:cache), [`stack-part:search-index`](/n/stack-part:search-index)
- MIND `Circuit Breaker`, `Contract Testing`, `Chaos Engineering`, `Hydration`, and `Hexagonal Architecture` already existed and were retained as-is: [`topic:circuit-breakers`](/n/topic:circuit-breakers), [`skill-area:contract-testing`](/n/skill-area:contract-testing), [`skill-area:chaos-engineering`](/n/skill-area:chaos-engineering), [`skill-area:hydration`](/n/skill-area:hydration), [`skill-area:hexagonal-architecture`](/n/skill-area:hexagonal-architecture)
- MIND `Test-Driven Development (TDD)` and `Behavior-Driven Development (BDD)` already exist in terminology: [`term:test-driven-development`](/n/term:test-driven-development), [`term:behavior-driven-development`](/n/term:behavior-driven-development)

## Why the bulk import was removed

The raw dump created duplicate and mis-typed nodes such as service-vs-tool,
library-vs-tool, and framework-vs-service collisions. Examples included
technology names already present elsewhere in Atlas under more accurate node
kinds. That import was removed so Atlas remains coherent and connected to its
existing graph structure.
