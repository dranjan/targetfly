var http = require('http');
var inspect = require('util').inspect;
var fs = require('fs');
var zlib = require('zlib');

var mime = require('mime');
var async = require('async');

var tarStream = require('./tarStream');

/* user-settable variables */

/* default variables to use for all views */
exports.locals = {};

/* function of HTTP status code that returns a view (or a false-ish
 * value if no suitable view exists)
 */
exports.errorPage = function (code) { return false; }

function httpError(code) {
    var err = new Error(http.STATUS_CODES[code]);
    err.status = code;
    return err;
};

exports.httpError = httpError;

http.ServerResponse.prototype.render = function (view, locals, code) {
    if (!code) code = 200;

    var renderLocals = {};

    for (var k in exports.locals) {
        renderLocals[k] = exports.locals[k];
    }

    for (var k in locals) {
        renderLocals[k] = locals[k];
    }

    var res = this;
    function writeHtml(err, html) {
        if (err) {
            res.statusCode = 500;
            console.log(err);
            res.end();
        } else {
            res.statusCode = code;
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Content-Length', html.length);
            res.end(html);
        }
    };

    async.waterfall([function (callback) {
        callback(null, view(renderLocals));
    }], writeHtml);
};

http.ServerResponse.prototype.redirect = function (location) {
    this.writeHead(302, {'Location': location});
    this.end();
};

/* XXX Refactor me... */
http.ServerResponse.prototype.genericError = function (err) {
    if (!this.headersSent) {
        this.removeHeader('Content-Type');
        this.removeHeader('Content-Disposition');
        this.removeHeader('Content-Encoding');
        this.removeHeader('Content-Length');
    } else {
        this.end();
        return;
    }

    var errStr = "";
    var s = 500;
    if (err) {
        errStr = inspect(err);
        console.log(errStr);
        s = err.status || 500;
    } 

    this.errorPage(s, {code:s, message:errStr});
};

http.ServerResponse.prototype.error404 = function () {
    this.errorPage(404);
};

http.ServerResponse.prototype.errorPage = function(code, locals) {
    this.statusCode = code;

    var v = exports.errorPage(code);
    if (v) this.render(v, locals);
    else this.end();
};

http.ServerResponse.prototype.sendGz = function (filepath, name)
{
    var self = this;

    try {
        var file = fs.createReadStream(filepath);
    } catch (err) {
        this.error404();
    }

    this.statusCode = 200;
    this.setHeader('Content-Type', 'application/octet-stream');
    this.setHeader("Content-Disposition",
                   "attachment; filename=" + name);

    file.on('error', function (err) {
        console.log(inspect(err));
        self.genericError(httpError(500));
    });

    var gzip = zlib.createGzip();
    file.pipe(gzip).pipe(this);
}

http.ServerResponse.prototype.sendFile = function (filepath, name)
{
    var self = this;

    try {
        var file = fs.createReadStream(filepath);
    } catch (err) {
        this.error404();
    }

    this.statusCode = 200;
    this.setHeader('Content-Type', mime.lookup(filepath));

    if (name) {
        this.setHeader("Content-Disposition",
                       "attachment; filename=" + name);
    }

    file.on('error', function (err) {
        console.log(inspect(err));
        self.genericError(httpError(500));
    });

    file.pipe(this);
}

http.ServerResponse.prototype.sendTgz = function(dirpath, name,
                                                 filter)
{
    var self = this;

    this.statusCode = 200;
    this.setHeader("Content-Type", "application/octet-stream");
    this.setHeader("Content-Disposition",
                   "attachment; filename=" + name);

    function error(err) {
        console.log(inspect(err));
        self.genericError(httpError(500));
    }

    var gzip = zlib.createGzip();
    tarStream(dirpath, filter, error).pipe(gzip).pipe(this);
}

http.ServerResponse.prototype.sendTar = function (dirpath, name,
                                                  filter)
{
    var self = this;

    this.statusCode = 200;
    this.setHeader("Content-Type", "application/octet-stream");
    this.setHeader("Content-Disposition",
                   "attachment; filename=" + name);

    function error(err) {
        console.log(inspect(err));
        self.genericError(httpError(500));
    }

    tarStream(dirpath, filter, error).pipe(this);
}


exports.http = http;
