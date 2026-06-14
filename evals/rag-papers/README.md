# Candidate papers for the cross-lingual recall probe

Drop **3–5 open-access hypertrophy papers** here as `.txt` or `.md` files, then run:

```
npm run probe:recall
```

## How to get the text

Use **PMC XML/HTML full text, not PDF** (PDF column/table parsing is brittle —
this is the same extraction decision the spec locks for v1 ingestion). For a
probe, a rough strip to plain text is fine: open the PMC HTML article, copy the
body text, paste into a `.txt` file here. One file per paper.

## Candidate seed (confirm CC license + PMC full text before using in v1)

- Schoenfeld et al. — resistance training **volume** meta-analysis (PMC8884877)
- Schoenfeld et al. — training **frequency** review
- A **progressive-overload / RIR–RPE** source

## Notes

- Filenames become the citation id prefix in the probe output (e.g.
  `schoenfeld-volume.txt#3`), so name them meaningfully.
- This folder's `.txt`/`.md` papers are git-ignored by default (see
  `.gitignore`) so you don't commit copyrighted full text. Only this README is
  tracked.
