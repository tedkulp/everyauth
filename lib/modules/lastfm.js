var everyModule = require('./everymodule')
  , url = require('url')
  , querystring = require('querystring')
  , extractHostname = require('../utils').extractHostname
  , crypto = require("crypto")
  , request = require('request');

var lastfm = module.exports =
everyModule.submodule('lastfm')
  .configurable({
      appId: 'the api key provided by Last.fm'
    , appSecret: 'the api secret provided by Last.fm'
    , redirectPath: 'Where to redirect to after a failed or successful authorization'
    , myHostname: 'e.g., http://local.host:3000 . Notice no trailing slash'
    , alwaysDetectHostname: 'does not cache myHostname once. Instead, re-detect it on every request. Good for multiple subdomain architectures'
  })
  .get('entryPath',
      'the link a user follows, whereupon you redirect them to the 3rd party OAuth provider dialog - e.g., "/auth/facebook"')
    .step('getAuthUri')
      .accepts('req res next')
      .promises('authUri')
    .step('requestAuthUri')
      .accepts('res authUri')
      .promises(null)

  .get('callbackPath',
       'the callback path that the 3rd party OAuth provider redirects to after an OAuth authorization result - e.g., "/auth/facebook/callback"')
    .step('getAuthToken')
      .description('retrieves a token from the url query')
      .accepts('req res next')
      .promises('authToken')
    .step('getSession')
      .accepts('req')
      .promises('session')
    .step('getSessionToken')
      .description('retrieves a token from the url query')
      .accepts('authToken')
      .promises('sessionToken user')
    .step('findOrCreateUser')
      .accepts('session sessionToken user')
      .promises('user')
    .step('sendResponse')
      .accepts('res')
      .promises(null)
  .getAuthUri( function (req, res, next) {
    // Automatic hostname detection + assignment
    if (!this._myHostname || this._alwaysDetectHostname) {
      this.myHostname(extractHostname(req));
    }

    var params = {
        api_key: this._appId
      , cb: this._myHostname + this._callbackPath
    }
    var url = 'http://www.last.fm/api/auth/';
    return url + '?' + querystring.stringify(params);
  })
  .requestAuthUri( function (res, authUri) {
    this.redirect(res, authUri);
  })
  .getAuthToken( function (req, res, next) {
    var parsedUrl = url.parse(req.url, true);
    if (!parsedUrl.query || !parsedUrl.query.token) {
      console.error("Missing token in querystring. The url looks like " + req.url);
    }
    return parsedUrl.query && parsedUrl.query.token;
  })
  .getSession( function(req) {
    return req.session;
  })
  .getSessionToken( function (authToken) {
    var p = this.Promise();
    var params = {
        method: 'auth.getSession'
      , api_key: this._appId
      , token: authToken
      , format: 'json'
    }
    params.api_sig = this.createSignature(params, this._appSecret);
    opts = {url: 'http://ws.audioscrobbler.com/2.0/', qs: params}
    request.get(opts, function (err, res, body) {
      if (err) {
        err.extra = {data: body, res: res};
        return p.fail(err);
      }
      data = JSON.parse(body);
      p.fulfill(data.session.key, data);
    });

    return p;
  })
  .sendResponse( function (res) {
    var redirectTo = this._redirectPath;
    if (!redirectTo)
      throw new Error('You must configure a redirectPath');
    this.redirect(res, redirectTo);
  })

// From https://github.com/jammus/lastfm-node/blob/master/lib/lastfm/lastfm-request.js
lastfm.createSignature = function (params, secret) {
  var sig = "";
  Object.keys(params).sort().forEach(function(key) {
    if (key != "format") {
      var value = typeof params[key] !== "undefined" && params[key] !== null ? params[key] : "";
      sig += key + value;
    }
  });
  sig += secret;
  return crypto.createHash("md5").update(sig, "utf8").digest("hex");
}
