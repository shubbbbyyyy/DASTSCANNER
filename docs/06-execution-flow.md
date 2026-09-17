# Module 6: End-to-End Execution Flow

This document traces the **complete pipeline lifecycle** from trigger to report, showing how all modules interact.

---

## Master Flowchart

```mermaid
flowchart TD
    subgraph Phase 1 - Trigger and Validation
        T1([Manual Trigger])
        T2([Scheduled Trigger])
        INPUTS[Collect Inputs]
        RESOLVE[Resolve Target URL]
        VALIDATE{Valid?}
        REJECT[REJECT]
    end

    subgraph Phase 2 - Configuration Merge
        READ_EXCLUDE[Read exclude-categories.yml]
        EVAL_TOGGLES[Evaluate 5 Boolean Toggles]
        MERGE[Merge Selected Patterns]
        REWRITE[Rewrite automation.yml]
    end

    subgraph Phase 3 - ZAP Launch
        DOCKER[Launch Docker Container]
        ADDONS[Install Add-ons]
        AUTORUN[Run ZAP Autorun]
    end

    subgraph Phase 4 - Scan Execution
        IMPORT_SEED[Import Postman Collections]
        ADMIN_AUTH[Admin Login]
        ADMIN_SPIDER[Admin Spider]
        ADMIN_ACTIVE[Admin Active Scan]
        USER_AUTH[User Login]
        USER_SPIDER[User Spider]
        USER_ACTIVE[User Active Scan]
        PROV_AUTH[Provider Login]
        PROV_SPIDER[Provider Spider]
        PROV_ACTIVE[Provider Active Scan]
    end

    subgraph Phase 5 - Report and Upload
        SARIF_GEN[Generate SARIF]
        HTML_GEN[Generate HTML]
        UPLOAD_SARIF[Upload to Code Scanning]
        UPLOAD_ARTIFACT[Upload as Artifacts]
        EXIT_CODE{ZAP Exit Code}
        PASS([Pass])
        WARN([Warning])
        FAIL([Fail])
    end

    T1 --> INPUTS
    T2 --> INPUTS
    INPUTS --> RESOLVE --> VALIDATE
    VALIDATE -->|Invalid| REJECT
    VALIDATE -->|Valid| READ_EXCLUDE

    READ_EXCLUDE --> EVAL_TOGGLES --> MERGE --> REWRITE
    REWRITE --> DOCKER --> ADDONS --> AUTORUN
    AUTORUN --> IMPORT_SEED

    IMPORT_SEED --> ADMIN_AUTH --> ADMIN_SPIDER --> ADMIN_ACTIVE
    ADMIN_ACTIVE --> USER_AUTH --> USER_SPIDER --> USER_ACTIVE
    USER_ACTIVE --> PROV_AUTH --> PROV_SPIDER --> PROV_ACTIVE

    PROV_ACTIVE --> SARIF_GEN --> HTML_GEN
    HTML_GEN --> UPLOAD_SARIF --> UPLOAD_ARTIFACT --> EXIT_CODE
    EXIT_CODE -->|0| PASS
    EXIT_CODE -->|2| WARN
    EXIT_CODE -->|other| FAIL

    style REJECT fill:#ff6b6b,color:#fff
    style PASS fill:#51cf66,color:#fff
    style WARN fill:#ffd43b,color:#000
    style FAIL fill:#ff6b6b,color:#fff
```

---

## Module Interaction Map

```mermaid
graph TB
    subgraph Orchestration
        WF[dastscanner.yml]
    end

    subgraph Configuration
        EC[exclude-categories.yml]
        AUTO[automation.yml]
        OTP[otp-signin-auth.js]
    end

    subgraph API Catalog
        PC_A[collection-admin.json]
        PC_U[collection-user.json]
    end

    subgraph Runtime
        ZAP[ZAP Docker Container]
        ADDON_PM[postman add-on]
        ADDON_AH[authhelper add-on]
        ADDON_GJ[graaljs add-on]
    end

    subgraph Output
        SARIF[zap-dast.json]
        HTML[zap-dast-report.html]
        GCS[GitHub Code Scanning]
        ARTIFACT[Workflow Artifacts]
    end

    WF -->|reads toggles| EC
    WF -->|rewrites at runtime| AUTO
    WF -->|launches| ZAP
    WF -->|injects secrets| ZAP

    AUTO -->|autorun plan| ZAP
    AUTO -->|imports| PC_A
    AUTO -->|imports| PC_U
    AUTO -->|runs script| OTP

    ZAP -->|installs| ADDON_PM
    ZAP -->|installs| ADDON_AH
    ZAP -->|installs| ADDON_GJ

    ADDON_PM -->|imports collections| PC_A
    ADDON_PM -->|imports collections| PC_U
    ADDON_AH -->|injects Bearer token| ZAP
    ADDON_GJ -->|executes| OTP

    ZAP -->|generates| SARIF
    ZAP -->|generates| HTML
    SARIF -->|upload-sarif action| GCS
    SARIF -->|upload-artifact action| ARTIFACT
    HTML -->|upload-artifact action| ARTIFACT
```

---

## Timing Breakdown

