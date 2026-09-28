# Chargebacks (Power Apps export)

The disputes team's canvas app and its two Power Automate flows, exported for the move into
the console. Screens and formulas were unpacked to YAML; the flows are their definitions as
exported from Power Automate. The data source is a SharePoint list, `Disputes`, and
`Data/disputes.csv` is a snapshot of it.

Everything here is invented for the demo: merchants, amounts and dispute ids.

The snapshot was taken on 28 September 2026 at 09:00 UTC. Deadlines only mean something
relative to that moment, so a seed should keep each date's offset from it rather than the
date itself: three open disputes over $1,000 fall due within 48 hours.

| File | What it is |
| --- | --- |
| `Src/App.pa.yaml` | App settings and the data source |
| `Src/DisputesScreen.pa.yaml` | The queue: open disputes, soonest deadline first |
| `Src/DisputeDetailScreen.pa.yaml` | One dispute, with Accept, Fight and Request evidence |
| `Workflows/DeadlineAlert.json` | Hourly: emails the team lead about big disputes due soon, and closes missed ones |
| `Workflows/FightApproval.json` | Sends a large fight to a team lead to approve |
| `Data/disputes.csv` | 50 disputes from the SharePoint list |
