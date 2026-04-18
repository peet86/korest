# KoRest 
Minimalistic, self-hosted **reading progress syncronization across your Readest Apps** 

KoRest is a tiny superlightweight drop in replacement for [KOReader Sync Server](https://github.com/koreader/koreader-sync-server). A tiny dockerized self-hosted script that lets your **Readest Apps** sync where you are in a book -across phones, tablets, and desktops— without sending that data to someone else’s cloud.

### Why bother self-hosting this?

KoRest gives Readest the same syncing experience as Readest Cloud or KOReader Sync, but with a tiny service you control.


## Quick start (Docker)

From this repository:

```bash
docker build -t korest:latest .
docker run -d --name korest -p 4242:4242 -v korest-data:/data korest:latest
```

or with Docker Compose: 

```bash
docker compose up -d
```

This builds the image, publishes port **4242**, and keeps the SQLite database in the named volume **`korest-data`** (see `docker-compose.yml`).

## Configuration (optional)

| Environment variable | Meaning |
|----------------------|--------|
| `PORT` | HTTP port (default **4242** in the Docker image and when running locally without `PORT`). |
| `KOSYNC_DATABASE_PATH` | Where SQLite stores data (default **`/data/kosync.db`**). |
| `LOG_INCOMING_REQUESTS` | `true` / `false` — extra request logging for debugging. |

### A word on privacy and HTTPS

KoRest stores whatever **login secret** your client sends (Readest follows the same pattern as KOReader here—typically a **hash**, not your plain-text password). Treat the SQLite file like any credential store. **Use HTTPS** in front of KoRest on the public internet so sync traffic is not readable in transit.

---

## Setup in Readest

![Readest menu: choose KOReader Sync, then enter your KoRest server URL and credentials](docs/korest.png)

Open the **menu** in Readest and choose **KOReader Sync**. Set the **custom sync server** to your KoRest URL, for example `https://sync.myserver.com`—use HTTPS when the server is reachable from the internet. Pick any **username** and **password** you like: KoRest will **create the account on first use** and store it in your database. Use the **same** username and password on every device so progress stays in sync. KoRest supports **multiple users**; each pair of credentials is isolated.

---

## Why this project exists

I already had a reading stack I liked: **Audiobookshelf** holds my audiobooks and ebooks, an **OPDS** bridge exposes those libraries to readers, and **Readest** is my go-to app for ebooks on every device. The missing piece was **reading progress**: picking up the same book on another phone or tablet without relying on someone else’s sync server. KoRest fills that gap—self-hosted, small, and built for that one job.

### A self-hosted stack that works well

| Role | What I use |
|------|----------------|
| **Library** | [Audiobookshelf](https://github.com/advplyr/audiobookshelf) — one place for audiobooks and ebooks. |
| **Reader** | [Readest](https://github.com/readest/readest) — open, capable ebook reader across devices. |
| **Audiobooks** | [Prologue](https://prologue-app.com/) — listens straight to my Audiobookshelf libraries. |
| **OPDS for Readest** | Something like [abs-opds](https://github.com/Vito0912/abs-opds) — self-hosted OPDS in front of Audiobookshelf so Readest can browse and open books. |
| **Progress sync** | **KoRest (this repo)** — keeps Readest in sync on where I left off, on hardware I control. |

---

## License

[MIT](LICENSE) — you may use and modify the project freely; keep the copyright notice so the author is credited.
