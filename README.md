# Wordstack

Swipe-style flash cards for learning languages, built as an installable web
app (PWA) for iPhone. No App Store, no build step: open it in Safari and add
it to your home screen for a full-screen, app-like experience that works
offline.

## Features

- **Separate decks per language.** Tap the language name at the top to
  switch, add, rename or delete one. Each language has its own words, tags
  and progress.
- **Add your own words** one at a time (English, translation, tags, optional
  note), or paste a whole list:

  ```
  the dog = el perro #animals
  the hand = la mano #body parts
  to eat = comer #food #verbs
  ```

  A tab also works as the separator, so two columns pasted from a
  spreadsheet go straight in.
- **Tested both ways.** English → language, language → English, or both.
  Each direction is tracked separately.
- **Tags.** Practice every word, or pick one or more tags.
- **Swipe to answer.** Tap the card to flip it, swipe right if you knew it,
  left if you didn't. There are buttons for the same thing.
- **Missed words come back more often** (spaced repetition, Leitner boxes).
  A right answer moves a card up a box and pushes its next review out:
  1, 2, 4, 8, 16, then 35 days. A miss drops it back to box 0, so it's due
  straight away, and it comes back again 3–5 cards later in the same session.
  In **Shuffle** mode, cards you miss more often are picked more often.
- **Gamification:** XP with a combo bonus, levels, a daily goal and day
  streak, a 12-week activity chart, 16 achievements, per-language mastery
  bars, a "trickiest words" list, and a post-session summary with a one-tap
  drill of the words you missed.
- **Pronunciation:** a speaker button reads the foreign word aloud for common
  languages, using the phone's built-in voices.

## Where your data lives

Everything is saved on the device (browser `localStorage`), like Footy Stats
Counter. There's no account and no server. It works fully offline.

This means your words don't sync between devices. Use **Progress → Backup →
Save backup** now and then to save a `.json` file (to Files or iCloud Drive),
and **Restore from backup** to load it onto another phone.

On iPhone, the home-screen app and Safari keep **separate** storage, so add
words from inside the installed app, not from a Safari tab.

## Install on iPhone

1. Open the GitHub Pages link in **Safari** on your iPhone.
2. Tap the **Share** icon, then **Add to Home Screen** (not "Add Bookmark").
3. Launch it from the home screen icon. It opens full-screen, no browser bar.

## Hosting (GitHub Pages)

1. On GitHub, open this repo → **Settings** → **Pages** (left sidebar).
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Branch: **main**, folder: **/ (root)**. Tap **Save**.
4. Wait a minute or two, then refresh the page. The site's address appears
   at the top: `https://jaspertwigg.github.io/language-app/`.

Updates pushed to `main` go live after a minute or so. The service worker is
network-first, so the installed app picks up the new version the next time
it's opened with signal.

### Quick local testing

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Project structure

```
index.html            App shell and home-screen/PWA tags
styles.css            Styles (light and dark themes)
app.js                App logic: storage, scheduling, swiping, stats
manifest.webmanifest  PWA metadata (name, icons, colours)
service-worker.js     Offline caching (network-first)
icons/                App icons for home screen
```
