# Town Square – Blood on the Clocktower companion (GitHub Pages + Firebase)

A live circular Grimoire and Town Square for running **Trouble Brewing** with office colleagues, either in the same room or remotely.
The layout follows the style of clocktower.online (bra1n/townsquare), but this is an independent implementation: no code, artwork or icons were copied from that project.

## Features
- Circular Town Square with parchment character tokens, name plates, shrouds for dead players and ghost-vote markers
- **Fixed seating:** the Storyteller enters names in sitting order and players tap their own name to sit. The order is saved in Firebase and never changes unless the Storyteller moves a seat.
- One device per seat. A seat cannot be claimed twice.
- Storyteller Grimoire with real character, “shown as” character (Drunk), reminder tokens, Demon bluffs and a red herring. Press **G** to hide it before screen-sharing.
- Random Trouble Brewing deal for 5–15 players, including Baron adjustment, Drunk and red herring
- Send characters, private night information and evil-team information to each player's phone
- First-night and other-night order with **Wake** buttons. Woken players get a private action screen and everyone else sees a night sky.
- **Public voting:** players raise hands on their phones, and a clock hand sweeps around the circle, locking votes visibly. Dead players use their ghost vote automatically.
- **Storyteller-controlled messaging:**
  - Public chat: everyone, selected players only, or off
  - Private chat: only Storyteller-approved pairs, or quick “neighbours” and “everyone” presets
  - Storyteller sees all messages and can message everyone or any player privately
- Private notes for each player, a character reference sheet and four-digit `#8565` join links

## Files
| File | Purpose |
|---|---|
| index.html | Page layout |
| styles.css | Visual design |
| app.js | Game logic and Firebase |
| roles.js | Trouble Brewing characters, counts and night order |
| firebase-config.js | Your Firebase project (botc-517ec) |
| firestore.rules | Security rules. Paste these into the Firebase console. |
| assets/background.jpg | Town-square background |
| .nojekyll | Lets GitHub Pages serve files as-is |

## Firebase setup (one time)
1. **Authentication → Sign-in method:** enable **Google** and **Anonymous**.
2. **Authentication → Settings → Authorized domains:** add `YOUR-GITHUB-NAME.github.io`.
3. **Firestore Database → Rules:** delete everything, paste the full `firestore.rules`, then click **Publish**.

## GitHub Pages
1. Delete the old game files from the repository.
2. Upload all files in this folder, including the `assets` folder, to the repository root.
3. Go to **Settings → Pages → Deploy from a branch → main / (root)**.
4. Open `https://YOUR-GITHUB-NAME.github.io/REPO-NAME/` and press **Ctrl + F5**.

## How to run a game
1. **Storyteller:** Host as Storyteller, then Create new session. Enter names clockwise in sitting order.
2. Open **☰ → Copy join link** and share it on Teams or WhatsApp.
3. **Players:** open the link, then tap their own name in the circle.
4. **Storyteller:** ☰ → Deal random characters, check the Grimoire, then ☰ → Send characters.
5. Start the night. Use 🌙 Night order to wake players one by one and send their information with **Info**.
6. Start the day. Use ⚖ Nomination, then players raise hands. Click **Start vote** and the clock counts them publicly. Click **Execute** if needed.
7. Use ☰ → Messaging controls to decide who may chat publicly and privately.

**Testing tip:** use a normal window for the Storyteller and an **Incognito/InPrivate** window or a phone for each test player. A browser signed in as Storyteller always opens the Storyteller view.

## Troubleshooting
| Message | Fix |
|---|---|
| auth/unauthorized-domain | Add your github.io domain to Authorized domains. |
| Permission denied | Publish the new firestore.rules. Old rules from earlier versions will not work. |
| Enable Google and Anonymous sign-in | Turn both on in Authentication → Sign-in method. |
| Old screen still showing | Press Ctrl + F5 and wait 1–2 minutes after uploading for GitHub Pages to redeploy. |

## Credits
- Blood on the Clocktower is a trademark of Steven Medway and The Pandemonium Institute. This is an unofficial fan-made tool and is not affiliated with them.
- Character ability lines are short paraphrases. Use the official character sheet for exact wording.
- Layout inspired by the open-source Town Square project (bra1n/townsquare, GPL-3.0). No source code or assets from it are included.
- Visual in this file was generated with Microsoft Copilot (assets/background.jpg).

## Assigned-seat PIN login and Travellers
- The Storyteller creates seats clockwise. A unique 4-digit PIN is generated for each player.
- Players join with **session code + exact assigned name + PIN**. Players cannot select another seat.
- The Storyteller can release a device or generate a new PIN from that player's seat panel.
- PIN lookup uses a SHA-256 join key; PINs and the PIN list are kept in the Storyteller-only Grimoire document.
- Five Trouble Brewing Travellers are included: **Thief, Bureaucrat, Gunslinger, Scapegoat and Beggar**.
- Add a Traveller as a normal assigned player, open that seat as Storyteller, select the Traveller character, and choose **Good** or **Evil** alignment.
- Travellers are excluded from the normal Townsfolk/Outsider/Minion/Demon setup count and are not included in random deals or Demon bluffs.
- Thief and Bureaucrat appear in the night order. Daytime Traveller effects remain Storyteller-resolved using reminder tokens.
- Publish the included `firestore.rules`; earlier rules do not permit the secure join-key flow.
