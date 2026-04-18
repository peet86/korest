# KoRest

**Your own server for Readest reading progress**

KoRest is a tiny self-hosted service that lets **Readest** sync where you are in a book—across phones, tablets, and desktops—without sending that data to someone else’s cloud. You run it, you own the progress database.

---

## Why bother self-hosting this?

Readest can sync reading position through the same mechanism **KOReader** has used for years. The usual options are a **public sync server** (you don’t control it, you don’t know who runs it) or **no sync** (you lose progress when you switch devices). KoRest is the middle path: **the same behaviour in Readest**, but the sync endpoint is **a box you control**. Your books stay where you already keep them; only **progress metadata** hits KoRest.

---

## What you get

- Progress and percentage (and a little device label) stored in a **SQLite** file on your self-hosted machine.
- **No** audiobook library, **no** book hosting, **no** accounts on a third-party sync product—just sync.
- Fits behind **HTTPS** with a reverse proxy (Caddy, Traefik, nginx, etc.) like any small web service.

---

## Why this project exists

I already had a reading stack I liked: **Audiobookshelf** holds my audiobooks and ebooks, an **OPDS** bridge exposes those libraries to readers, and **Readest** is my go-to app for ebooks on every device. The missing piece was **reading progress**: picking up the same book on another phone or tablet without relying on someone else’s sync server. KoRest fills that gap—self-hosted, small, and built for that one job.

### A stack that works well together

| Role | What I use |
|------|----------------|
| **Library** | [Audiobookshelf](https://github.com/advplyr/audiobookshelf) — one place for audiobooks and ebooks. |
| **Reader** | [Readest](https://github.com/readest/readest) — open, capable ebook reader across devices. |
| **Audiobooks** | [Prologue](https://prologue-app.com/) — listens straight to my Audiobookshelf libraries. |
| **OPDS for Readest** | Something like [abs-opds](https://github.com/Vito0912/abs-opds) — self-hosted OPDS in front of Audiobookshelf so Readest can browse and open books. |
| **Progress sync** | **KoRest (this repo)** — keeps Readest in sync on where I left off, on hardware I control. |

Together: library in Audiobookshelf, discover and read in Readest, listen in Prologue, and **KoRest** so Readest always remembers my place.

---

## Quick start (Docker)

From this repository:

```bash
docker build -t korest .
docker run -d --name korest -p 4242:4242 -v korest-data:/data korest:latest
```

Then put **`https://your-domain.example`** (or `http://…` only on a trusted network) into Readest as the **KOReader / kosync** sync server address, **register once** in Readest so the app creates your user on KoRest, and sync should start working.

Default data path in the image is **`/data/kosync.db`** inside the container—keep the `/data` volume if you care about backups.

---

## Configuration (optional)

| Environment variable | Meaning |
|----------------------|--------|
| `PORT` | HTTP port (default **4242** in the Docker image and when running locally without `PORT`). |
| `KOSYNC_DATABASE_PATH` | Where SQLite stores data (default **`/data/kosync.db`**). |
| `LOG_INCOMING_REQUESTS` | `true` / `false` — extra request logging for debugging. |

---

## A word on privacy and HTTPS

KoRest stores whatever **login secret** your client sends (Readest follows the same pattern as KOReader here—typically a **hash**, not your plain-text password). Treat the SQLite file like any credential store. **Use HTTPS** in front of KoRest on the public internet so sync traffic is not readable in transit.

---

## License

See the repository root (or add a `LICENSE` file here) for how this project is licensed when published on GitHub.
