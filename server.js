const app = require('express')();

const pino = require('pino-http')()
const cors = require('cors')
const bodyParser = require('body-parser');
const Promise = require('bluebird');
const fs = require('fs');
const _ = require('lodash');
const async = require('async');
const url = require('url');
const path = require('path');
const https = require('https');

const Discogs = require('disconnect').Client;
const SpotifyWebApi = require('spotify-web-api-node');

app.use(cors());
app.use(bodyParser.json());

const port = 3000

// Discogs API Rate Limit Controls
let perMinuteRateLimit = 50;
let rateLimitThrottleSeconds = 4;

const saveRandomArtistImage = false;

fs.readFile('preferences.json', (err, data) => {
    if (err) {
        throw new Error('preferences error: ' + err);
    }

    const preferences = JSON.parse(data);

    const db = new Discogs({userToken: preferences.discogsUserToken}).database();
    const dbMkt = new Discogs({userToken: preferences.discogsUserToken}).marketplace();
 
    const spotifyApi = new SpotifyWebApi({
        clientId: preferences.spotifyApi.clientId,
        clientSecret: preferences.spotifyApi.clientSecret
    });

    spotifyApi.clientCredentialsGrant().then(
        function(data) {
          console.log('Spotify API access token expires in ' + data.body['expires_in']/60 + " mins");
                
          // Save the access token so that it's used in future calls
          spotifyApi.setAccessToken(data.body['access_token']);
        },
        function(err) {
          console.log('Something went wrong when retrieving an access token', err);
        }
    );


app.post('/discogs/getAllArtistsMainReleases', (req, res) => {
    let responseObj = {};
    return new Promise(resolve => {

        // sanitize and validate input
        
        req.body['discogsId'] = req.body['discogsId'].trim();
        req.body['spotifyId'] = req.body['spotifyId'].trim();

        if (req.body.discogsId !== "" && req.body.spotifyApi !== "") {
            resolve(req.body);
        } else {
            throw 'blank id'
        }

    }).then(() => {
        return new Promise(resolve => {

            console.log("API - Spotify Artist Information: " + req.body.spotifyId);

            spotifyApi.getArtist(req.body.spotifyId)
            .then(
                function(data) {

                    responseObj['genres'] = data.body.genres;
                    responseObj['name'] = data.body.name;
                    responseObj['spotify-popularity'] = data.body.popularity;

                    resolve();
                })
            .catch((error) => {
                throw "Spotify API error " + error.body['error'].status + ": " + error.body['error'].message;
            });

        });    

    }).then(() => {
        return new Promise(resolve => {

            console.log("API - Spotify Artist Top Tracks: " + req.body.spotifyId);

            spotifyApi.getArtistTopTracks(req.body.spotifyId, 'US')
            .then(
                function(data) {

                    responseObj['top-tracks'] = data.body.tracks;

                    resolve();
                })
            .catch((error) => {
                throw "Spotify API error " + error.body['error'].status + ": " + error.body['error'].message;
            });

        }); 

    }).then(() => {
        return new Promise(resolve => {

            db.getArtist(req.body.discogsId, (err, results, rateLimit)  => {
                if (err) {
                    throw "Discogs API Artist error : " + err
                } 

                responseObj['profile'] = results.profile;

                if (/* results.images.length && **/ saveRandomArtistImage) {
                    let file = fs.createWriteStream("images/file.jpg");
                    let request = https.get(results.images[getRandomInt(results.images.length)].uri, function(response) {
                      response.pipe(file);
                      console.log("Artist Image Saved.");
                    });
                }



                resolve();
            });

        });
    }).then(() => {


        // discogs API request

        return new Promise(resolve => {
            discogsGetAllArtistsReleases(req.body.discogsId).then(mainReleases => {

                responseObj['discogsId'] = req.body.discogsId;
                responseObj['releases'] = mainReleases;
                resolve();
                
            });
        });

    }).then(() => {

        console.log("sending results to front end...");
        res.json(responseObj);

    }).catch(err => {
        console.log("error: " + err);
    });

});


/**
 * 
 * 
 * 
 *      Helper Functions
 * 
 * 
 * 
 */



    const discogsGetAllArtistsReleases = async (id) => {

        return new Promise(resolve => {

            let mainReleases = []
            let latestResults;

            db.getArtistReleases(id, {page: 1, per_page: 75}, (err, results, rateLimit)  => {
                if (err) {
                    throw new Error('discogs API - getArtistReleases error: ' + err);
                }

                latestResults = results;
                _.each(results.releases, (rel) => {
                    if (rel.role == "Main") {
                        mainReleases.push({ 
                            "title" : rel.title, 
                            "year" : rel.year, 
                            "id" : rel.id,
                            "type" : rel.type});
                        }
                });
                async.whilst(
                    (cb) => cb(null, latestResults['pagination'].urls.next),
                    (iteration_cb) => {
                        var q = url.parse(latestResults['pagination'].urls.next, true);
                        
                        console.log("Discogs API - Artist Releases Query Page " + q.query['page'] + " of " + latestResults['pagination'].pages + "...");

                        db.getArtistReleases(id, {page : q.query['page']}, (err, res, rateLimit)  => {
                            if (err) {
                                throw new Error('discogs API - getArtistReleases error: ' + err);
                            }

                            latestResults = res;
                            _.each(res.releases, (rel) => {
                                if (rel.role == "Main") {
                                    mainReleases.push({ 
                                        "title" : rel.title, 
                                        "year" : rel.year, 
                                        "id" : rel.id,
                                        "type" : rel.type});
                                    }
                            });

                            if (rateLimit['used'] > perMinuteRateLimit*0.9) {
                                sleep(rateLimitThrottleSeconds * 1000).then(() => {
                                    console.log("near Discogs API rate limit -- throttling requests\n" + JSON.stringify(rateLimit));
                                    iteration_cb(null, res);
                                });
                            } else {
                                iteration_cb(null, res);
                            }
                    });
                    
                    },
                    (err, results) => {
                        resolve(mainReleases);
                    }
                )
            });
        });
    }



    function getRandomInt(max) {
        return Math.floor(Math.random() * max);
    }


    app.listen(port, () => {
        console.log(`Example app listening on port ${port}`)
    })

});
