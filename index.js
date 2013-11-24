var url = require('url');
var fs = require('fs');
var inspect = require('util').inspect;
var path = require('path');
var domain = require('domain');

var async = require('async');

var engine = require('./engine');
var recursiveSize = require('./recursiveSize');
var formatting = require('./formatting');
var config = require('./config');
var views = require('./views');


var root = config.root;
var http = engine.http;
var httpError = engine.httpError;

var static = path.join(__dirname, "static");

engine.locals = {
    version: config.version,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    formatSize: formatting.formatSize,
    formatDateFull: formatting.formatDateFull
};

engine.errorPage = function (code) {
    if (code == 404) return views['404'];
    else return views['error'];
};

function serve(port) {
    function onRequest(request, response) {
        console.log(request.connection.remoteAddress + " " +
                    request.method + " " + request.url);

        var requestUrl = url.parse(request.url);
        var pathname = requestUrl.pathname;

        var dom = domain.create();
        dom.on('error', function (err) {
            console.log(inspect(err));
            response.statusCode = 500;
            response.end();
        });

        response.on('end', function () { dom.dispose(); });

        if (redirects[pathname]) {
            response.redirect(redirects[pathname]);
        } else {
            var components = pathname.split('/');
            var handler = routes[components[1]];
            if (handler) {
                dom.run(function () {
                    handler(components.slice(2).join('/'), response);
                });
            } else {
                response.error404();
            }
        }
    }

    http.createServer(onRequest).listen(port);
    console.log("Serving " + root + " on port " + String(port) + "...");
}

var redirects = {
    '/browse': '/browse/',
    '/download': '/download/',
    '/download-gzip': '/download-gzip/',
    '/measure': '/measure/',
    '/': '/browse/'
};

function validatePath(pathname) {
    var components = pathname.split('/');

    for (var i in components) {
        if (excludeComponent(components[i])) {
            return false;
        }
    }
    return true;
}


function excludeComponent(f) {
    if (f === '.' || f === '..') return true;
    if (!config.showHidden && (f[0] === '.')) return true;
    if (!config.showBackup && (f[0] === '#' || f[f.length-1] === '~')) {
        return true;
    }

    return false;
}

function includeComponent(f) { return !excludeComponent(f); }

routes = {
    'browse': function (pathname, response) {
        if (!validatePath(pathname)) {
            response.error404();
            return;
        }

        var truePath = path.resolve(root, pathname);
        fs.stat(truePath, function (err, stats) {
            if (err) {
                response.error404();
            } else if (stats.isDirectory()) {
                var dirpath = '/' + pathname;
                if (dirpath[dirpath.length-1] !== '/') {
                    dirpath = dirpath + '/';
                }

                dirInfo(truePath, function (err, files) {
                    if (err) {
                        response.genericError(err);
                    } else {
                        response.render(views['directory'], {
                            files: files,
                            path: dirpath,
                            date: new Date()
                        });
                    }
                });
            } else {
                response.sendFile(truePath);
            }
        });
    },

    'download': function (pathname, response) {
        if (!validatePath(pathname)) {
            response.error404();
            return;
        }

        var truePath = path.resolve(root, pathname);
        fs.stat(truePath, function (err, stats) {
            if (pathname == '') {
                var filename = 'root';
            } else {
                var filename = path.basename(pathname);
            }

            if (err) {
                response.error404();
            } else if (stats.isDirectory()) {
                filename += ".tar";
                response.sendTar(truePath, filename, includeComponent);
            } else {
                response.sendFile(truePath, filename);
            }
        });
    },

    'download-gzip': function (pathname, response) {
        if (!validatePath(pathname)) {
            response.error404();
            return;
        }

        var truePath = path.resolve(root, pathname);
        fs.stat(truePath, function (err, stats) {
            if (pathname == '') {
                var filename = 'root';
            } else {
                var filename = path.basename(pathname);
            }

            if (err) {
                response.error404();
            } else if (stats.isDirectory()) {
                filename += ".tar.gz";
                response.sendTgz(truePath, filename, includeComponent);
            } else {
                filename += ".gz";
                response.sendGz(truePath, filename);
            }
        });
    },

    'static': function (pathname, response) {
        var components = pathname.split('/');
        for (var i in components) {
            c = components[i];
            if (c[0] === '.' ||
                c[0] === '#' || c[c.length-1] === '~')
            {
                response.error404();
            }
        }

        var truePath = path.resolve(static, pathname);

        fs.stat(truePath, function(err, stats) {
            if (err) {
                response.error404();
            } else if (stats.isDirectory()) {
                response.genericError(httpError(403));
            } else {
                response.sendFile(truePath);
            }
        });
    },

    'measure': function (pathname, response) {
        if (!validatePath(pathname)) {
            response.error404();
            return;
        }

        var truePath = path.resolve(root, pathname);
        recursiveSize(truePath, function (dirname, filename) {
            return !excludeComponent(filename);
        },
        function (err, sz, nf, nd) {
            if (err) {
                response.error404();
            } else {
                response.writeHead(200, {
                    'Content-Type': 'application/json'
                });
                response.end(JSON.stringify({
                    size : sz,
                    numFiles: nf,
                    numDirectories: nd
                }));
            }
        });
    }
};


/* callback is callback(err, files), where files is an array whose
 * entries are {name:filename, stat:stats}.  The 'stat' field can be
 * null (if stat-ing the file failed).  The array contains an entry for
 * each non-excluded file in the top level of the given directory.
 */
function dirInfo(dirpath, callback) {
    function fileInfo(filename, callback) {
        var tasks = {};
        var filepath = path.join(dirpath, filename);

        tasks.name = function (callback) {
            callback(null, filename);
        };

        tasks.stats = function (callback) {
            fs.stat(filepath, function (err, stats) {
                if (err) {
                    callback(null, null);
                } else {
                    callback(null, stats);
                }
            });
        };

        tasks.readable = function (callback) {
            fileReadable(filepath, callback);
        };

        async.parallel(tasks, callback);
    }

    fs.readdir(dirpath, function (err, files) {
        if (err) {
            callback(err);
        } else {
            async.filter(files, function (item, fn) {
                fn(!excludeComponent(item));
            },
            function (files) {
                async.map(files, fileInfo, callback);
            });
        }
    });
}

function fileReadable(filename, callback) {
    fs.open(filename, "r", function (err, fd) {
        if (err) {
            callback(null, false);
        } else {
            fs.close(fd, function (err) {
                if (err) callback(err);
                else callback(null, true);
            });
        }
    });
}

serve(config.port);
