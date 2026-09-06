# Repertoire

A private, local-first chess opening trainer with spaced repetition. Record your own opening lines by playing legal moves on the board, then practice them from the side you chose.

## Features

- Full chess move validation powered by `chess.js`
- Standard draggable chess pieces with click-to-move support
- Board flipping in Teach mode; the bottom side becomes your practice side
- Teach, Learn, Practice, and Library views
- Automatic opponent replies during reviews
- Immediate move feedback and a wooden move sound generated in the browser
- SRS intervals of 1, 3, 7, 14, 30, 60, and 120 days
- Failed lines drop one SRS level and return later in the same session
- All repertoire and review data stays in the browser's local storage
- Responsive layout for desktop and smaller screens

## Run locally

Requirements: Node.js 22.13 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

For a production-style local run:

```bash
pnpm build
pnpm start
```

## How to use it

1. Open **Teach** and play a legal line for both sides from the starting position.
2. Flip the board if you want to practice the line as Black.
3. Finish the line, give it a name, then add it to SRS now or save it for Learn mode.
4. Use **Practice as White** or **Practice as Black** when reviews are due.
5. In a review, play only your side; the trainer automatically plays the opponent's recorded moves.

## Data and privacy

This app has no accounts, analytics, remote database, or cloud sync. Data is stored under the key `repertoire-opening-lines-v1` in the browser profile used to open the app. Clearing site data for localhost will erase the repertoire.

## Development

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

The generated component library currently contains a few upstream lint findings; the application source itself passes the focused lint and type checks.

## AI disclosure

This project was designed and implemented by OpenAI Codex at the user's direction. The feature requirements, product decisions, and final ownership belong to the repository owner. See [AI_DISCLOSURE.md](AI_DISCLOSURE.md).

## License

MIT — see [LICENSE](LICENSE).
