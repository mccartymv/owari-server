# owari-server
Node.js server for owari sorting game

start the server via command line:

```
npm install
node server.js
```
make sure to add your personal Discogs API user token, Spotify API client ID and Spotify API client secret to the provided `preferences.json` file.

# Endpoints
## /get-all-artists-main-releases
Retrieves all of single artist's releases from the Discogs API. Sends results to front end. Concurrently requests Spotify API for `artist-name` and `popularity-score` information.

Handles pagination from the Discogs API while logging to console so the user can monitor progress when ran locally. Filters out releases lacking `{ type : "Main" }` attribute. Also filters out releases lacking a release year.

Server monitors API headers to adapt to rate limiting for requests for the Discogs API.

Optionally can save a random image of the Artist to project directory if `saveRandomArtistImage` is set to `true`.

## /

