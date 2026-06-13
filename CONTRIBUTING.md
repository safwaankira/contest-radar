# Contributing

Thanks for improving Bounty Radar. The project is intentionally small: static HTML, CSS, and JavaScript that can run on GitHub Pages without a backend.

## Good First Contributions

- Add a payout rail detector with a clear validation rule and a short README note.
- Improve the scoring model without hiding how the score is calculated.
- Add a preset for a real paid-work ecosystem with public GitHub issue evidence.
- Improve CSV exports or saved watchlists without sending data to a server.

## Design Rules

- Keep the app runnable by opening `index.html` through a static server.
- Do not add analytics, trackers, or server-side collection of GitHub tokens.
- Treat bounty detection as a triage heuristic, not proof that payment is guaranteed.
- Prefer small, inspectable changes over framework rewrites.

## Local Check

```bash
python3 -m http.server 8080
node --check app.js
```

Then open http://localhost:8080 and run at least one preset scan.
