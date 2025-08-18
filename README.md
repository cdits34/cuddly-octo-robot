# Firebase Chatroom (Public + Private DMs)

Features:
- Google Sign-In (shows name + photo)
- Public chat room
- Private DMs by entering the recipient's Google email
- Upload/send images, videos, and general files (Storage), linked inside messages
- Firestore for messages
- Static site (just host these files anywhere)

## Setup

1. Create a Firebase project → Web app.
2. Enable: Authentication (Google provider), Firestore, Storage.
3. Copy your web app config and replace the `firebaseConfig` in `app.js`.
4. Deploy Firestore & Storage security rules (optional but recommended):
   - Firestore rules → `firestore.rules`
   - Storage rules → `storage.rules`
5. Open `index.html` via a local server or host online (GitHub Pages, Netlify, etc.).

## Notes
- Users must sign in at least once for their email to be discoverable for DMs.
- Chat ID is deterministic: the two UIDs sorted and joined with `_`.
- Tweak UI/UX in `style.css` as you like.
