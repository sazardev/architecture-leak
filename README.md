# architecture-leak

Static analysis engine for architectural boundary enforcement in Hexagonal and Clean Architecture systems.

## Overview
**architecture-leak** is a high-performance VS Code extension designed to maintain strict isolation between architectural layers. By utilizing a native static analysis engine written in Rust, the tool detects and prevents illegal dependency injections in real-time, ensuring that domain logic remains untainted by infrastructure concerns.

---

## Architectural Philosophy
In complex software systems, architectural erosion occurs when low-level implementation details leak into higher-level business logic. **architecture-leak** automates the enforcement of the Dependency Rule: dependencies must only point inwards. 

The engine monitors the project structure to ensure that:
1. **Domain** remains completely isolated from external frameworks and drivers.
2. **Application** logic only interacts with the Domain and its own interfaces.
3. **Infrastructure** serves as the outer shell, implementing the technical details required by the inner layers.

---

## Technical Specifications

| Component | Technology | Implementation |
| :--- | :--- | :--- |
| **Analysis Engine** | **Rust** | Native performance with zero-cost abstractions and minimal memory footprint. |
| **Protocol** | **LSP** | Language Server Protocol for asynchronous, non-blocking editor communication. |
| **Client Interface** | **TypeScript** | Lightweight VS Code integration layer. |
| **Build System** | **esbuild** | Optimized bundling for rapid extension activation. |

---

## Layer Enforcement Model

The engine classifies the project into three distinct tiers of visibility:

* **Tier 0: Domain**
    * The core business logic. 
    * **Restriction:** Cannot import from any other tier.
* **Tier 1: Application**
    * Use cases and orchestration.
    * **Restriction:** Can only import from Tier 0.
* **Tier 2: Infrastructure**
    * External adapters (DB, API, CLI, Cloud).
    * **Permitted:** Can import from Tier 0 and Tier 1.

Any violation of this hierarchy is flagged immediately within the editor as a critical architectural error.

---

## Configuration

Standard directory patterns (`internal/domain`, `internal/app`, `internal/infra`) are detected automatically. Custom boundaries can be defined via a `.architecture-leak.json` file in the project root:

```json
{
  "boundaries": {
    "tier0": ["src/domain", "pkg/entities"],
    "tier1": ["src/usecases", "pkg/services"],
    "tier2": ["src/infrastructure", "pkg/adapters"]
  },
  "options": {
    "severity": "error",
    "exclude": ["**/*_test.go", "**/vendor/**"]
  }
}