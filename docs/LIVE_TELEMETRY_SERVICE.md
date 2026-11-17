# Running the NETSCOPE VM uploader with systemd

This unit runs the existing read-only telemetry collector on the Ubuntu lab VM
and uploads the latest snapshot to the authenticated backend. It is separate from
the public Flask service: the backend never gets Docker access. The collector
does run bounded ICMP probes between the configured lab router adjacencies once
per upload cycle, so only enable it for the isolated PS-035 lab.

## Before installation

1. Confirm this is the Ubuntu VM that owns the isolated Containerlab Docker
   daemon, and that `/home/ayush/ps035` contains the current NETSCOPE revision.
   If that checkout has uncommitted changes or has not been safely updated, stop
   and preserve/reconcile it before proceeding. Do not reset it to make it match.
2. Complete the backend setup in `docs/DEPLOYMENT.md`: Firestore storage enabled,
   Admin credentials installed only as a backend secret file, the private
   `_netscope_private/**` browser rules independently verified, and a strong
   matching ingest token configured on Render and the VM.
3. From the repository root, verify the collector can load and the expected lab
   containers are present:

   ```sh
   python3 -m app.collector.telemetry --help
   python3 -m app.collector.fault_lab list
   python3 -m app.collector.fault_lab check
   ```

   These checks do not alter router configuration. `check` only reads container
   state. If the topology, Docker context, or container inventory is unexpected,
   do not install or start the service.

## Install and configure

The checked-in unit assumes the VM account is `ayush`, the checkout is
`/home/ayush/ps035`, and Docker grants that account read/exec access. Review those
values before installation if the VM differs.

Create `/etc/netscope/telemetry.env` as a root-owned file with mode `0600`:

```ini
NETSCOPE_UPLOAD_URL=https://YOUR-RENDER-SERVICE.onrender.com/api/telemetry/ingest
NETSCOPE_INGEST_TOKEN=PASTE_THE_SAME_RANDOM_SECRET_CONFIGURED_ON_RENDER
```

Keep the token out of shell history, Git, screenshots and chat. The URL must be
HTTPS and the token must be at least 32 characters. The collector does not need a
Firebase Admin key; Firestore access stays on the backend.

Install the unit from the repository root and start it only after the preflight
and backend checks above pass:

```sh
sudo install -o root -g root -m 0644 deploy/systemd/netscope-telemetry.service /etc/systemd/system/netscope-telemetry.service
sudo systemctl daemon-reload
sudo systemctl enable --now netscope-telemetry.service
```

## Verify and stop

Check that the service is active and that the latest upload succeeds. Logs never
print the bearer token:

```sh
sudo systemctl status netscope-telemetry.service --no-pager
sudo journalctl -u netscope-telemetry.service -n 50 --no-pager
```

An `Upload failed: <exception type>` line is intentionally redacted. Check VM
network reachability, service configuration and Render availability without
printing the environment file. Then sign in to NETSCOPE and confirm Live shows a
recent timestamp and all five routers. A healthy service process alone does not
prove that Firestore accepted or displayed telemetry.

To stop polling and uploads:

```sh
sudo systemctl disable --now netscope-telemetry.service
```

At the configured one-minute interval, successful uploads create up to 1,440
Firestore writes per day. Check the project's free quota before leaving the
service enabled. The Render free service may sleep and Live data can become stale
until it wakes. No fault scenario is run by this unit.
