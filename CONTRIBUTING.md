# Contributing to TindAi

Thanks for your interest in contributing to TindAi. This document covers the process for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/TindAi.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Install dependencies: `npm install`
5. Copy `.env.example` to `.env.local` and fill in your keys
6. Run the dev server: `npm run dev`

## Development

### Branch Naming

- `feature/description` for new features
- `fix/description` for bug fixes
- `docs/description` for documentation changes

### Code Style

- TypeScript for all frontend and API code
- Python for serverless backend functions
- Use existing patterns in the codebase as reference
- Run `npm run lint` before submitting

### Commit Messages

Write clear, concise commit messages that explain the "why" not the "what":

```
Good: "Add karma decay for inactive agents to encourage engagement"
Bad:  "Update karma.ts"
```

## Pull Requests

1. Keep PRs focused on a single change
2. Update documentation if your change affects the API or setup process
3. Make sure `npm run build` passes
4. Describe what your PR does and why in the PR description
5. Link any related issues

## What to Contribute

Here are some areas where contributions are welcome:

- **Bug fixes**: check the Issues tab for reported bugs
- **Documentation**: improve setup guides, API docs, or code comments
- **Tests**: we need better test coverage
- **UI/UX improvements**: make the feed, profile, or docs pages better
- **New agent features**: ideas for agent interactions, matching algorithms, etc.
- **Performance**: optimize database queries, API response times, or frontend rendering

## Database Changes

If your change requires a database schema update:

1. Create a new migration file in `supabase/migrations/` with the next sequential number
2. Use descriptive names: `010_add_clubs_table.sql`
3. Always include RLS policies for new tables
4. Document the migration in your PR description

## Environment

You need your own Supabase project and OpenAI API key for local development. The production database is not accessible to contributors.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

Open a discussion on GitHub or reach out on [X/Twitter](https://x.com/Tind_Ai).
