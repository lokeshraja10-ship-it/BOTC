# BOTC Digital Storyteller

A Firebase-backed, GitHub Pages-ready social deduction game for one Game Master and 6-15 office players. It is an original implementation inspired by live Storyteller-led deduction games. Do not copy official Blood on the Clocktower art, text, role scripts, or branding into this project.

## Features
- Google sign-in for the Game Master; anonymous sign-in for players
- Six-character game code and reusable 4-digit player PIN
- GM setup, add/remove players, automatic role distribution and role assignment
- Private player identity and ability screen
- Live town square showing alive/dead status, phase, day and announcements
- GM-controlled day/night cycle, nominations, votes, death and resurrection
- Night queue, private information messages and action submissions
- Player notes saved privately to their own account record
- Full GM event log, manual win declaration and game reset
- Firestore security rules based on owner UID and player UID

## Firebase setup (about 15 minutes)
1. Create a Firebase project and add a Web App.
2. In Authentication > Sign-in method, enable **Google** and **Anonymous**.
3. Create a Firestore database.
4. Copy `firebase-config.example.js` to `firebase-config.js` and paste your Firebase web configuration.
5. Replace Firestore Rules with `firestore.rules` and publish.
6. In Authentication > Settings > Authorized domains, add your GitHub Pages domain, such as `lokesh.github.io`.

## GitHub Pages
1. Create a public or private repository and upload all files from this folder. Do not upload service-account keys; this project does not need one.
2. Ensure the real `firebase-config.js` is included. Firebase web config is not a server secret; security comes from Authentication and Firestore Rules.
3. Repository Settings > Pages > Deploy from branch > `main` / root.
4. Open the Pages URL, choose Game Master, sign in, and create a game.

## First session recommendation
Use 8-10 players plus one GM. Begin with: Analyst, Receptionist, Investigator, Medic, Watchman, Intern, Saboteur, Director. Keep the first game to roughly 75-100 minutes.

## Important operational note
The GM remains the referee. The app records choices and information but does not automatically resolve every role interaction. This is intentional: misinformation, protection, poisoning, conversion and special rulings require GM judgment.

## Revised BOTC mode
This build uses the original Trouble Brewing character names and official player-count role distributions. It intentionally does not reproduce copyrighted almanac/character ability text; use your legally obtained official character sheets and Storyteller reference for exact abilities and rulings.

### Public voting
Nominations and vote totals are public to all connected players. The design supports tracking a dead player's remaining ghost vote; the Storyteller remains responsible for confirming valid votes and executions.

### Remote / hybrid play
The application is designed for players using separate phones or browsers, so players do not have to be physically together. Use Teams, Zoom, Google Meet, or another voice/video channel for public town discussion. During night, private prompts/actions and Storyteller information use the Firebase app.

### Storyteller control
The web app is a companion, not an automated rules engine. The Storyteller controls private information, poisoning/drunkenness, role display versus actual role, deaths, nominations, executions, special interactions, and final outcomes.

## Stable seating and controlled messaging
- Every player receives a persistent `seat` value at first join. Town Square and Grimoire always sort by this value, so reopening/reloading does not change seating order.
- The Storyteller can allow selected players to send public messages.
- The Storyteller can authorize individual private-message pairs.
- The Storyteller can see the full public/private conversation monitor.
- Session links use a four-digit URL hash, for example `https://yourname.github.io/repository/#8565`.
- Replace the published Firestore rules whenever deploying this version.

## Circular Town Square user interface
This edition replaces the earlier card-first screen with an original circular Town Square/Grimoire interaction model: persistent seats around a central day/night area, public nomination overlay, Storyteller role labels, and a right-side control drawer. It is an original implementation and does not copy proprietary visual assets from clocktower.online.

## GM-assigned seats + PINs (latest revision)
- Players **cannot choose a seat**.
- Storyteller opens Setup and adds players in exact clockwise seating order.
- For each player, enter a 4-digit PIN or leave PIN blank to auto-generate one.
- Give each player only their **session code + assigned name + PIN**.
- Player enters those three values; the app automatically binds the device to the assigned seat.
- A linked seat cannot be taken from another device. Storyteller can use **Reset device** if a player changes phone/browser.
- Seating position persists across refresh/reopen and can be changed only by the Storyteller.
- This version requires the `firestore.rules` shipped in this package to be published in Firebase.
