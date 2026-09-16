cd C:\Users\admin\Desktop\Job-Ops\contractor-portal
npm run push:production -- patch "Describe this update"

Choose one release type:

- patch: 1.0.1 -> 1.0.2 for fixes and small improvements
- minor: 1.0.1 -> 1.1.0 for backward-compatible features
- major: 1.0.1 -> 2.0.0 for breaking or major product changes

The command updates the version shown in the Home menu, publishes the production
update, and keeps the Expo store/runtime version unchanged. Commit app.json after
a successful push so the next release starts from the correct version.


npm run push:production -- patch "MESSAGE HERE"
npm run push:production -- minor "MESSAGE HERE"
npm run push:production -- major "MESSAGE HERE"