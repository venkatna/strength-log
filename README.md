# Strength Log

An offline-first, installable strength workout tracker designed for iPhone.

## Run locally

Service workers require HTTP rather than opening `index.html` directly:

```powershell
cd strength-log
python -m http.server 8080
```

Open `http://localhost:8080` on the same computer. To install on an iPhone, deploy this folder to an HTTPS static host, open it in Safari, and use **Share > Add to Home Screen**. Once loaded, the app works offline.

Workout data is stored only in the browser. Use the Backup screen to export it periodically to Files, iCloud Drive, or OneDrive.

The optional PIN is a device-local UI lock. It does not restrict access to the publicly hosted website or encrypt browser storage.