```mermaid
gantt
    title Pipeline Execution Timeline (Approximate)
    dateFormat mm:ss
    axisFormat %M:%S

    section Setup
    Checkout and Validate    :a1, 00:00, 5s
    Merge Exclusions         :a2, after a1, 3s
    Docker Launch and Addons :a3, after a2, 30s

    section Admin
    Postman Import Admin     :b1, after a3, 5s
    Admin Spider             :b2, after b1, 5m
    Admin SpiderAjax         :b3, after b2, 5m
    Admin Passive Wait       :b4, after b3, 5m
    Admin Active Scan        :b5, after b4, 35m

    section User
    Postman Import User      :c1, after b5, 5s
    User Spider              :c2, after c1, 5m
    User SpiderAjax          :c3, after c2, 5m
    User Passive Wait        :c4, after c3, 5m
    User Active Scan         :c5, after c4, 35m

    section Provider
    Provider Spider          :d1, after c5, 5m
    Provider SpiderAjax      :d2, after d1, 5m
    Provider Passive Wait    :d3, after d2, 5m
    Provider Active Scan     :d4, after d3, 35m

    section Reports
    Generate Reports         :e1, after d4, 10s
    Upload Results           :e2, after e1, 10s
```

**Estimated total:** ~100–110 minutes (with generous timeouts)

---

## Data Flow Through the Pipeline

```mermaid
flowchart LR
    subgraph Input Data
        SECRETS[GitHub Secrets]
        TOGGLES[Workflow Inputs]
        URL[Target URL]
    end

    subgraph Static Config
        AUTOMATION_YML[automation.yml]
        EXCLUDE_YML[exclude-categories.yml]
        POSTMAN_A[collection-admin.json]
        POSTMAN_U[collection-user.json]
        OTP_JS[otp-signin-auth.js]
    end

    subgraph Runtime Artifacts
        MODIFIED_YML[automation.yml - modified]
        ZAP_LOG[ZAP Scan Log]
    end

    subgraph Output Data
        SARIF_OUT[zap-dast.json]
        HTML_OUT[zap-dast-report.html]
    end

    subgraph External Systems
        GITHUB_SC[GitHub Code Scanning]
        ARTIFACTS[Workflow Artifacts]
    end

    SECRETS --> ZAP_LOG
    TOGGLES --> MODIFIED_YML
    URL --> ZAP_LOG
    AUTOMATION_YML --> MODIFIED_YML
    EXCLUDE_YML --> MODIFIED_YML
    POSTMAN_A --> ZAP_LOG
    POSTMAN_U --> ZAP_LOG
    OTP_JS --> ZAP_LOG
    MODIFIED_YML --> ZAP_LOG
    ZAP_LOG --> SARIF_OUT
    ZAP_LOG --> HTML_OUT
    SARIF_OUT --> GITHUB_SC
    SARIF_OUT --> ARTIFACTS
    HTML_OUT --> ARTIFACTS
```

---

## Security Controls in the Pipeline

| Control | Layer | Purpose |
|---------|-------|---------|
| SHA-pinned Actions | Supply chain | Prevents tag-switching attacks on GitHub Actions |
| `permissions: contents: read` | Least privilege | Minimizes token scope |
| `confirm-authorized` input | Human gate | Prevents accidental scans |
| `allow-production` gate | Safety | Blocks prod URLs by default |
| Exclusion categories | Risk mitigation | Prevents scanning dangerous endpoints |
| ZAP exit codes | Fail-fast | High-risk findings block the pipeline |
| SARIF upload | Visibility | Findings appear in GitHub Security tab |
| 30-day artifact retention | Audit trail | Reports available for review |

---

## Failure Modes

```mermaid
flowchart TD
    FAIL([Pipeline Failure]) --> F1{Failure Type?}

    F1 -->|Target URL invalid| F1A[No scan runs]
    F1 -->|Docker pull fails| F1B[Job fails immediately]
    F1 -->|ZAP add-on install fails| F1C[Job fails]
    F1 -->|Auth fails for all roles| F1D[Scan runs unauthenticated]
    F1 -->|ZAP crashes| F1E[Job fails]
    F1 -->|Active scan finds High risk| F1F[Job fails]
    F1 -->|SARIF upload fails| F1G[Reports available as artifacts]

    F1A --> DIAG[Diagnose from job log]
    F1B --> DIAG
    F1C --> DIAG
    F1D --> DIAG
    F1E --> DIAG
    F1F --> DIAG
    F1G --> DIAG

    style FAIL fill:#ff6b6b,color:#fff
    style DIAG fill:#ffd43b,color:#000
```

---

## Key Observations

1. **No application source code** — This repo contains zero application code. It's purely security testing infrastructure. The Postman collections are the only representation of the target API.

2. **New repository** — Only 2 git commits exist. This is a fresh project.

3. **Untested OTP script** — The custom authentication script has not been validated against the real API. Manual ZAP Desktop testing is required before CI reliance.

4. **~2 hour runtime** — The three-role sequential scan with generous timeouts means each run takes approximately 100–110 minutes. The 240-minute timeout provides headroom.

5. **ARM runner** — Using `ubuntu-24.04-arm` for cost efficiency. The ZAP Docker image supports ARM natively.
