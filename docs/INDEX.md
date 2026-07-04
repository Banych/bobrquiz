# Documentation Index – Bobr Quiz

Welcome! This is your navigation hub for all documentation. Use this to find exactly what you need.

## 📍 Quick Navigation

### First Time Here?
1. Read [ARCHITECTURE.md](ARCHITECTURE.md) – 15 min overview of design decisions & layer contracts
2. Check [plan.md](plan.md) – Understand the product roadmap and release goals
3. Run `yarn dev` – Start the dev server
4. Follow [guides/SETUP.md](guides/SETUP.md) if you need detailed setup steps

### Need Help With...

| Task                                  | Document                                                     |
| ------------------------------------- | ------------------------------------------------------------ |
| **Understand the codebase structure** | [ARCHITECTURE.md](ARCHITECTURE.md)                           |
| **Set up the project locally**        | [guides/SETUP.md](guides/SETUP.md)                           |
| **Build a new domain feature**        | [guides/DDD-STRUCTURE.md](guides/DDD-STRUCTURE.md)           |
| **Work with the database**            | [guides/DATA-LAYER.md](guides/DATA-LAYER.md)                 |
| **Build UI and hooks**                | [guides/PRESENTATION-LAYER.md](guides/PRESENTATION-LAYER.md) |
| **Upload images to quizzes**          | [guides/MEDIA-UPLOADS.md](guides/MEDIA-UPLOADS.md)           |
| **See what was built recently**       | [PROGRESS.md](progress/PROGRESS.md)                          |
| **Review architecture decisions**     | [DECISION-LOG.md](DECISION-LOG.md)                           |
| **Check the roadmap**                 | [plan.md](plan.md)                                           |

---

## 📚 Documentation Structure

### Core References
- **[ARCHITECTURE.md](ARCHITECTURE.md)** – DDD-lite patterns, tech stack, layer contracts, common patterns
- **[DECISION-LOG.md](DECISION-LOG.md)** – Architecture decision records (why Prisma v7 + adapter, why Supabase Realtime, etc.)
- **[plan.md](plan.md)** – Product vision, personas, release roadmap, milestones

### Getting Started Guides
- **[guides/SETUP.md](guides/SETUP.md)** – Bootstrap project, tooling, environment variables
- **[guides/DDD-STRUCTURE.md](guides/DDD-STRUCTURE.md)** – Define domain entities, value objects, aggregates, repositories
- **[guides/DATA-LAYER.md](guides/DATA-LAYER.md)** – Prisma schema, migrations, repository implementations
- **[guides/PRESENTATION-LAYER.md](guides/PRESENTATION-LAYER.md)** – API routes, hooks, realtime adapter, components
- **[guides/MEDIA-UPLOADS.md](guides/MEDIA-UPLOADS.md)** – Image upload feature, Supabase Storage setup

### Progress Tracking
- **[PROGRESS.md](progress/PROGRESS.md)** – Index of releases, session notes, completed items
- **[progress/dev-notes.md](progress/dev-notes.md)** – Execution log, recent changes, current phase
- **[progress/sessions/](progress/sessions/)** – Dated session notes (manual work, debugging, learnings)
- **[progress/actions/](progress/actions/)** – Release checklists and feature action items

### Visual References
- **[mockups/](mockups/)** – UX mockups and layout references

---

## 🎯 By Role

### **Product Manager / Designer**
Start here:
1. [plan.md](plan.md) – Roadmap and release goals
2. [PROGRESS.md](progress/PROGRESS.md) – What's been built, what's next
3. [mockups/](mockups/) – Visual design reference

### **Backend Engineer**
Start here:
1. [ARCHITECTURE.md](ARCHITECTURE.md) – Layer contracts
2. [guides/DDD-STRUCTURE.md](guides/DDD-STRUCTURE.md) – Domain entity patterns
3. [guides/DATA-LAYER.md](guides/DATA-LAYER.md) – Prisma & repository patterns

### **Frontend Engineer**
Start here:
1. [ARCHITECTURE.md](ARCHITECTURE.md) – Data flow overview
2. [guides/PRESENTATION-LAYER.md](guides/PRESENTATION-LAYER.md) – Routes, hooks, components
3. [guides/MEDIA-UPLOADS.md](guides/MEDIA-UPLOADS.md) – Feature example

