# Deploy IPL Auction Arena to Render

1. Create a new GitHub repository (for example `iplauctionbyabhi`) and upload this folder's contents (or run `git remote add origin <repo-url> && git push -u origin master`).
2. In Render: New > Blueprint, pick the repository. Render reads `render.yaml` and creates the web service.
3. The game will be at https://iplauctionbyabhi.onrender.com (if that name is taken, Render adds a suffix).

Notes
- The server listens on Render's PORT automatically.
- Free plan: the service sleeps after ~15 minutes idle (first visit takes ~1 minute to wake) and the local SQLite file (data.db) resets on each restart or redeploy. For permanent accounts and rooms, use a paid plan with a persistent disk mounted at /var/data and set the environment variable DB_PATH=/var/data/data.db.
