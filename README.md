# OpenRaise

Open-source, self-hostable crowdfunding for African communities.

An open-source alternative to [Gathr](https://gathrhq.com),
[QuickRaiz](https://quickraiz.com), [GoFundMe](https://www.gofundme.com),
[M-Changa](https://www.mchanga.africa), [BackaBuddy](https://www.backabuddy.co.za)
and [Thundafund](https://www.thundafund.com).

Run your own fundraising platform: verified creators, donations by card, bank
transfer, USSD and mobile money, fast payouts to local bank accounts, and a
public money trail on every campaign so donors can see where their money went.
An NGO, a church, a diaspora association or a startup can deploy it under its
own name, with its own fees and its own payment account.

> **Status:** early development. See the roadmap in [`docs/`](docs/Home.md).

## Stack

- **API**: NestJS, PostgreSQL (Prisma), Redis
- **Web**: Next.js (App Router)
- **Shared**: TypeScript package with types and money maths used by both
- **Providers**: pluggable payments (Paystack, Bachs), identity checks, AI,
  storage and email

## Quick start

Requirements: Node 22+, pnpm, Docker.

```bash
pnpm install
docker compose up -d            # Postgres, Redis, S3 storage, Mailpit
cp .env.example apps/api/.env
pnpm dev                        # API on :4000, web on :3000
```

| Service                | URL                                       |
| ---------------------- | ----------------------------------------- |
| Web app                | http://localhost:3000                     |
| API                    | http://localhost:4000 (health: `/health`) |
| Mailpit (dev inbox)    | http://localhost:8025                     |
| S3 storage (SeaweedFS) | http://localhost:8333                     |

## Scripts

| Command          | What it does                                                 |
| ---------------- | ------------------------------------------------------------ |
| `pnpm dev`       | Build the shared package, then run API and web in watch mode |
| `pnpm test`      | Run every workspace's tests                                  |
| `pnpm lint`      | Lint with oxlint                                             |
| `pnpm typecheck` | Type-check every workspace                                   |
| `pnpm build`     | Production build of everything                               |

## Layout

```
apps/api         NestJS API
apps/web         Next.js web app
packages/shared  Shared types and money maths
docs/            Project docs (an Obsidian vault): roadmap, architecture, decisions
```

## Docs

The docs are an [Obsidian](https://obsidian.md) vault. Open `docs/` as a vault
and start at [Home](docs/Home.md). The roadmap tracker, architecture and design
decisions all live there.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, choosing work, checks and
pull requests, and the [code of conduct](CODE_OF_CONDUCT.md) for participation
expectations. Provider contributions start with the
[adapter guide](docs/Runbooks/Writing%20an%20adapter.md).

## License

[AGPL-3.0](LICENSE). If you run a modified OpenRaise as a public service, you
must publish your changes.