### **QA / Test Engineer**
Start here:
1. [PROGRESS.md](progress/PROGRESS.md) – What features exist
2. [guides/PRESENTATION-LAYER.md](guides/PRESENTATION-LAYER.md#testing) – Testing strategy
3. [progress/sessions/](progress/sessions/) – Recent testing sessions & learnings

### **DevOps / Infrastructure**
Start here:
1. [guides/SETUP.md](guides/SETUP.md#environment-files) – Environment setup
2. [DECISION-LOG.md](DECISION-LOG.md) – Tech stack decisions (Vercel, Supabase, Prisma)
3. [plan.md](plan.md#cross-cutting-workstreams) – Observability & deployment strategy

### **New Team Member**
Complete this sequence:
1. [guides/SETUP.md](guides/SETUP.md) – Get the project running locally (30 min)
2. [ARCHITECTURE.md](ARCHITECTURE.md) – Understand the design (45 min)
3. [PROGRESS.md](progress/PROGRESS.md) – See what's been built (15 min)
4. Pick a guide based on your role above (60 min)
5. Read recent session notes to understand current pain points

---

## 📖 Key Concepts

### The DTO → Entity → Service Flow
DTOs (data contracts) are validated, mapped to domain entities (business logic), orchestrated by application services, persisted via repositories. See **ARCHITECTURE.md** → **Data Flow** section.

### Domain-Driven Design (DDD-Lite)
Business rules live in pure domain layer, stay framework-agnostic. Presentation consumes DTOs, never entities. See **ARCHITECTURE.md** → **Core Architecture** and **[guides/DDD-STRUCTURE.md](guides/DDD-STRUCTURE.md)**.

### Prisma v7 + Driver Adapter
We use `@prisma/adapter-pg` for Vercel Edge compatibility. See **ARCHITECTURE.md** → **Design Decisions** → **Prisma v7 + Driver Adapter**.

### Supabase Realtime for <300ms Latency
Supabase Realtime broadcasts quiz updates. TanStack Query caches are manually updated by event handlers. See **ARCHITECTURE.md** → **Data Flow** → **Realtime Event Path**.

### Iterative Test Development
Write E2E tests by first manually exploring UI via Playwright MCP, then automating based on observations. See **PROGRESS.md** and **progress/sessions/2025-12-20-admin-question-crud-rewrite.md**.

---

## 🔄 Update Patterns

When documentation gets stale, please update it immediately:

- **Architecture change?** Update [ARCHITECTURE.md](ARCHITECTURE.md) and add an entry to [DECISION-LOG.md](DECISION-LOG.md)
- **New env var?** Update [guides/SETUP.md](guides/SETUP.md#environment-files)
- **New DTOs or layer patterns?** Update relevant guide + [ARCHITECTURE.md](ARCHITECTURE.md)
- **Completed work?** Append to [progress/dev-notes.md](progress/dev-notes.md) and reference session file
- **New design decision?** Add timestamped entry to [DECISION-LOG.md](DECISION-LOG.md)

**Remember**: Stale documentation is a code smell. If you find outdated info, fix it immediately or flag it in a comment.

---

## 📞 Glossary

| Term               | Definition                                                                       |
| ------------------ | -------------------------------------------------------------------------------- |
| **DTO**            | Data Transfer Object – serializable shape for API/hook contracts (zod-validated) |
| **Entity**         | Domain object with identity and mutable behavior (Quiz, Player, Answer)          |
| **Value Object**   | Immutable domain object identified by equality (Score, Timer, JoinCode)          |
| **Aggregate**      | Cluster of entities under single root (QuizSessionAggregate)                     |
| **Repository**     | Interface for persistence; Prisma implements it                                  |
| **Use Case**       | Single-purpose orchestrator of entities (StartQuizUseCase)                       |
| **Service**        | Facade grouping related use cases (QuizService)                                  |
| **DDD**            | Domain-Driven Design – organize code around business rules, not frameworks       |
| **Realtime**       | Supabase Realtime channel for <300ms quiz updates                                |
| **TanStack Query** | Server state cache; manages fetching, caching, mutations                         |
| **Middleware**     | Next.js middleware for auth/redirect logic                                       |
| **RLS**            | Row-Level Security – database policies enforcing auth                            |

---

## 🔗 Related Repositories & External Docs

- **Supabase Docs**: https://supabase.com/docs
- **Prisma Docs**: https://www.prisma.io/docs
- **Next.js Docs**: https://nextjs.org/docs
- **TanStack Query Docs**: https://tanstack.com/query/latest
- **Tailwind CSS**: https://tailwindcss.com
- **shadcn/ui**: https://ui.shadcn.com

---

## ❓ Didn't Find What You're Looking For?

1. **Search** the docs using your editor's search function (Cmd/Ctrl + Shift + F)
2. **Check [progress/dev-notes.md](progress/dev-notes.md)** for recent changes
3. **Review session notes** in [progress/sessions/](progress/sessions/) for context on recent work
4. **Ask the team** – documentation gaps are bugs
