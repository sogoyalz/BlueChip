# BlueChip resume presentation

Verified locally on October 29, 2026. Describe only work you understand and can defend in an interview.

- Built a TypeScript trading application with React, Express, and MongoDB, integrating signed Gemini sandbox orders with durable order intents, concurrent-request deduplication, and recovery of uncertain exchange outcomes.
- Implemented a shared real-time market pipeline using WebSocket feeds, REST fallback, price caching, and Server-Sent Events, with freshness-aware portfolio valuation and indexed cursor pagination for order history.
- Validated trading, authentication, database persistence, accessibility, and browser workflows through 670 passing Jest, Vitest, and Playwright tests and automated production builds.

The count comes from an executed local check: 407 backend, 201 dashboard, 34 landing, and 28 browser tests (27 regular journeys plus one separate local HTTPS deployment check). Database integration tests use temporary MongoDB; regular-suite exchange writes are mocked/stubbed. A separate authorized live sandbox check also verified placement, cancellation, and lost-acknowledgement recovery; it is not counted as an automated-suite test. Do not turn this count into an unsupported coverage percentage or a production reliability claim.

Lead an interview demo with concurrent retries and lost-response recovery, then show older open orders, held-versus-available funds, delayed-data behavior, and the passing pipeline. Explain that every user shares one sandbox account and Gemini supplies the matching engine. Do not claim a personal brokerage, a custom matching engine, or exactly-once exchange execution.

The index experiment in the engineering plan used synthetic data and a candidate index; it is not a shipped production latency improvement. A bounded recent-event timeline and allowlisted operator lookup queue are implemented and tested. Exports, password recovery, a complete audit ledger, and investigated operator resolution remain backlog items; do not claim them as completed.
